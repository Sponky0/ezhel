-- ==========================================
-- 1. PROFILLER TABLOSUNA ELMAS SÜTUNUNUN EKLENMESİ
-- ==========================================
alter table public.profiles 
add column if not exists diamonds integer not null default 0;

-- ==========================================
-- 2. ELMAS İŞLEMLERİ (TRANSACTIONS) TABLOSUNUN OLUŞTURULMASI
-- ==========================================
create table if not exists public.diamond_transactions (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  amount integer not null check (amount > 0),
  type text not null check (type in ('purchase', 'gift', 'admin_grant', 'admin_deduct')),
  price_paid numeric(10, 2), -- Satın alımlar için ödenen miktar
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Etkinleştirilmesi
alter table public.diamond_transactions enable row level security;

-- RLS Politikaları
drop policy if exists "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions;
create policy "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions
  for select using (
    sender_id = auth.uid() 
    or receiver_id = auth.uid() 
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ==========================================
-- 3. VARSAYILAN ELMAS BİRİM FİYATININ SETTINGS'E EKLENMESİ
-- ==========================================
insert into public.system_settings (key, value)
values ('diamond_unit_price', '1.00')
on conflict (key) do nothing;

-- ==========================================
-- 4. GÜVENLİ VERİTABANI İŞLEMLERİ (RPC FONKSİYONLARI)
-- ==========================================

-- A. Elmas Satın Alma Fonksiyonu
create or replace function public.buy_diamonds(amount integer, price_paid numeric)
returns void as $$
begin
  -- Giriş yapmış kullanıcı olup olmadığını doğrula
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim. Lütfen giriş yapın.';
  end if;

  -- Profil elmas bakiyesini güncelle
  update public.profiles
  set diamonds = diamonds + amount
  where id = auth.uid();

  -- İşlem kaydını oluştur
  insert into public.diamond_transactions (receiver_id, amount, type, price_paid)
  values (auth.uid(), amount, 'purchase', price_paid);
end;
$$ language plpgsql security definer;

-- B. Hediye Elmas Gönderme Fonksiyonu
create or replace function public.send_diamond_gift(recipient_id uuid, amount integer)
returns void as $$
declare
  sender_diamonds integer;
begin
  -- Giriş yapmış kullanıcı olup olmadığını doğrula
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim. Lütfen giriş yapın.';
  end if;

  -- Alıcının varlığını kontrol et
  if not exists (select 1 from public.profiles where id = recipient_id) then
    raise exception 'Alıcı kullanıcı bulunamadı.';
  end if;

  -- Kendisine gönderme kontrolü
  if recipient_id = auth.uid() then
    raise exception 'Kendinize hediye elmas gönderemezsiniz.';
  end if;

  -- Gönderenin güncel bakiyesini sorgula
  select diamonds into sender_diamonds from public.profiles where id = auth.uid();
  if sender_diamonds is null or sender_diamonds < amount then
    raise exception 'Yetersiz elmas bakiyesi.';
  end if;

  -- Gönderenin bakiyesini düşür
  update public.profiles
  set diamonds = diamonds - amount
  where id = auth.uid();

  -- Alıcının bakiyesini artır
  update public.profiles
  set diamonds = diamonds + amount
  where id = recipient_id;

  -- İşlem kaydı oluştur
  insert into public.diamond_transactions (sender_id, receiver_id, amount, type)
  values (auth.uid(), recipient_id, amount, 'gift');
end;
$$ language plpgsql security definer;
