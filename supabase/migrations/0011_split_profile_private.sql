-- ============================================================================
-- 0011_split_profile_private.sql
-- phone_number ve city alanlarini public.profiles disina tasir.
-- ============================================================================

-- 1. Hassas profil alanlari icin ozel tablo.
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_number text,
  city text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

comment on table public.profile_private is
  'Kullaniciya ait hassas profil alanlari. Sadece profil sahibi ve adminler erisebilir.';
comment on column public.profile_private.phone_number is
  'Kullanici telefon numarasi. Public profiles tablosunda tutulmaz.';
comment on column public.profile_private.city is
  'Kullanici sehir bilgisi. Public profiles tablosunda tutulmaz.';

create or replace function public.set_profile_private_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profile_private_updated_at on public.profile_private;

create trigger set_profile_private_updated_at
  before update on public.profile_private
  for each row execute procedure public.set_profile_private_updated_at();

-- 2. Mevcut veriyi public.profiles tablosundan profile_private tablosuna tasi.
-- Kolonlar daha once kaldirilmissa migration tekrar calistiginda parse hatasi
-- almamak icin dinamik SQL kullaniyoruz.
do $$
declare
  has_phone boolean;
  has_city boolean;
  select_phone text;
  select_city text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'phone_number'
  ) into has_phone;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'city'
  ) into has_city;

  if has_phone or has_city then
    select_phone := case when has_phone then 'phone_number' else 'null::text' end;
    select_city := case when has_city then 'city' else 'null::text' end;

    execute format(
      'insert into public.profile_private (user_id, phone_number, city)
       select id, %s, %s
       from public.profiles
       where %s is not null or %s is not null
       on conflict (user_id) do update set
         phone_number = coalesce(excluded.phone_number, public.profile_private.phone_number),
         city = coalesce(excluded.city, public.profile_private.city),
         updated_at = timezone(''utc''::text, now())',
      select_phone,
      select_city,
      select_phone,
      select_city
    );
  end if;
end;
$$;

-- 3. Yeni kullanici olustugunda private satirini da hazirla.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'anonim_' || substring(new.id::text from 1 for 6)
    ),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );

  insert into public.profile_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.daily_matches (user_id, matches_used, last_match_date)
  values (new.id, 0, current_date);

  return new;
end;
$$ language plpgsql security definer;

-- 4. Private tablo RLS.
alter table public.profile_private enable row level security;

drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_insert_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_delete_own_or_admin" on public.profile_private;

create policy "profile_private_select_own_or_admin"
  on public.profile_private
  for select
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

create policy "profile_private_insert_own_or_admin"
  on public.profile_private
  for insert
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

create policy "profile_private_update_own_or_admin"
  on public.profile_private
  for update
  using (
    user_id = auth.uid()
    or public.is_admin()
  )
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

create policy "profile_private_delete_own_or_admin"
  on public.profile_private
  for delete
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

grant select on public.profile_private to anon, authenticated;
grant insert, update, delete on public.profile_private to authenticated;

-- 5. Eski security definer view uyarisini kaldir.
drop view if exists public.profiles_safe;

alter table public.profiles drop column if exists phone_number;
alter table public.profiles drop column if exists city;

create view public.profiles_safe
with (security_invoker = true)
as
select
  p.id,
  p.username,
  p.avatar_url,
  p.role,
  p.is_vip,
  p.vip_until,
  p.is_online,
  p.last_active_at,
  p.created_at,
  p.banned_at,
  p.bio,
  p.is_verified,
  p.language,
  p.country,
  p.age,
  p.hobbies,
  p.is_bot,
  p.gender,
  p.diamonds,
  case
    when p.id = auth.uid() or public.is_admin() then pp.phone_number
    else null
  end as phone_number,
  case
    when p.id = auth.uid() or public.is_admin() then pp.city
    else null
  end as city
from public.profiles p
left join public.profile_private pp on pp.user_id = p.id;

comment on view public.profiles_safe is
  'Public profil alanlari ile kullanicinin/adminin gorebilecegi hassas alanlari birlestiren security_invoker view.';

grant select on public.profiles_safe to anon, authenticated;
