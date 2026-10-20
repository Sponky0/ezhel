begin;
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
commit;
