-- Napan existing installation: additive patch 0030–0033. Run ONCE as project owner.
-- Contains no table drops, profile reset, passwords or payment keys.
-- Do not run tests/fixtures/base-schema.sql on a real project.
begin;
create table if not exists public.napan_patch_history(name text primary key,applied_at timestamptz not null default now());
alter table public.napan_patch_history enable row level security;
revoke all on public.napan_patch_history from anon,authenticated;
do $guard$ begin
 if exists(select 1 from public.napan_patch_history where name='real-user-report-v1') then raise exception 'This patch is already applied'; end if;
 if to_regclass('public.profiles') is null then raise exception 'Existing Napan schema is required'; end if;
end $guard$;

-- SOURCE: 0030_story_media_transform.sql
-- The story composer writes this field and the story feed selects it.
-- Additive migration: existing rows and policies are preserved.
alter table public.stories
  add column if not exists media_transform jsonb;

notify pgrst, 'reload schema';


-- SOURCE: 0031_account_and_economy.sql

alter table public.profiles add column if not exists email_verified_at timestamptz;

-- SECURITY INVOKER distinguishes a direct client update from a vetted
-- SECURITY DEFINER RPC. Never disable the profile protection triggers.
create or replace function public.check_profile_update_restrictions()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if current_user in ('anon','authenticated') and not public.is_admin() and
   (new.role is distinct from old.role or new.diamonds is distinct from old.diamonds or
    new.is_vip is distinct from old.is_vip or new.vip_until is distinct from old.vip_until or
    new.is_verified is distinct from old.is_verified or new.email_verified_at is distinct from old.email_verified_at or new.is_bot is distinct from old.is_bot or
    new.banned_at is distinct from old.banned_at) then
   raise exception 'Bu alan yalnızca yetkili sunucu işlemiyle değiştirilebilir.';
 end if;
 return new;
end $$;
create or replace function public.check_profile_highlight_update()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if current_user in ('anon','authenticated') and not public.is_admin() and
  (new.is_highlighted is distinct from old.is_highlighted or new.highlighted_until is distinct from old.highlighted_until)
 then raise exception 'Öne çıkarma için ilgili işlemi kullanın.'; end if;
 return new;
end $$;

create table if not exists public.economy_requests(
 user_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null, kind text not null, result jsonb not null,
 primary key(user_id,request_id,kind)
);
alter table public.economy_requests enable row level security;
revoke all on public.economy_requests from anon,authenticated;

create or replace function public.boost_profile(p_request_id uuid)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cost integer; balance integer; until_time timestamptz; previous jsonb;
begin
 if uid is null or p_request_id is null or not public.is_license_valid() then raise exception 'Oturum gerekli.'; end if;
 select diamonds into balance from public.profiles where id=uid and banned_at is null for update;
 if not found then raise exception 'Profil kullanılamıyor.'; end if;
 select result into previous from public.economy_requests where user_id=uid and request_id=p_request_id and kind='boost';
 if found then return (previous->>'until')::timestamptz; end if;
 select case when value ~ '^[0-9]{1,8}$' then value::int else 50 end into cost
 from public.system_settings where key='profile_highlight_cost';
 cost:=coalesce(cost,50);
 if cost<=0 or balance<cost then raise exception 'Yetersiz elmas bakiyesi.'; end if;
 until_time:=now()+interval '24 hours';
 update public.profiles set diamonds=diamonds-cost,is_highlighted=true,highlighted_until=until_time where id=uid;
 insert into public.diamond_transactions(sender_id,amount,type) values(uid,cost,'profile_highlight');
 insert into public.economy_requests values(uid,p_request_id,'boost',jsonb_build_object('until',until_time));
 return until_time;
end $$;
revoke all on function public.boost_profile(uuid) from public,anon;
grant execute on function public.boost_profile(uuid) to authenticated;
create or replace function public.highlight_profile(p_duration_hours integer default 24)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_duration_hours<>24 then raise exception 'Öne çıkarma süresi 24 saattir.'; end if;
 return public.boost_profile(gen_random_uuid());
end $$;

-- Client-side price/amount is not a payment receipt. Retire both unsafe APIs.
create or replace function public.buy_diamonds(amount integer,price_paid numeric)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin raise exception 'Elmaslar yalnızca doğrulanmış mağaza ödemesiyle yüklenir.'; end $$;
create or replace function public.buy_diamonds(package_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin raise exception 'Elmaslar yalnızca doğrulanmış mağaza ödemesiyle yüklenir.'; end $$;
revoke all on function public.buy_diamonds(integer,numeric) from public,anon,authenticated;
revoke all on function public.buy_diamonds(uuid) from public,anon,authenticated;
alter table public.diamond_packages add column if not exists store_product_id text unique;
create table if not exists public.billing_events(
 event_id text primary key, transaction_id text not null, store text not null,
 user_id uuid not null references public.profiles(id), product_id text not null,
 amount integer not null check(amount>0), environment text not null,
 created_at timestamptz not null default now(), unique(store,transaction_id)
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon,authenticated;
create or replace function public.credit_verified_purchase(p_event_id text,p_transaction_id text,p_store text,p_user_id uuid,p_product_id text,p_environment text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare quantity integer; inserted integer;
begin
 if nullif(p_event_id,'') is null or nullif(p_transaction_id,'') is null or p_store not in ('PLAY_STORE','APP_STORE') then raise exception 'Geçersiz ödeme.'; end if;
 if p_environment<>'PRODUCTION' and not exists(select 1 from public.system_settings where key='allow_sandbox_billing' and value='true') then raise exception 'Test ödemeleri kapalı.'; end if;
 select amount into quantity from public.diamond_packages where store_product_id=p_product_id and is_active;
 if not found then raise exception 'Mağaza ürünü eşleştirilmemiş.'; end if;
 insert into public.billing_events(event_id,transaction_id,store,user_id,product_id,amount,environment)
 values(p_event_id,p_transaction_id,p_store,p_user_id,p_product_id,quantity,p_environment) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false; end if;
 update public.profiles set diamonds=diamonds+quantity where id=p_user_id and banned_at is null;
 if not found then raise exception 'Profil kullanılamıyor.'; end if;
 insert into public.diamond_transactions(receiver_id,amount,type) values(p_user_id,quantity,'purchase');
 return true;
end $$;
revoke all on function public.credit_verified_purchase(text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.credit_verified_purchase(text,text,text,uuid,text,text) to service_role;

-- Remove the false match notification fired by ANY new DM participant.
drop trigger if exists on_conversation_participant_inserted_push on public.conversation_participants;

create or replace function public.register_push_token(p_token text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Geçersiz bildirim kaydı.'; end if;
 update public.profiles set expo_push_token=null where expo_push_token=p_token and id<>auth.uid();
 update public.profiles set expo_push_token=p_token where id=auth.uid();
end $$;
create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
 update public.profiles set expo_push_token=null where id=auth.uid() and expo_push_token=p_token;
end $$;
revoke all on function public.register_push_token(text),public.unregister_push_token(text) from public,anon;
grant execute on function public.register_push_token(text),public.unregister_push_token(text) to authenticated;

-- Future signups must prove ownership of their email. Existing accounts remain intact.
drop trigger if exists on_auth_user_insert_confirm on auth.users;
create or replace function public.sync_email_verification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.profiles set email_verified_at=new.email_confirmed_at where id=new.id;
 return new;
end $$;
drop trigger if exists on_email_verified on auth.users;
create trigger on_email_verified after update of email_confirmed_at on auth.users
for each row execute function public.sync_email_verification();
-- Store onboarding fields at account creation even before a session exists.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.profiles(id,username,avatar_url,role,country,language,gender,hobbies,age,email_verified_at)
 values(new.id,coalesce(new.raw_user_meta_data->>'username','anonim_'||substr(new.id::text,1,6)),
 new.raw_user_meta_data->>'avatar_url','user',left(new.raw_user_meta_data->>'country',100),
 left(new.raw_user_meta_data->>'language',100),
 case when new.raw_user_meta_data->>'gender' in ('male','female') then new.raw_user_meta_data->>'gender' end,
 case when jsonb_typeof(new.raw_user_meta_data->'hobbies')='array' then array(select jsonb_array_elements_text(new.raw_user_meta_data->'hobbies')) end,
 case when new.raw_user_meta_data->>'age' ~ '^[0-9]{1,3}$' then least(120,(new.raw_user_meta_data->>'age')::int) end,
 new.email_confirmed_at);
 insert into public.daily_matches(user_id) values(new.id);
 insert into public.profile_private(user_id) values(new.id);
 return new;
end $$;
notify pgrst,'reload schema';


-- SOURCE: 0032_social_and_private_media.sql

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


-- SOURCE: 0033_realtime_and_confirmed_matches.sql

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

insert into public.napan_patch_history(name) values('real-user-report-v1');
commit;
