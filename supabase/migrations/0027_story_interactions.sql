-- ==========================================
-- Story Etkileşimleri: Müzik, Beğeni
-- ==========================================
-- Bu migration'ı Supabase SQL editöründe çalıştırın.
-- Aynı değişiklikler supabase/schema.sql içine de işlenmiştir (sıfırdan kurulum için).

-- A. stories tablosuna müzik kolonları
alter table public.stories add column if not exists music_url text;
alter table public.stories add column if not exists music_title text;

-- B. Story beğenileri tablosu
create table if not exists public.story_likes (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references public.stories(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (story_id, user_id)
);

alter table public.story_likes enable row level security;

drop policy if exists "Beğenileri herkes görebilir" on public.story_likes;
drop policy if exists "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes;
drop policy if exists "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes;

create policy "Beğenileri herkes görebilir" on public.story_likes
  for select using (true);

create policy "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes
  for delete using (auth.uid() = user_id);

-- C. Realtime yayını (idempotent)
-- DELETE olaylarının eski satırın tüm kolonlarını (user_id dahil) taşıması için
-- replica identity full gerekir; böylece istemciler kendi beğenilerini ayırt edebilir.
alter table public.story_likes replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.story_likes;
exception
  when duplicate_object then null;
end $$;
