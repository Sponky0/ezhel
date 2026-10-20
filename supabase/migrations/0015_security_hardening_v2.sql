-- ============================================================================
-- 0015_security_hardening_v2.sql
-- Gelişmiş güvenlik sertleştirme ve veritabanı düzeyinde mutlak lisans koruması
-- ============================================================================

-- 1. Profil Güncelleme Kısıtlaması (Admin Dışı Koruma)
create or replace function public.check_profile_update_restrictions()
returns trigger as $$
begin
  -- Eğer işlemi yapan kişi ADMIN değilse, kritik alanların değiştirilmesine izin verme
  if not public.is_admin() then
    if (new.role <> old.role or
        new.diamonds <> old.diamonds or
        new.is_vip <> old.is_vip or
        new.vip_until is distinct from old.vip_until or
        new.is_verified <> old.is_verified or
        new.is_bot <> old.is_bot or
        new.banned_at is distinct from old.banned_at) then
      raise exception 'Yetkisiz alan güncellemesi! Bu alanları sadece yöneticiler değiştirebilir.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tr_check_profile_update_restrictions on public.profiles;
create trigger tr_check_profile_update_restrictions
  before update on public.profiles
  for each row execute procedure public.check_profile_update_restrictions();

-- 2. Mutlak Lisans Kontrol Fonksiyonu (Admin veya Kullanıcı fark etmeden uygulamayı kilitler)
create or replace function public.is_license_valid()
returns boolean language plpgsql security definer as $$
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

-- 3. Satın Alma RPC Fonksiyon Yetkilerini Kısıtlama
-- Eski ve yeni imzalı fonksiyonları kapat
revoke execute on function public.buy_diamonds(integer, numeric) from public, anon;
revoke execute on function public.buy_diamonds(uuid) from public, anon;
grant execute on function public.buy_diamonds(uuid) to authenticated;

-- 4. RLS Politikalarını Lisans Kontrolü ile Güncelleme

-- A. PROFILES
drop policy if exists "Profilleri herkes görüntüleyebilir" on public.profiles;
create policy "Profilleri herkes görüntüleyebilir" on public.profiles
  for select using (public.is_license_valid());

drop policy if exists "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles;
create policy "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id and banned_at is null and public.is_license_valid());

drop policy if exists "Adminler tüm profilleri yönetebilir" on public.profiles;
create policy "Adminler tüm profilleri yönetebilir" on public.profiles
  for all using (public.is_admin() and public.is_license_valid());

-- B. STORIES
drop policy if exists "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories;
create policy "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories
  for select using ((expires_at > now() or is_highlight = true) and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi storylerini paylaşabilir" on public.stories;
create policy "Kullanıcılar kendi storylerini paylaşabilir" on public.stories
  for insert with check (auth.uid() = user_id and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi storylerini silebilir" on public.stories;
create policy "Kullanıcılar kendi storylerini silebilir" on public.stories
  for delete using (auth.uid() = user_id and public.is_license_valid());

-- C. STORY_LIKES
drop policy if exists "Beğenileri herkes görebilir" on public.story_likes;
create policy "Beğenileri herkes görebilir" on public.story_likes
  for select using (public.is_license_valid());

drop policy if exists "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes;
create policy "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes
  for insert with check (auth.uid() = user_id and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes;
create policy "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes
  for delete using (auth.uid() = user_id and public.is_license_valid());

-- D. CONVERSATIONS
drop policy if exists "Konuşmaları tüm kullanıcılar görebilir" on public.conversations;
create policy "Konuşmaları tüm kullanıcılar görebilir" on public.conversations
  for select using (auth.role() = 'authenticated' and public.is_license_valid());

drop policy if exists "Kullanıcılar yeni konuşma başlatabilir" on public.conversations;
create policy "Kullanıcılar yeni konuşma başlatabilir" on public.conversations
  for insert with check (auth.role() = 'authenticated' and public.is_license_valid());

-- E. CONVERSATION_PARTICIPANTS
drop policy if exists "conversation_participants_select" on public.conversation_participants;
create policy "conversation_participants_select" on public.conversation_participants
  for select using ((auth.uid() = user_id or public.is_conversation_participant(conversation_id) or public.is_admin()) and public.is_license_valid());

drop policy if exists "conversation_participants_insert" on public.conversation_participants;
create policy "conversation_participants_insert" on public.conversation_participants
  for insert with check ((auth.uid() = user_id or public.is_admin()) and public.is_license_valid());

drop policy if exists "conversation_participants_delete" on public.conversation_participants;
create policy "conversation_participants_delete" on public.conversation_participants
  for delete using ((auth.uid() = user_id or public.is_admin()) and public.is_license_valid());

-- F. MESSAGES
drop policy if exists "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages;
create policy "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages
  for select using (((exists (select 1 from public.conversation_participants where conversation_participants.conversation_id = messages.conversation_id and conversation_participants.user_id = auth.uid()) and deleted_at is null) or public.is_admin()) and public.is_license_valid());

drop policy if exists "Katılımcılar konuşmaya mesaj yazabilir" on public.messages;
create policy "Katılımcılar konuşmaya mesaj yazabilir" on public.messages
  for insert with check (auth.uid() = sender_id and exists (select 1 from public.conversation_participants where conversation_participants.conversation_id = messages.conversation_id and conversation_participants.user_id = auth.uid()) and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages;
create policy "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages
  for update using (auth.uid() = sender_id and public.is_license_valid());

-- G. BLOCKS
drop policy if exists "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks;
create policy "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks
  for select using (blocker_id = auth.uid() and public.is_license_valid());

drop policy if exists "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks;
create policy "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks
  for all using (blocker_id = auth.uid() and public.is_license_valid());

-- H. REPORTS
drop policy if exists "Kullanıcılar şikayet oluşturabilir" on public.reports;
create policy "Kullanıcılar şikayet oluşturabilir" on public.reports
  for insert with check (reporter_id = auth.uid() and public.is_license_valid());

drop policy if exists "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports;
create policy "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports
  for all using (public.is_admin() and public.is_license_valid());

-- I. DAILY_MATCHES
drop policy if exists "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches;
create policy "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches
  for select using (user_id = auth.uid() and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches;
create policy "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches
  for update using (user_id = auth.uid() and public.is_license_valid());

-- J. DIAMOND_TRANSACTIONS
drop policy if exists "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions;
create policy "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions
  for select using ((sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin()) and public.is_license_valid());

-- K. DIAMOND_PACKAGES
drop policy if exists "Aktif paketleri herkes görebilir" on public.diamond_packages;
create policy "Aktif paketleri herkes görebilir" on public.diamond_packages
  for select using (public.is_license_valid());

drop policy if exists "Adminler paketleri yönetebilir" on public.diamond_packages;
create policy "Adminler paketleri yönetebilir" on public.diamond_packages
  for all using (public.is_admin() and public.is_license_valid());

-- L. DIAMOND_WITHDRAWAL_REQUESTS
drop policy if exists "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests;
create policy "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests
  for select using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests;
create policy "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests
  for all using (public.is_admin() and public.is_license_valid());

-- M. PROFILE_PRIVATE
drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
create policy "profile_private_select_own_or_admin" on public.profile_private
  for select using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_insert_own_or_admin" on public.profile_private;
create policy "profile_private_insert_own_or_admin" on public.profile_private
  for insert with check ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
create policy "profile_private_update_own_or_admin" on public.profile_private
  for update using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid())
  with check ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_delete_own_or_admin" on public.profile_private;
create policy "profile_private_delete_own_or_admin" on public.profile_private
  for delete using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());
