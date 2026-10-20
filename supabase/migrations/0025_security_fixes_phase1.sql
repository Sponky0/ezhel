-- ============================================================================
-- 0025_security_fixes_phase1.sql
-- 1. Kayıt sırasında yetki yükseltme açığını önler (role = 'user').
-- 2. is_license_valid() fonksiyonuna STABLE ekleyerek RLS performansını artırır.
-- 3. conversations tablosunda RLS erişimini sadece konuşma katılımcılarına sınırlar.
-- ============================================================================

-- 1. Profil ve Private kaydı oluşturan tetikleyici fonksiyonu güvenli hale getir
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
    'user' -- Yetki yükseltmeyi önlemek için sabit 'user' atanır
  );

  insert into public.profile_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.daily_matches (user_id, matches_used, last_match_date)
  values (new.id, 0, current_date);

  return new;
end;
$$ language plpgsql security definer;

-- 2. is_license_valid() fonksiyonunu STABLE olarak güncelle (PostgreSQL query caching)
create or replace function public.is_license_valid()
returns boolean
language plpgsql
stable
security definer as $$
declare
  license_active text;
  expiration_date text;
begin
  select value into license_active from public.system_settings where key = 'demo_license_active';
  select value into expiration_date from public.system_settings where key = 'demo_expiration_date';
  
  if license_active is null or license_active <> 'true' then
    return false;
  end if;
  
  if expiration_date is not null and now() > expiration_date::timestamp with time zone then
    return false;
  end if;
  
  return true;
end;
$$;

-- 3. conversations tablosu RLS politikasını daralt (Sadece katılımcılar ve adminler görebilir)
drop policy if exists "Konuşmaları tüm kullanıcılar görebilir" on public.conversations;
drop policy if exists "Kullanıcılar sadece kendi konuşmalarını görebilir" on public.conversations;

create policy "Kullanıcılar sadece kendi konuşmalarını görebilir" on public.conversations
  for select using (
    (public.is_conversation_participant(id) or public.is_admin()) 
    and public.is_license_valid()
  );
