begin;
-- Typing indicators use private, participant-authorized Realtime channels.
create policy napan_typing_read on realtime.messages for select to authenticated using(
 exists(select 1 from public.conversation_participants where user_id=auth.uid() and 'typing:'||conversation_id::text=realtime.topic()));
create policy napan_typing_write on realtime.messages for insert to authenticated with check(
 exists(select 1 from public.conversation_participants where user_id=auth.uid() and 'typing:'||conversation_id::text=realtime.topic()));
create table if not exists public.confirmed_matches(
 id uuid primary key, user_a uuid not null references public.profiles(id), user_b uuid not null references public.profiles(id),
 confirmed_a boolean not null default false, confirmed_b boolean not null default false, notified boolean not null default false,
 created_at timestamptz not null default now(),check(user_a<user_b)
);
alter table public.confirmed_matches enable row level security;
revoke all on public.confirmed_matches from authenticated,anon;
create or replace function public.confirm_match(p_peer_id uuid,p_match_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); a uuid; b uuid; m public.confirmed_matches; recipient record; sender_name text;
begin
 if uid is null or p_peer_id is null or p_match_id is null or uid=p_peer_id or not public.is_license_valid() then raise exception 'Geçersiz eşleşme.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=p_peer_id) or (blocker_id=p_peer_id and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 a:=least(uid,p_peer_id); b:=greatest(uid,p_peer_id);
 insert into public.confirmed_matches(id,user_a,user_b) values(p_match_id,a,b) on conflict do nothing;
 select * into m from public.confirmed_matches where id=p_match_id for update;
 if m.user_a<>a or m.user_b<>b or m.created_at<now()-interval '5 minutes' then raise exception 'Eşleşme geçersiz veya süresi dolmuş.'; end if;
 update public.confirmed_matches set confirmed_a=confirmed_a or uid=a,confirmed_b=confirmed_b or uid=b where id=p_match_id returning * into m;
 if not(m.confirmed_a and m.confirmed_b) or m.notified then return false; end if;
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
