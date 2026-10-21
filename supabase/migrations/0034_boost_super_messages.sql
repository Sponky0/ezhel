begin;
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
commit;
