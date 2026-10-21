begin;
create table public.voice_match_sessions(
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 minutes',
 cancelled boolean not null default false, check(user_a<>user_b)
);
create table public.voice_match_queue(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 gender_pref text check(gender_pref in ('male','female')),
 touched_at timestamptz not null default now(),
 session_id uuid references public.voice_match_sessions(id) on delete set null
);
alter table public.voice_match_sessions enable row level security;
alter table public.voice_match_queue enable row level security;
revoke all on public.voice_match_sessions,public.voice_match_queue from anon,authenticated;
create index voice_match_queue_recent on public.voice_match_queue(touched_at);
create index voice_match_queue_waiting on public.voice_match_queue(touched_at) where session_id is null;
create or replace function public.join_voice_match(p_gender_pref text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); me public.profiles; peer uuid; match public.voice_match_sessions; limit_value integer;
begin
 if uid is null or not public.is_license_valid() then raise exception 'Oturum gerekli.'; end if;
 select * into me from public.profiles where id=uid and banned_at is null and not is_bot;
 if not found then raise exception 'Hesap eşleşmeye uygun değil.'; end if;
 if p_gender_pref is not null and (p_gender_pref not in ('male','female') or not me.is_vip) then raise exception 'Bu filtre VIP üyeler içindir.'; end if;
 select case when value ~ '^[0-9]{1,5}$' then value::int else 5 end into limit_value from public.system_settings where key='max_daily_matches';
 if not me.is_vip and exists(select 1 from public.daily_matches where user_id=uid and last_match_date=current_date and matches_used>=coalesce(limit_value,5)) then raise exception 'Günlük eşleşme hakkınız bitti.'; end if;
 insert into public.voice_match_queue(user_id,gender_pref) values(uid,p_gender_pref)
 on conflict(user_id) do update set touched_at=now(),gender_pref=excluded.gender_pref;
 -- The actor's queue row is locked by UPSERT; a second poll cannot allocate it twice.
 select s.* into match from public.voice_match_queue q join public.voice_match_sessions s on s.id=q.session_id
 where q.user_id=uid and not s.cancelled and s.expires_at>now();
 if not found then
  update public.voice_match_queue set session_id=null where user_id=uid;
  select q.user_id into peer from public.voice_match_queue q join public.profiles p on p.id=q.user_id
  left join public.voice_match_sessions s on s.id=q.session_id
  where q.user_id<>uid and q.touched_at>now()-interval '15 seconds' and (s.id is null or s.cancelled or s.expires_at<=now())
   and p.banned_at is null and not p.is_bot and p.privacy_show_in_searches
   and (p.is_vip or not exists(select 1 from public.daily_matches d where d.user_id=p.id and d.last_match_date=current_date and d.matches_used>=coalesce(limit_value,5)))
   and (p_gender_pref is null or p.gender=p_gender_pref) and (q.gender_pref is null or me.gender=q.gender_pref)
   and not exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=q.user_id) or (blocker_id=q.user_id and blocked_id=uid))
  order by q.touched_at for update of q skip locked limit 1;
  if not found then return jsonb_build_object('status','waiting'); end if;
  insert into public.voice_match_sessions(user_a,user_b) values(least(uid,peer),greatest(uid,peer)) returning * into match;
  update public.voice_match_queue set session_id=match.id where user_id in(uid,peer);
 end if;
 peer:=case when match.user_a=uid then match.user_b else match.user_a end;
 return jsonb_build_object('status','matched','sessionId',match.id,
  'room','signaling:'||match.user_a||'_'||match.user_b||':'||match.id,'caller',match.user_a=uid,
  'peer',(select jsonb_build_object('id',id,'username',username,'avatar_url',avatar_url,'is_vip',is_vip) from public.profiles where id=peer));
end $$;
create or replace function public.leave_voice_match(p_session_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare allocated uuid;
begin
 if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
 if p_session_id is not null then
  update public.voice_match_sessions set cancelled=true where id=p_session_id and auth.uid() in(user_a,user_b);
  delete from public.voice_match_queue where user_id=auth.uid() and session_id=p_session_id;
 else
  select session_id into allocated from public.voice_match_queue where user_id=auth.uid() for update;
  if allocated is not null then update public.voice_match_sessions set cancelled=true where id=allocated and auth.uid() in(user_a,user_b); end if;
  delete from public.voice_match_queue where user_id=auth.uid();
 end if;
end $$;
revoke all on function public.join_voice_match(text),public.leave_voice_match(uuid) from public,anon;
grant execute on function public.join_voice_match(text),public.leave_voice_match(uuid) to authenticated;
create or replace function public.confirm_match(p_peer_id uuid,p_match_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); a uuid; b uuid; m public.confirmed_matches; recipient record; sender_name text;
begin
 if uid is null or p_peer_id is null or p_match_id is null or uid=p_peer_id or not public.is_license_valid() then raise exception 'Geçersiz eşleşme.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=p_peer_id) or (blocker_id=p_peer_id and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 if not exists(select 1 from public.voice_match_sessions where id=p_match_id and not cancelled and expires_at>now() and ((user_a=uid and user_b=p_peer_id) or (user_b=uid and user_a=p_peer_id))) then raise exception 'Sunucu eşleşmesi bulunamadı.'; end if;
 a:=least(uid,p_peer_id); b:=greatest(uid,p_peer_id);
 insert into public.confirmed_matches(id,user_a,user_b) values(p_match_id,a,b) on conflict do nothing;
 select * into m from public.confirmed_matches where id=p_match_id for update;
 if m.user_a<>a or m.user_b<>b or m.created_at<now()-interval '5 minutes' then raise exception 'Eşleşme geçersiz veya süresi dolmuş.'; end if;
 update public.confirmed_matches set confirmed_a=confirmed_a or uid=a,confirmed_b=confirmed_b or uid=b where id=p_match_id returning * into m;
 if not(m.confirmed_a and m.confirmed_b) or m.notified then return false; end if;
 insert into public.daily_matches(user_id,last_match_date,matches_used) select id,current_date,1 from public.profiles where id in(a,b) and not is_vip
 on conflict(user_id) do update set matches_used=case when public.daily_matches.last_match_date=current_date then public.daily_matches.matches_used+1 else 1 end,last_match_date=current_date;
 update public.confirmed_matches set notified=true where id=p_match_id;
 for recipient in select id,username,expo_push_token,notification_new_matches from public.profiles where id in(a,b) loop
  select username into sender_name from public.profiles where id=case when recipient.id=a then b else a end;
  if recipient.notification_new_matches and recipient.expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[' then
   perform net.http_post(url:='https://exp.host/--/api/v2/push/send',headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('to',recipient.expo_push_token,'title','Yeni eşleşme','body',coalesce(sender_name,'Birisi')||' ile eşleştin.','data',jsonb_build_object('type','match_confirmed','matchId',p_match_id)));
  end if;
 end loop;
 return true;
end $$;
revoke all on function public.confirm_match(uuid,uuid) from public,anon;
grant execute on function public.confirm_match(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
