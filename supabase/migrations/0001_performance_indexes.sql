-- ==========================================
-- PERFORMANS İNDEKSLERİ
-- ==========================================
-- Bu dosyayı Supabase SQL Editor'de bir kez çalıştırın.
-- Tüm indeksler "if not exists" ile idempotenttir; tekrar çalıştırmak güvenlidir.
-- Yavaşlığın ana nedeni şemada hiçbir indeksin olmaması ve her sorgunun
-- tüm tabloyu taramasıdır (full table scan). Aşağıdaki indeksler uygulamadaki
-- gerçek sorgu kalıplarına göre seçilmiştir.

-- ------------------------------------------------------------
-- messages: sohbet geçmişi + son mesaj sorguları (en kritik)
-- chat-room: conversation_id'ye göre created_at sırası
-- chat (liste): her konuşmanın son mesajı
-- ------------------------------------------------------------
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

-- Aktif (silinmemiş) mesajlar için kısmi indeks
create index if not exists idx_messages_active
  on public.messages (conversation_id, created_at desc)
  where deleted_at is null;

-- ------------------------------------------------------------
-- conversation_participants: her ekranda kullanılıyor.
-- PK (conversation_id, user_id) olduğundan user_id tek başına indekssiz.
-- ------------------------------------------------------------
create index if not exists idx_conv_participants_user
  on public.conversation_participants (user_id);

-- ------------------------------------------------------------
-- stories: aktif story sorguları (expires_at > now) ve kullanıcı bazlı
-- ------------------------------------------------------------
create index if not exists idx_stories_expires
  on public.stories (expires_at desc);

create index if not exists idx_stories_user
  on public.stories (user_id);

-- ------------------------------------------------------------
-- story_likes: beğeni sayımı (.in('story_id', [...]))
-- ------------------------------------------------------------
create index if not exists idx_story_likes_story
  on public.story_likes (story_id);

create index if not exists idx_story_likes_user
  on public.story_likes (user_id);

-- ------------------------------------------------------------
-- profiles: feed filtreleme/sıralama ve aktiflik temizliği
-- ------------------------------------------------------------
-- Feed: is_vip + is_online + last_active_at sıralaması
create index if not exists idx_profiles_feed
  on public.profiles (is_vip, is_online, last_active_at desc);

-- Çevrimiçi kullanıcı sayımı (adminler hariç)
create index if not exists idx_profiles_online
  on public.profiles (is_online)
  where role <> 'admin';

-- clean_inactive_users taraması (last_active_at eşiği)
create index if not exists idx_profiles_last_active
  on public.profiles (last_active_at);

-- Bot eşleştirme (explore: is_bot + is_online)
-- is_bot kolonu şema dosyasında yok; sadece canlı DB'de varsa indeksi oluştur.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_bot'
  ) then
    create index if not exists idx_profiles_bot_online
      on public.profiles (is_bot, is_online)
      where is_bot = true;
  end if;
end $$;

-- ------------------------------------------------------------
-- blocks: engel kontrolü (her iki yön)
-- ------------------------------------------------------------
create index if not exists idx_blocks_blocker
  on public.blocks (blocker_id);

create index if not exists idx_blocks_blocked
  on public.blocks (blocked_id);

-- ------------------------------------------------------------
-- reports: admin paneli durum filtresi
-- ------------------------------------------------------------
create index if not exists idx_reports_status
  on public.reports (status);

-- ------------------------------------------------------------
-- Planlayıcının yeni indeksleri kullanması için istatistikleri tazele
-- ------------------------------------------------------------
analyze public.messages;
analyze public.conversation_participants;
analyze public.stories;
analyze public.story_likes;
analyze public.profiles;
analyze public.blocks;
analyze public.reports;
