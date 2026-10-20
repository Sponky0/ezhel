-- ==========================================
-- CİNSİYET (GENDER) ALANI
-- ==========================================
-- Bu dosyayı Supabase SQL Editor'de bir kez çalıştırın. Idempotenttir.
-- profiles.gender: 'male' | 'female' | null (null = belirtilmemiş).

alter table public.profiles
  add column if not exists gender text;

-- Geçerli değer kısıtı (kolon yeni eklenmişse). Mevcutsa hata bastırılır.
do $$
begin
  alter table public.profiles
    add constraint profiles_gender_check
    check (gender in ('male', 'female'));
exception
  when duplicate_object then null; -- kısıt zaten var
end $$;

-- Cinsiyet filtrelemesi için indeks (Keşfet/Eşleş VIP filtresi).
create index if not exists idx_profiles_gender
  on public.profiles (gender);

analyze public.profiles;
