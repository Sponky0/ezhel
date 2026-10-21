-- Napan design/call update. Existing installation with migrations0030-0033 required.
-- Apply ONCE; no profile reset or table drop.
begin;
create table if not exists public.napan_patch_history(name text primary key,applied_at timestamptz not null default now());
alter table public.napan_patch_history enable row level security;
revoke all on public.napan_patch_history from anon,authenticated;
do $guard$ begin
 if exists(select 1 from public.napan_patch_history where name='design-and-calls-v2') then raise exception 'This patch is already applied'; end if;
 if to_regclass('public.confirmed_matches') is null or to_regclass('public.story_like_history') is not null then raise exception 'Expected0030-0033 installed and0034 not yet applied'; end if;
end $guard$;

-- SOURCE: 0034_boost_super_messages.sql

-- A discovery visit is not a message. Record the active paid boost, and count
-- the first actual inbound message in each attributed conversation exactly once.
create table public.boost_message_origins (
 conversation_id uuid primary key references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 boosted_user_id uuid not null references public.profiles(id) on delete cascade,
 boost_until timestamptz not null,
 started_at timestamptz not null default now(),
 first_message_id uuid unique references public.messages(id) on delete set null,
 counted_at timestamptz,
 check(sender_id<>boosted_user_id)
);
alter table public.boost_message_origins enable row level security;
revoke all on public.boost_message_origins from anon,authenticated;
create index boost_message_origins_recipient on public.boost_message_origins(boosted_user_id) where counted_at is not null;
create or replace function public.open_boost_conversation(p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); conv uuid; until_time timestamptz;
begin
 if uid is null or uid=p_user_id or not public.is_license_valid() then raise exception 'Sohbet başlatılamadı.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=p_user_id) or (blocker_id=p_user_id and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 select conversation_id into conv from public.find_or_create_conversation(p_user_id);
 select highlighted_until into until_time from public.profiles where id=p_user_id and is_highlighted and highlighted_until>now() and banned_at is null;
 if not found then return conv; end if;
 -- Existing conversations with prior messages are not newly acquired leads.
 if not exists(select 1 from public.messages where conversation_id=conv) then
  insert into public.boost_message_origins(conversation_id,sender_id,boosted_user_id,boost_until)
  values(conv,uid,p_user_id,until_time) on conflict do nothing;
 end if;
 return conv;
end $$;
revoke all on function public.open_boost_conversation(uuid) from public,anon;
grant execute on function public.open_boost_conversation(uuid) to authenticated;
create or replace function public.count_boost_super_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.boost_message_origins set first_message_id=new.id,counted_at=now()
 where conversation_id=new.conversation_id and sender_id=new.sender_id and counted_at is null
 and boost_until>now() and new.deleted_at is null
 and (nullif(trim(new.content),'') is not null or new.media_url is not null or new.private_media)
 and exists(select 1 from public.profiles where id=boosted_user_id and banned_at is null)
 and not exists(select 1 from public.blocks where (blocker_id=sender_id and blocked_id=boosted_user_id) or (blocker_id=boosted_user_id and blocked_id=sender_id));
 return new;
end $$;
create trigger count_boost_super_message after insert on public.messages for each row execute function public.count_boost_super_message();

-- Likes are durable history, even after an expired story is removed. Backfill
-- available records once; previously deleted stories cannot be reconstructed.
create table public.story_like_history (
 story_id uuid not null,
 liker_id uuid not null references public.profiles(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(story_id,liker_id)
);
alter table public.story_like_history enable row level security;
revoke all on public.story_like_history from anon,authenticated;
insert into public.story_like_history(story_id,liker_id,owner_id)
 select l.story_id,l.user_id,s.user_id from public.story_likes l join public.stories s on s.id=l.story_id where l.user_id<>s.user_id on conflict do nothing;
create index story_like_history_owner on public.story_like_history(owner_id);
create or replace function public.remember_story_like()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.story_like_history(story_id,liker_id,owner_id)
 select new.story_id,new.user_id,s.user_id from public.stories s where s.id=new.story_id and new.user_id<>s.user_id on conflict do nothing;
 return new;
end $$;
create trigger remember_story_like after insert on public.story_likes for each row execute function public.remember_story_like();
create or replace function public.social_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or exists(select 1 from public.blocks where
 (blocker_id=auth.uid() and blocked_id=p_user_id) or (blocked_id=auth.uid() and blocker_id=p_user_id)) then raise exception 'Profil erişimi yok.'; end if;
 return jsonb_build_object(
 'followers',(select count(*) from public.follows where following_id=p_user_id),
 'super_messages',(select count(*) from public.boost_message_origins where boosted_user_id=p_user_id and counted_at is not null),
 'likes',(select count(*) from public.story_like_history where owner_id=p_user_id),
 'is_following',exists(select 1 from public.follows where follower_id=auth.uid() and following_id=p_user_id),
 'has_instagram',exists(select 1 from public.instagram_accounts where user_id=p_user_id),
 'instagram_cost',coalesce((select case when value ~ '^[0-9]{1,8}$' then value::integer else 20 end from public.system_settings where key='instagram_unlock_cost'),20));
end $$;
notify pgrst,'reload schema';


-- SOURCE: 0035_atomic_voice_matching.sql

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

insert into public.napan_patch_history(name) values('design-and-calls-v2');
commit;
