-- ============================================================================
-- 0008_security_hardening.sql
-- Güvenlik sertleştirme migration'ı
-- Tarih: 2026-06-17
-- ============================================================================

-- ============================================================================
-- 1. conversation_participants RLS düzeltmesi
-- Mevcut politika "for all using (true)" ile herkes herhangi bir sohbete
-- katılabiliyor. Bu ciddi bir güvenlik açığı.
-- ============================================================================

-- Mevcut tehlikeli politikayı kaldır
drop policy if exists "conversation_participants_policy" on public.conversation_participants;
drop policy if exists "Allow all for conversation_participants" on public.conversation_participants;
drop policy if exists "Katılımcılar kendilerini ekleyebilir/görebilir" on public.conversation_participants;

-- SELECT: Kullanıcılar yalnızca kendi katıldıkları sohbetleri görebilir
create policy "conversation_participants_select"
  on public.conversation_participants
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- INSERT: Kullanıcılar yalnızca kendi user_id'leriyle katılabilir
create policy "conversation_participants_insert"
  on public.conversation_participants
  for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- DELETE: Kullanıcılar yalnızca kendilerini çıkarabilir
create policy "conversation_participants_delete"
  on public.conversation_participants
  for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================================
-- 2. buy_diamonds fonksiyonu düzeltmesi
-- Mevcut fonksiyon client tarafından gelen price_paid değerine güveniyor.
-- Yeni versiyon fiyatı diamond_packages tablosundan doğruluyor.
-- ============================================================================

create or replace function public.buy_diamonds(package_id uuid)
returns void as $$
declare
  pkg record;
begin
  -- Kimlik doğrulama kontrolü
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim. Lütfen giriş yapın.';
  end if;

  -- Paket doğrulama: sadece aktif paketler kabul edilir
  select * into pkg from public.diamond_packages
  where id = package_id and is_active = true;

  if not found then
    raise exception 'Geçersiz veya aktif olmayan paket.';
  end if;

  -- Elmas miktarını güncelle (sunucu tarafı değer kullanılır)
  update public.profiles
  set diamonds = diamonds + pkg.amount
  where id = auth.uid();

  -- İşlem kaydı oluştur (fiyat sunucu tarafından belirlenir)
  insert into public.diamond_transactions (receiver_id, amount, type, price_paid)
  values (auth.uid(), pkg.amount, 'purchase', pkg.price);
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 3. Profil görünürlüğü kısıtlaması
-- phone_number ve city gibi hassas alanları diğer kullanıcılardan gizleyen
-- güvenli bir view oluştur. Kullanıcılar yalnızca kendi bilgilerini görebilir.
-- ============================================================================

create or replace view public.profiles_safe as
select
  id, username, avatar_url, role, is_vip, vip_until,
  is_online, last_active_at, created_at, banned_at,
  bio, is_verified, language, country, age, hobbies,
  is_bot, gender, diamonds,
  -- Hassas alanlar: sadece profil sahibi görebilir
  case when id = auth.uid() then phone_number else null end as phone_number,
  case when id = auth.uid() then city else null end as city
from public.profiles;

-- View için yorum ekle
comment on view public.profiles_safe is 'Hassas bilgileri gizleyen güvenli profil görünümü. phone_number ve city yalnızca profil sahibine gösterilir.';

-- ============================================================================
-- 4. Mesaj uzunluğu kısıtlaması
-- Çok uzun mesajların gönderilmesini engelle (max 2000 karakter)
-- ============================================================================

alter table public.messages add constraint messages_content_length
  check (char_length(content) <= 2000);

-- ============================================================================
-- 5. Biyografi uzunluğu kısıtlaması
-- Profil bio alanı için maksimum uzunluk sınırı (max 500 karakter)
-- ============================================================================

alter table public.profiles add constraint profiles_bio_length
  check (char_length(bio) <= 500);
