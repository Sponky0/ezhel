begin;
alter table public.profiles add column if not exists edit_version bigint not null default 0;
create or replace function public.bump_profile_version() returns trigger language plpgsql as $$begin new.edit_version:=old.edit_version+1; return new; end $$;
drop trigger if exists bump_profile_version on public.profiles;
create trigger bump_profile_version before update on public.profiles for each row execute function public.bump_profile_version();

create table if not exists public.follows(
 follower_id uuid references public.profiles(id) on delete cascade,
 following_id uuid references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(follower_id,following_id),check(follower_id<>following_id)
);
create index if not exists follows_following on public.follows(following_id);
alter table public.follows enable row level security;
create policy follows_read on public.follows for select to authenticated using(true);
create policy follows_insert on public.follows for insert to authenticated with check(
 follower_id=auth.uid() and not exists(select 1 from public.blocks b where
 (b.blocker_id=follower_id and b.blocked_id=following_id) or (b.blocker_id=following_id and b.blocked_id=follower_id)));
create policy follows_delete on public.follows for delete to authenticated using(follower_id=auth.uid());

-- Paid links are NEVER part of publicly readable profile rows.
create table if not exists public.instagram_accounts(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 handle text not null check(handle ~ '^[A-Za-z0-9_.]{1,30}$'), updated_at timestamptz not null default now()
);
alter table public.instagram_accounts enable row level security;
create policy instagram_owner on public.instagram_accounts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table if not exists public.instagram_unlocks(
 viewer_id uuid references public.profiles(id) on delete cascade, owner_id uuid references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(viewer_id,owner_id)
);
alter table public.instagram_unlocks enable row level security;
revoke all on public.instagram_unlocks from authenticated,anon;
insert into public.system_settings(key,value) values('instagram_unlock_cost','20') on conflict do nothing;
-- Keep existing ledger categories and add one narrowly defined debit category.
alter table public.diamond_transactions drop constraint if exists diamond_transactions_type_check;
alter table public.diamond_transactions add constraint diamond_transactions_type_check check(type in
 ('purchase','gift','admin_grant','admin_deduct','cashout_request','cashout_refund','profile_highlight','instagram_unlock'));
create or replace function public.social_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or exists(select 1 from public.blocks where
 (blocker_id=auth.uid() and blocked_id=p_user_id) or (blocked_id=auth.uid() and blocker_id=p_user_id)) then raise exception 'Profil erişimi yok.'; end if;
 return jsonb_build_object(
 'followers',(select count(*) from public.follows where following_id=p_user_id),
 'following',(select count(*) from public.follows where follower_id=p_user_id),
 'likes',(select count(*) from public.story_likes l join public.stories s on s.id=l.story_id where s.user_id=p_user_id),
 'is_following',exists(select 1 from public.follows where follower_id=auth.uid() and following_id=p_user_id),
 'has_instagram',exists(select 1 from public.instagram_accounts where user_id=p_user_id),
 'instagram_cost',coalesce((select case when value ~ '^[0-9]{1,8}$' then value::integer else 20 end from public.system_settings where key='instagram_unlock_cost'),20));
end $$;
create or replace function public.unlock_instagram(p_owner_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); balance integer; cost integer; handle_value text;
begin
 if uid is null or not public.is_license_valid() then raise exception 'Oturum gerekli.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=p_owner_id) or (blocker_id=p_owner_id and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 select diamonds into balance from public.profiles where id=uid and banned_at is null for update;
 if not found then raise exception 'Profil kullanılamıyor.'; end if;
 select handle into handle_value from public.instagram_accounts where user_id=p_owner_id;
 if not found then raise exception 'Instagram hesabı bulunamadı.'; end if;
 if uid=p_owner_id or exists(select 1 from public.instagram_unlocks where viewer_id=uid and owner_id=p_owner_id) then return 'https://www.instagram.com/'||handle_value||'/'; end if;
 select coalesce(case when value ~ '^[0-9]{1,8}$' then value::int else 20 end,20) into cost from public.system_settings where key='instagram_unlock_cost';
 cost:=coalesce(cost,20); if cost<=0 or balance<cost then raise exception 'Yetersiz elmas.'; end if;
 insert into public.instagram_unlocks(viewer_id,owner_id) values(uid,p_owner_id);
 update public.profiles set diamonds=diamonds-cost where id=uid;
 insert into public.diamond_transactions(sender_id,amount,type) values(uid,cost,'instagram_unlock');
 return 'https://www.instagram.com/'||handle_value||'/';
end $$;

-- Private media: message rows never contain the storage path or a public URL.
insert into storage.buckets(id,name,public,file_size_limit) values('private_chat','private_chat',false,15728640)
on conflict(id) do update set public=false,file_size_limit=15728640;
create policy private_chat_upload on storage.objects for insert to authenticated
with check(bucket_id='private_chat' and split_part(name,'/',1)=auth.uid()::text);
create policy private_chat_delete on storage.objects for delete to authenticated
using(bucket_id='private_chat' and owner=auth.uid());
alter table public.messages add column if not exists private_media boolean not null default false;
alter table public.messages add column if not exists media_kind text;
alter table public.messages add column if not exists media_mode text;
alter table public.messages add column if not exists media_source text;
alter table public.messages add column if not exists media_opened_at timestamptz;
alter table public.messages add column if not exists story_id uuid references public.stories(id) on delete set null;
alter table public.messages add column if not exists story_preview_url text;
alter table public.stories add column if not exists media_source text;
create table if not exists public.message_media(
 message_id uuid primary key references public.messages(id) on delete cascade,
 sender_id uuid not null references public.profiles(id), recipient_id uuid not null references public.profiles(id),
 object_path text not null unique, mode text not null check(mode in ('once','keep')),
 kind text not null check(kind in ('image','video')), opened_at timestamptz
);
alter table public.message_media enable row level security;
revoke all on public.message_media from authenticated,anon;
create or replace function public.send_private_media(p_conversation_id uuid,p_object_path text,p_kind text,p_mode text,p_source text,p_request_id uuid,p_story_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); recipient uuid; mid uuid; previous jsonb; preview text;
begin
 if uid is null or p_request_id is null or p_kind not in ('image','video') or p_mode not in ('once','keep') or p_source not in ('camera','gallery') then raise exception 'Geçersiz medya.'; end if;
 if not public.is_conversation_participant(p_conversation_id) or not public.is_license_valid() then raise exception 'Konuşmaya erişilemiyor.'; end if;
 select user_id into recipient from public.conversation_participants where conversation_id=p_conversation_id and user_id<>uid;
 if recipient is null or (select count(*) from public.conversation_participants where conversation_id=p_conversation_id)<>2 then raise exception 'Birebir konuşma gerekli.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=recipient) or (blocker_id=recipient and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,0));
 select result into previous from public.economy_requests where user_id=uid and request_id=p_request_id and kind='media';
 if found then return (previous->>'id')::uuid; end if;
 if p_object_path not like uid::text||'/%' or p_object_path like '%..%' or not exists(select 1 from storage.objects where bucket_id='private_chat' and name=p_object_path and owner=uid) then raise exception 'Medya dosyası bulunamadı.'; end if;
 if p_story_id is not null then
  select media_url into preview from public.stories where id=p_story_id and user_id=recipient and expires_at>now();
  if not found then raise exception 'Hikâye artık kullanılamıyor.'; end if;
 end if;
 insert into public.messages(conversation_id,sender_id,content,private_media,media_kind,media_mode,media_source,story_id,story_preview_url)
 values(p_conversation_id,uid,case when p_kind='video' then 'Video gönderdi' else 'Fotoğraf gönderdi' end,true,p_kind,p_mode,p_source,p_story_id,preview) returning id into mid;
 insert into public.message_media values(mid,uid,recipient,p_object_path,p_mode,p_kind,null);
 insert into public.economy_requests values(uid,p_request_id,'media',jsonb_build_object('id',mid));
 return mid;
end $$;
-- Only the authenticated Edge Function's service client may call this.
create or replace function public.claim_message_media(p_message_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare media public.message_media; conv uuid;
begin
 select * into media from public.message_media where message_id=p_message_id for update;
 if not found or p_user_id is null or p_user_id not in (media.sender_id,media.recipient_id) then raise exception 'Medya erişimi yok.'; end if;
 select conversation_id into conv from public.messages where id=p_message_id and deleted_at is null;
 if conv is null or not exists(select 1 from public.conversation_participants where conversation_id=conv and user_id=p_user_id) or exists(select 1 from public.blocks where
 (blocker_id=media.sender_id and blocked_id=media.recipient_id) or (blocker_id=media.recipient_id and blocked_id=media.sender_id)) then raise exception 'Medya erişimi yok.'; end if;
 if media.mode='once' and p_user_id=media.recipient_id then
  if media.opened_at is not null then raise exception 'Bu içerik daha önce görüntülendi.'; end if;
  update public.message_media set opened_at=now() where message_id=p_message_id;
  update public.messages set media_opened_at=now() where id=p_message_id;
 end if;
 return jsonb_build_object('path',media.object_path,'kind',media.kind,'mode',media.mode);
end $$;
revoke all on function public.claim_message_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_message_media(uuid,uuid) to service_role;
revoke all on function public.social_summary(uuid),public.unlock_instagram(uuid),public.send_private_media(uuid,text,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.social_summary(uuid),public.unlock_instagram(uuid),public.send_private_media(uuid,text,text,text,text,uuid,uuid) to authenticated;
create or replace function public.send_story_reply(p_story_id uuid,p_text text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); owner_id uuid; preview text; conv uuid; mid uuid;
begin
 if uid is null or char_length(trim(p_text)) not between 1 and 2000 then raise exception 'Geçersiz yanıt.'; end if;
 select user_id,media_url into owner_id,preview from public.stories where id=p_story_id and expires_at>now();
 if owner_id is null or owner_id=uid then raise exception 'Hikâye kullanılamıyor.'; end if;
 if exists(select 1 from public.blocks where (blocker_id=uid and blocked_id=owner_id) or (blocker_id=owner_id and blocked_id=uid)) then raise exception 'Erişim engellendi.'; end if;
 select conversation_id into conv from public.find_or_create_conversation(owner_id);
 insert into public.messages(conversation_id,sender_id,content,story_id,story_preview_url)
 values(conv,uid,trim(p_text),p_story_id,preview) returning id into mid;
 return mid;
end $$;
revoke all on function public.send_story_reply(uuid,text) from public,anon;
grant execute on function public.send_story_reply(uuid,text) to authenticated;
create or replace function public.blocked_accounts()
returns table(id uuid,username text,avatar_url text) language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.username,p.avatar_url from public.blocks b join public.profiles p on p.id=b.blocked_id
 where b.blocker_id=auth.uid() order by p.username;
$$;
revoke all on function public.blocked_accounts() from public,anon;
grant execute on function public.blocked_accounts() to authenticated;
grant select,insert,delete on public.follows to authenticated;
grant select,insert,update,delete on public.instagram_accounts to authenticated;
notify pgrst,'reload schema';
commit;
