-- ==========================================
-- ELMAS PAKETLERİ SİSTEMİ
-- ==========================================

-- Elmas Paketleri Tablosu
create table if not exists public.diamond_packages (
  id uuid default gen_random_uuid() primary key,
  amount integer not null check (amount > 0),
  price numeric(10, 2) not null check (price > 0),
  badge text, -- 'popular', 'best_value', 'new' vb.
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS
alter table public.diamond_packages enable row level security;

-- Herkes aktif paketleri görebilir
create policy "Aktif paketleri herkes görebilir" on public.diamond_packages
  for select using (true);

-- Adminler tüm paket işlemlerini yapabilir
create policy "Adminler paketleri yönetebilir" on public.diamond_packages
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Varsayılan paketler
insert into public.diamond_packages (amount, price, badge, sort_order, is_active) values
  (10,   5.00,   null,         1, true),
  (50,   20.00,  'popular',    2, true),
  (100,  35.00,  'best_value', 3, true),
  (500,  150.00, null,         4, true)
on conflict do nothing;
