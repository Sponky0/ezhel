-- TEST FIXTURE ONLY. Never execute this historical bootstrap on an existing Supabase project.
-- Fresh Frankfurt project only. Empty application schema required.
-- Derived from repository schema.sql followed by 0001-0029 in guide order.
-- Run as project owner in Supabase SQL Editor.
begin;
do $guard$ begin if to_regclass('public.profiles') is not null then raise exception 'Application schema already exists; stop rather than overwrite'; end if; end $guard$;

-- SOURCE: schema.sql
-- ==========================================
-- 1. TABLOLARIN OLUŞTURULMASI
-- ==========================================

-- A. Profiller Tablosu
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_vip boolean not null default false,
  vip_until timestamp with time zone,
  is_online boolean not null default false,
  last_active_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  banned_at timestamp with time zone,
  bio text,
  city text,
  phone_number text,
  is_verified boolean not null default false,
  language text,
  country text,
  age integer,
  hobbies text[],
  is_bot boolean not null default false,
  gender text check (gender in ('male', 'female')),
  diamonds integer not null default 0,
  is_highlighted boolean not null default false,
  highlighted_until timestamp with time zone,
  privacy_show_online boolean not null default true,
  privacy_show_in_searches boolean not null default true,
  privacy_show_read_receipts boolean not null default true
);

-- B. Story Paylaşımları Tablosu
create table public.stories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  media_url text not null,
  music_url text,
  music_title text,
  is_highlight boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  expires_at timestamp with time zone default (timezone('utc'::text, now()) + interval '24 hours')
);

-- B2. Story Beğenileri Tablosu
create table public.story_likes (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references public.stories(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (story_id, user_id)
);

-- C. Sohbet Odaları Tablosu
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- D. Sohbet Katılımcıları Tablosu
create table public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  last_read_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (conversation_id, user_id)
);

-- E. Mesajlar Tablosu (Silinen mesajlar soft-delete edilerek admin incelemesi için tutulur)
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text,
  media_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  deleted_at timestamp with time zone
);

-- F. Kullanıcı Engelleme Tablosu
create table public.blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (blocker_id, blocked_id)
);

-- G. Şikayetler Tablosu
create table public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- H. Günlük Eşleşme Hakları Tablosu
create table public.daily_matches (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  matches_used integer not null default 0,
  last_match_date date not null default current_date
);

-- I. Sistem Ayarları Tablosu
create table public.system_settings (
  key text primary key,
  value text not null
);

-- Varsayılan sesli görüşme süre limitini ekleyelim (saniye cinsinden, varsayılan 180 saniye / 3 dk)
insert into public.system_settings (key, value)
values ('voice_chat_limit', '180')
on conflict (key) do update set value = excluded.value;

-- Varsayılan elmas birim fiyatı
insert into public.system_settings (key, value)
values ('diamond_unit_price', '1.00')
on conflict (key) do nothing;

insert into public.system_settings (key, value)
values ('diamond_cashout_user_percentage', '50')
on conflict (key) do nothing;

-- J. Elmas İşlemleri Tablosu
create table public.diamond_transactions (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  amount integer not null check (amount > 0),
  type text not null check (type in ('purchase', 'gift', 'admin_grant', 'admin_deduct', 'cashout_request', 'cashout_refund', 'profile_highlight')),
  price_paid numeric(10, 2),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- K. Elmas Paketleri Tablosu
create table public.diamond_packages (
  id uuid default gen_random_uuid() primary key,
  amount integer not null check (amount > 0),
  price numeric(10, 2) not null check (price > 0),
  badge text, -- 'popular', 'best_value', 'new'
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Varsayılan elmas paketleri
insert into public.diamond_packages (amount, price, badge, sort_order, is_active) values
  (10,   5.00,   null,         1, true),
  (50,   20.00,  'popular',    2, true),
  (100,  35.00,  'best_value', 3, true),
  (500,  150.00, null,         4, true)
on conflict do nothing;

create table public.diamond_withdrawal_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  diamond_amount integer not null check (diamond_amount > 0),
  diamond_unit_price numeric(10, 2) not null check (diamond_unit_price >= 0),
  payout_percentage numeric(5, 2) not null check (payout_percentage >= 0 and payout_percentage <= 100),
  gross_cash_amount numeric(10, 2) not null check (gross_cash_amount >= 0),
  user_cash_amount numeric(10, 2) not null check (user_cash_amount >= 0),
  app_cash_amount numeric(10, 2) not null check (app_cash_amount >= 0),
  bank_name text not null,
  iban text not null,
  account_holder_name text not null,
  user_note text,
  admin_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed', 'cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  approved_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  refunded_at timestamp with time zone
);

create index idx_diamond_withdrawal_requests_user_id
  on public.diamond_withdrawal_requests(user_id);

create index idx_diamond_withdrawal_requests_status
  on public.diamond_withdrawal_requests(status);

-- ==========================================
-- 2. TETİKLEYİCİLER (TRIGGERS) VE FONKSİYONLAR
-- ==========================================

-- Yeni üye kaydında otomatik profil oluşturan tetikleyici
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
    'user'
  );

  -- Günlük hak tablosunu da ilklendir
  insert into public.daily_matches (user_id, matches_used, last_match_date)
  values (new.id, 0, current_date);

  return new;
end;
$$ language plpgsql security definer;

-- Tetikleyiciyi aktifleştir
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Anonim e-postaları otomatik doğrulayan tetikleyici
create or replace function public.auto_confirm_anon_email()
returns trigger as $$
begin
  if new.email like '%@anon.randomchat.app' then
    new.email_confirmed_at := now();
    new.confirmed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_insert_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_anon_email();


-- Helper function to check if user is admin without RLS recursion
create or replace function public.is_admin()
returns boolean security definer as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql;

-- Helper function to check license validity safely
create or replace function public.is_license_valid()
returns boolean
language plpgsql
stable
security definer as $$
declare
  license_active text;
  expiration_date text;
  parsed_date timestamp with time zone;
begin
  select value into license_active from public.system_settings where key = 'demo_license_active';
  select value into expiration_date from public.system_settings where key = 'demo_expiration_date';

  if license_active is null or license_active <> 'true' then
    return false;
  end if;

  if expiration_date is not null and trim(expiration_date) <> '' then
    begin
      parsed_date := trim(expiration_date)::timestamp with time zone;
      if now() > parsed_date then
        return false;
      end if;
    exception when others then
      null;
    end;
  end if;

  return true;
end;
$$;

-- Helper function to check conversation membership without RLS recursion
create or replace function public.is_conversation_participant(check_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = check_conversation_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.find_or_create_conversation(other_user_id uuid)
returns table(conversation_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  if other_user_id is null then
    raise exception 'Gecersiz kullanici.';
  end if;

  if other_user_id = current_user_id then
    raise exception 'Kendinizle sohbet baslatamazsiniz.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = other_user_id
      and banned_at is null
  ) then
    raise exception 'Kullanici bulunamadi.';
  end if;

  select mine.conversation_id
    into existing_conversation_id
  from public.conversation_participants as mine
  join public.conversation_participants as other
    on other.conversation_id = mine.conversation_id
  where mine.user_id = current_user_id
    and other.user_id = other_user_id
  limit 1;

  if existing_conversation_id is not null then
    return query select existing_conversation_id, false;
    return;
  end if;

  insert into public.conversations default values
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conversation_id, current_user_id),
    (new_conversation_id, other_user_id);

  return query select new_conversation_id, true;
end;
$$;

create or replace function public.mark_conversation_read(read_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  update public.conversation_participants
  set last_read_at = timezone('utc'::text, now())
  where conversation_id = read_conversation_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Konusma bulunamadi.';
  end if;
end;
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
revoke all on function public.find_or_create_conversation(uuid) from public;
grant execute on function public.find_or_create_conversation(uuid) to authenticated;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;


-- ==========================================
-- 3. GÜVENLİK (ROW LEVEL SECURITY - RLS)
-- ==========================================

-- RLS'i tablolarda aktif et
alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.story_likes enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.daily_matches enable row level security;
alter table public.system_settings enable row level security;
alter table public.diamond_transactions enable row level security;
alter table public.diamond_withdrawal_requests enable row level security;

-- A. Profil Politikaları
create policy "Profilleri herkes görüntüleyebilir" on public.profiles
  for select using (
    public.is_license_valid()
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.blocks
        where (blocker_id = auth.uid() and blocked_id = profiles.id)
           or (blocker_id = profiles.id and blocked_id = auth.uid())
      )
    )
  );

create policy "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id and banned_at is null);

create policy "Adminler tüm profilleri yönetebilir" on public.profiles
  for all using (public.is_admin());

-- B. Story Politikaları
create policy "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories
  for select using (
    (expires_at > now() or is_highlight = true)
    and public.is_license_valid()
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.blocks
        where (blocker_id = auth.uid() and blocked_id = user_id)
           or (blocker_id = user_id and blocked_id = auth.uid())
      )
    )
  );

create policy "Kullanıcılar kendi storylerini paylaşabilir" on public.stories
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcılar kendi storylerini silebilir" on public.stories
  for delete using (auth.uid() = user_id);

-- B2. Story Beğeni Politikaları
create policy "Beğenileri herkes görebilir" on public.story_likes
  for select using (true);

create policy "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes
  for insert with check (auth.uid() = user_id);

create policy "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes
  for delete using (auth.uid() = user_id);

-- C. Konuşma Politikaları (Conversations & Participants)
create policy "Konuşmaları tüm kullanıcılar görebilir" on public.conversations
  for select using (auth.role() = 'authenticated');

create policy "Kullanıcılar yeni konuşma başlatabilir" on public.conversations
  for insert with check (auth.role() = 'authenticated');

create policy "conversation_participants_select" on public.conversation_participants
  for select using (
    (
      auth.uid() = user_id
      or (
        public.is_conversation_participant(conversation_id)
        and not exists (
          select 1 from public.blocks
          where (blocker_id = auth.uid() and blocked_id = user_id)
             or (blocker_id = user_id and blocked_id = auth.uid())
        )
      )
      or public.is_admin()
    )
    and public.is_license_valid()
  );

create policy "conversation_participants_insert" on public.conversation_participants
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

create policy "conversation_participants_delete" on public.conversation_participants
  for delete using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- D. Mesaj Politikaları (Silinen mesajlar sadece adminlere açık)
create policy "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages
  for select using (
    (
      (
        exists (
          select 1 from public.conversation_participants
          where conversation_participants.conversation_id = messages.conversation_id
          and conversation_participants.user_id = auth.uid()
        )
        and deleted_at is null
        and not exists (
          select 1 from public.blocks
          where (blocker_id = auth.uid() and blocked_id = sender_id)
             or (blocker_id = sender_id and blocked_id = auth.uid())
        )
      )
      or public.is_admin()
    )
    and public.is_license_valid()
  );

create policy "Katılımcılar konuşmaya mesaj yazabilir" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = messages.conversation_id
      and conversation_participants.user_id = auth.uid()
    )
    and not exists (
      select 1 from public.conversation_participants cp
      join public.blocks b on
        (b.blocker_id = cp.user_id and b.blocked_id = auth.uid()) or
        (b.blocker_id = auth.uid() and b.blocked_id = cp.user_id)
      where cp.conversation_id = messages.conversation_id
    )
    and public.is_license_valid()
  );

create policy "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages
  for update using (auth.uid() = sender_id);

-- E. Engelleme Politikaları
create policy "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks
  for select using (blocker_id = auth.uid());

create policy "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks
  for all using (blocker_id = auth.uid());

-- F. Şikayet Politikaları
create policy "Kullanıcılar şikayet oluşturabilir" on public.reports
  for insert with check (reporter_id = auth.uid());

create policy "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- G. Eşleşme Hakları Politikaları
create policy "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches
  for select using (user_id = auth.uid());

create policy "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches
  for update using (user_id = auth.uid());

-- H. Sistem Ayarları Politikaları
create policy "Sistem ayarlarını herkes görebilir" on public.system_settings
  for select using (true);

create policy "Sistem ayarlarını sadece adminler güncelleyebilir" on public.system_settings
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- I. Elmas İşlemleri Politikaları
create policy "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions
  for select using (
    sender_id = auth.uid()
    or receiver_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- J. Elmas Paketleri Politikaları
alter table public.diamond_packages enable row level security;

create policy "Aktif paketleri herkes görebilir" on public.diamond_packages
  for select using (true);

create policy "Adminler paketleri yönetebilir" on public.diamond_packages
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests
  for all using (public.is_admin())
  with check (public.is_admin());

-- ==========================================
-- 4. DEPOLAMA ALANI (SUPABASE STORAGE BUCKETS)
-- ==========================================

-- A. Bucket'ları oluştur
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('chat_media', 'chat_media', true),
  ('stories', 'stories', true)
on conflict (id) do nothing;

-- B. Storage RLS Politikaları
drop policy if exists "Herkes depolama dosyalarını okuyabilir" on storage.objects;
drop policy if exists "Giriş yapmış üyeler dosya yükleyebilir" on storage.objects;
drop policy if exists "Kullanıcılar kendi dosyalarını silebilir" on storage.objects;

create policy "Herkes depolama dosyalarını okuyabilir" on storage.objects
  for select using (bucket_id in ('avatars', 'chat_media', 'stories'));

create policy "Giriş yapmış üyeler dosya yükleyebilir" on storage.objects
  for insert with check (
    bucket_id in ('avatars', 'chat_media', 'stories')
    and auth.role() = 'authenticated'
  );

create policy "Kullanıcılar kendi dosyalarını silebilir" on storage.objects
  for delete using (
    bucket_id in ('avatars', 'chat_media', 'stories')
    and auth.uid() = owner
  );

-- ==========================================
-- 5. GERÇEK ZAMANLI YAYINLAR (SUPABASE REALTIME)
-- ==========================================

-- Tablolar için Realtime yayınını aktif et
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.system_settings;
alter publication supabase_realtime add table public.conversation_participants;
-- story_likes DELETE olaylarında user_id'nin gelmesi için replica identity full
alter table public.story_likes replica identity full;
alter publication supabase_realtime add table public.story_likes;

-- ==========================================
-- 6. ADMIN ÖZEL FONKSİYONLARI
-- ==========================================

-- Adminlerin kullanıcıları (ve dolayısıyla botları) tamamen silebilmesini sağlayan fonksiyon
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Arayan kişinin admin olup olmadığını kontrol et
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Sadece yöneticiler kullanıcı silebilir';
  end if;

  -- auth.users tablosundan sil (public.profiles ve diğer tablolara cascade eder)
  delete from auth.users where id = target_user_id;
end;
$$;

-- Elmas Satın Alma Fonksiyonu
create or replace function public.buy_diamonds(amount integer, price_paid numeric)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim. Lütfen giriş yapın.';
  end if;

  update public.profiles
  set diamonds = diamonds + amount
  where id = auth.uid();

  insert into public.diamond_transactions (receiver_id, amount, type, price_paid)
  values (auth.uid(), amount, 'purchase', price_paid);
end;
$$ language plpgsql security definer;

-- Hediye Elmas Gönderme Fonksiyonu
create or replace function public.send_diamond_gift(recipient_id uuid, amount integer)
returns void as $$
declare
  sender_diamonds integer;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim. Lütfen giriş yapın.';
  end if;

  if not exists (select 1 from public.profiles where id = recipient_id) then
    raise exception 'Alıcı kullanıcı bulunamadı.';
  end if;

  if recipient_id = auth.uid() then
    raise exception 'Kendinize hediye elmas gönderemezsiniz.';
  end if;

  select diamonds into sender_diamonds from public.profiles where id = auth.uid();
  if sender_diamonds is null or sender_diamonds < amount then
    raise exception 'Yetersiz elmas bakiyesi.';
  end if;

  update public.profiles
  set diamonds = diamonds - amount
  where id = auth.uid();

  update public.profiles
  set diamonds = diamonds + amount
  where id = recipient_id;

  insert into public.diamond_transactions (sender_id, receiver_id, amount, type)
  values (auth.uid(), recipient_id, amount, 'gift');
end;
$$ language plpgsql security definer;

create or replace function public.create_diamond_withdrawal_request(
  p_diamond_amount integer,
  p_bank_name text,
  p_iban text,
  p_account_holder_name text,
  p_user_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  unit_price numeric(10, 2);
  payout_pct numeric(5, 2);
  gross_amount numeric(10, 2);
  user_amount numeric(10, 2);
  app_amount numeric(10, 2);
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  if p_diamond_amount is null or p_diamond_amount <= 0 then
    raise exception 'Gecerli bir elmas miktari girin.';
  end if;

  if nullif(trim(p_bank_name), '') is null
    or nullif(trim(p_iban), '') is null
    or nullif(trim(p_account_holder_name), '') is null then
    raise exception 'Banka bilgileri eksiksiz doldurulmalidir.';
  end if;

  select coalesce(value::numeric, 1.00) into unit_price
  from public.system_settings
  where key = 'diamond_unit_price';

  select coalesce(value::numeric, 50.00) into payout_pct
  from public.system_settings
  where key = 'diamond_cashout_user_percentage';

  unit_price := coalesce(unit_price, 1.00);
  payout_pct := least(greatest(coalesce(payout_pct, 50.00), 0), 100);
  gross_amount := round((p_diamond_amount * unit_price)::numeric, 2);
  user_amount := round((gross_amount * payout_pct / 100)::numeric, 2);
  app_amount := round((gross_amount - user_amount)::numeric, 2);

  update public.profiles
  set diamonds = diamonds - p_diamond_amount
  where id = current_user_id
    and diamonds >= p_diamond_amount;

  if not found then
    raise exception 'Yetersiz elmas bakiyesi.';
  end if;

  insert into public.diamond_withdrawal_requests (
    user_id,
    diamond_amount,
    diamond_unit_price,
    payout_percentage,
    gross_cash_amount,
    user_cash_amount,
    app_cash_amount,
    bank_name,
    iban,
    account_holder_name,
    user_note
  )
  values (
    current_user_id,
    p_diamond_amount,
    unit_price,
    payout_pct,
    gross_amount,
    user_amount,
    app_amount,
    trim(p_bank_name),
    upper(replace(trim(p_iban), ' ', '')),
    trim(p_account_holder_name),
    nullif(trim(p_user_note), '')
  )
  returning id into request_id;

  insert into public.diamond_transactions (sender_id, amount, type, price_paid)
  values (current_user_id, p_diamond_amount, 'cashout_request', user_amount);

  return request_id;
end;
$$;

create or replace function public.update_diamond_withdrawal_status(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  now_value timestamp with time zone := timezone('utc'::text, now());
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if p_status not in ('pending', 'approved', 'completed', 'cancelled') then
    raise exception 'Gecersiz talep durumu.';
  end if;

  select * into req
  from public.diamond_withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Nakit cekim talebi bulunamadi.';
  end if;

  if req.status = p_status then
    update public.diamond_withdrawal_requests
    set admin_note = nullif(trim(p_admin_note), ''),
        reviewed_by = auth.uid(),
        updated_at = now_value
    where id = p_request_id;
    return;
  end if;

  if req.status = 'completed' and p_status <> 'completed' then
    raise exception 'Tamamlanmis talebin durumu degistirilemez.';
  end if;

  if p_status = 'cancelled' and req.status in ('pending', 'approved') and req.refunded_at is null then
    update public.profiles
    set diamonds = diamonds + req.diamond_amount
    where id = req.user_id;

    insert into public.diamond_transactions (receiver_id, amount, type, price_paid)
    values (req.user_id, req.diamond_amount, 'cashout_refund', req.user_cash_amount);
  end if;

  update public.diamond_withdrawal_requests
  set status = p_status,
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_by = auth.uid(),
      updated_at = now_value,
      approved_at = case when p_status = 'approved' and approved_at is null then now_value else approved_at end,
      completed_at = case when p_status = 'completed' then now_value else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now_value else cancelled_at end,
      refunded_at = case when p_status = 'cancelled' and req.status in ('pending', 'approved') and req.refunded_at is null then now_value else refunded_at end
  where id = p_request_id;
end;
$$;

revoke all on function public.create_diamond_withdrawal_request(integer, text, text, text, text) from public;
grant execute on function public.create_diamond_withdrawal_request(integer, text, text, text, text) to authenticated;

revoke all on function public.update_diamond_withdrawal_status(uuid, text, text) from public;
grant execute on function public.update_diamond_withdrawal_status(uuid, text, text) to authenticated;

-- ==========================================
-- 7. PROFİL ÖNE ÇIKARMA (PROFILE HIGHLIGHT)
-- ==========================================

-- Index
CREATE INDEX IF NOT EXISTS idx_profiles_highlighted ON public.profiles (is_highlighted) WHERE is_highlighted = true;

-- Ayar
INSERT INTO public.system_settings (key, value)
VALUES ('profile_highlight_cost', '50')
ON CONFLICT (key) DO NOTHING;

-- clean_inactive_users fonksiyonu
CREATE OR REPLACE FUNCTION public.clean_inactive_users()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
begin
  -- Çevrimdışı olanları işaretle
  update public.profiles
  set is_online = false
  where is_online = true
    and is_bot = false
    and last_active_at < now() - interval '3 minutes';

  -- Süresi dolmuş öne çıkarmaları kapat
  update public.profiles
  set is_highlighted = false
  where is_highlighted = true
    and highlighted_until < now();
end;
$$;

-- highlight_profile fonksiyonu
CREATE OR REPLACE FUNCTION public.highlight_profile(p_duration_hours integer default 24)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  current_user_id uuid := auth.uid();
  cost_diamonds integer;
  user_diamonds integer;
  new_highlighted_until timestamp with time zone;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  select coalesce(value::integer, 50) into cost_diamonds
  from public.system_settings
  where key = 'profile_highlight_cost';

  select diamonds into user_diamonds
  from public.profiles
  where id = current_user_id;

  if user_diamonds is null or user_diamonds < cost_diamonds then
    raise exception 'Yetersiz elmas bakiyesi. Profilinizi öne çıkarmak için % elmas gereklidir.', cost_diamonds;
  end if;

  update public.profiles
  set diamonds = diamonds - cost_diamonds
  where id = current_user_id;

  new_highlighted_until := now() + (p_duration_hours || ' hours')::interval;

  update public.profiles
  set is_highlighted = true,
      highlighted_until = new_highlighted_until
  where id = current_user_id;

  insert into public.diamond_transactions (sender_id, amount, type, price_paid)
  values (current_user_id, cost_diamonds, 'profile_highlight', null);

  return new_highlighted_until;
end;
$$;

REVOKE ALL ON FUNCTION public.highlight_profile(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.highlight_profile(integer) TO authenticated;

-- Güvenlik tetikleyicisi
CREATE OR REPLACE FUNCTION public.check_profile_highlight_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if (old.is_highlighted IS DISTINCT FROM new.is_highlighted or old.highlighted_until IS DISTINCT FROM new.highlighted_until) then
    if current_setting('role', true) = 'authenticated' and not public.is_admin() then
      raise exception 'Öne çıkarma alanları doğrudan güncellenemez. Lütfen ilgili sistemi kullanın.';
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS check_profile_highlight_update_trg ON public.profiles;
CREATE TRIGGER check_profile_highlight_update_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_highlight_update();

-- Çevrimiçi gizliliği için otomatik tetikleyici (trigger)
CREATE OR REPLACE FUNCTION public.handle_profile_online_privacy()
RETURNS trigger AS $$
BEGIN
  IF NEW.privacy_show_online = false THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_online_privacy_update ON public.profiles;
CREATE TRIGGER on_profile_online_privacy_update
  BEFORE INSERT OR UPDATE OF is_online, privacy_show_online ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_online_privacy();


-- SOURCE: migrations/0001_performance_indexes.sql
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


-- SOURCE: migrations/0002_add_gender.sql
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


-- SOURCE: migrations/0003_admin_user_deletion.sql
-- Adminlerin kullanıcıları (ve dolayısıyla botları) tamamen silebilmesini sağlayan fonksiyon
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Arayan kişinin admin olup olmadığını kontrol et
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Sadece yöneticiler kullanıcı silebilir';
  end if;

  -- auth.users tablosundan sil (public.profiles ve diğer tablolara cascade eder)
  delete from auth.users where id = target_user_id;
end;
$$;


-- SOURCE: migrations/0004_send_bot_welcome_message.sql
-- Bot hoş geldin mesajını güvenli bir şekilde eklemek için fonksiyon
create or replace function public.send_bot_welcome_message(conv_id uuid, bot_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Arayan kişinin bu sohbetin katılımcısı olup olmadığını doğrula
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = auth.uid()
  ) then
    raise exception 'Unauthorized';
  end if;

  -- bot_id'nin gerçekten bir bot olduğunu doğrula
  if not exists (
    select 1 from public.profiles
    where id = bot_id and is_bot = true
  ) then
    raise exception 'Target user is not a bot';
  end if;

  -- Mesajı ekle
  insert into public.messages (conversation_id, sender_id, content)
  values (conv_id, bot_id, 'Merhaba! Sesli eşleşmede tanıştığımıza çok memnun oldum. 😊 Nasıl gidiyor?');
end;
$$;


-- SOURCE: migrations/0005_push_notifications.sql
-- 1. Profiles tablosuna expo_push_token alanını ekleme
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expo_push_token text;

-- 2. pg_net eklentisini (HTTP istekleri için) aktif etme
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Yeni mesaj geldiğinde push bildirim gönderecek fonksiyon
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id uuid;
  recipient_token text;
  sender_name text;
  msg_body text;
BEGIN
  -- Alıcıyı bul (katılımcılardan gönderen kişi olmayan diğeri)
  SELECT user_id INTO recipient_id
  FROM public.conversation_participants
  WHERE conversation_id = new.conversation_id
    AND user_id != new.sender_id
  LIMIT 1;

  -- Alıcının push token'ını çek
  SELECT expo_push_token INTO recipient_token
  FROM public.profiles
  WHERE id = recipient_id;

  -- Gönderenin adını çek
  SELECT username INTO sender_name
  FROM public.profiles
  WHERE id = new.sender_id;

  -- Eğer alıcının geçerli bir token'ı varsa bildirimi gönder
  IF recipient_token IS NOT NULL AND recipient_token LIKE 'ExponentPushToken[%' THEN
    -- Bildirim gövdesi
    IF new.content IS NOT NULL AND new.content != '' THEN
      msg_body := new.content;
    ELSIF new.media_url IS NOT NULL THEN
      msg_body := 'Sana bir fotoğraf gönderdi 📷';
    ELSE
      msg_body := 'Yeni bir mesaj gönderdi';
    END IF;

    -- Asenkron HTTP POST isteği
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', COALESCE(sender_name, 'Anonim'),
        'body', msg_body,
        'sound', 'default',
        'data', json_build_object(
          'conversationId', new.conversation_id,
          'senderName', COALESCE(sender_name, 'Anonim'),
          'type', 'chat_message'
        )
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;

  RETURN new;
END;
$$;

-- 4. Tetikleyiciyi (trigger) tanımlama
DROP TRIGGER IF EXISTS on_message_inserted_push ON public.messages;
CREATE TRIGGER on_message_inserted_push
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message_push();


-- SOURCE: migrations/0006_diamond_system.sql
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


-- SOURCE: migrations/0007_diamond_packages.sql
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
drop policy if exists "Aktif paketleri herkes görebilir" on public.diamond_packages;
create policy "Aktif paketleri herkes görebilir" on public.diamond_packages
  for select using (true);

-- Adminler tüm paket işlemlerini yapabilir
drop policy if exists "Adminler paketleri yönetebilir" on public.diamond_packages;
create policy "Adminler paketleri yönetebilir" on public.diamond_packages
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Varsayılan paketler
-- Initial diamond package rows are already seeded by schema.sql.


-- SOURCE: migrations/0008_security_hardening.sql
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
drop policy if exists "conversation_participants_select" on public.conversation_participants;
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
drop policy if exists "conversation_participants_insert" on public.conversation_participants;
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
drop policy if exists "conversation_participants_delete" on public.conversation_participants;
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


-- SOURCE: migrations/0009_emulator_testing.sql
-- Add emulator testing toggle key to system_settings table
INSERT INTO public.system_settings (key, value)
VALUES
  ('emulator_mode_active', 'true')
ON CONFLICT (key) DO NOTHING;


-- SOURCE: migrations/0010_conversation_rpc.sql
-- ============================================================================
-- 0010_conversation_rpc.sql
-- RLS uyumlu 1:1 sohbet bulma/olusturma fonksiyonu
-- ============================================================================

-- RLS policy'lerinde ayni tabloya dogrudan bakmak recursion yaratabilecegi icin
-- katilimcilik kontrolunu security definer helper ile yapiyoruz.
create or replace function public.is_conversation_participant(check_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = check_conversation_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

drop policy if exists "conversation_participants_policy" on public.conversation_participants;
drop policy if exists "Allow all for conversation_participants" on public.conversation_participants;
drop policy if exists "Katılımcılar kendilerini ekleyebilir/görebilir" on public.conversation_participants;
drop policy if exists "conversation_participants_select" on public.conversation_participants;
drop policy if exists "conversation_participants_insert" on public.conversation_participants;
drop policy if exists "conversation_participants_delete" on public.conversation_participants;

drop policy if exists "conversation_participants_select" on public.conversation_participants;
create policy "conversation_participants_select"
  on public.conversation_participants
  for select
  using (
    auth.uid() = user_id
    or public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

drop policy if exists "conversation_participants_insert" on public.conversation_participants;
create policy "conversation_participants_insert"
  on public.conversation_participants
  for insert
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "conversation_participants_delete" on public.conversation_participants;
create policy "conversation_participants_delete"
  on public.conversation_participants
  for delete
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

create or replace function public.find_or_create_conversation(other_user_id uuid)
returns table(conversation_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  if other_user_id is null then
    raise exception 'Gecersiz kullanici.';
  end if;

  if other_user_id = current_user_id then
    raise exception 'Kendinizle sohbet baslatamazsiniz.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = other_user_id
      and banned_at is null
  ) then
    raise exception 'Kullanici bulunamadi.';
  end if;

  select mine.conversation_id
    into existing_conversation_id
  from public.conversation_participants as mine
  join public.conversation_participants as other
    on other.conversation_id = mine.conversation_id
  where mine.user_id = current_user_id
    and other.user_id = other_user_id
  limit 1;

  if existing_conversation_id is not null then
    return query select existing_conversation_id, false;
    return;
  end if;

  insert into public.conversations default values
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conversation_id, current_user_id),
    (new_conversation_id, other_user_id);

  return query select new_conversation_id, true;
end;
$$;

revoke all on function public.find_or_create_conversation(uuid) from public;
grant execute on function public.find_or_create_conversation(uuid) to authenticated;


-- SOURCE: migrations/0011_split_profile_private.sql
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

drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
create policy "profile_private_select_own_or_admin"
  on public.profile_private
  for select
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "profile_private_insert_own_or_admin" on public.profile_private;
create policy "profile_private_insert_own_or_admin"
  on public.profile_private
  for insert
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
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

drop policy if exists "profile_private_delete_own_or_admin" on public.profile_private;
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


-- SOURCE: migrations/0012_unread_message_badges.sql
-- ============================================================================
-- 0012_unread_message_badges.sql
-- Sohbet okunmamis mesaj rozetleri icin katilimci bazli okundu zamani.
-- ============================================================================

alter table public.conversation_participants
  add column if not exists last_read_at timestamp with time zone;

update public.conversation_participants
set last_read_at = timezone('utc'::text, now())
where last_read_at is null;

alter table public.conversation_participants
  alter column last_read_at set default timezone('utc'::text, now()),
  alter column last_read_at set not null;

create or replace function public.mark_conversation_read(read_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  update public.conversation_participants
  set last_read_at = timezone('utc'::text, now())
  where conversation_id = read_conversation_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Konusma bulunamadi.';
  end if;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create index if not exists idx_messages_unread_lookup
  on public.messages (conversation_id, created_at)
  where deleted_at is null;

create or replace function public.handle_new_message_push()
returns trigger
language plpgsql
security definer
as $$
declare
  recipient_id uuid;
  recipient_token text;
  sender_name text;
  msg_body text;
  unread_badge integer := 0;
begin
  select user_id into recipient_id
  from public.conversation_participants
  where conversation_id = new.conversation_id
    and user_id != new.sender_id
  limit 1;

  if recipient_id is null then
    return new;
  end if;

  select expo_push_token into recipient_token
  from public.profiles
  where id = recipient_id;

  select username into sender_name
  from public.profiles
  where id = new.sender_id;

  select count(*)::integer into unread_badge
  from public.messages m
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id
   and cp.user_id = recipient_id
  where m.sender_id != recipient_id
    and m.deleted_at is null
    and m.created_at > cp.last_read_at;

  if recipient_token is not null and recipient_token like 'ExponentPushToken[%' then
    if new.content is not null and new.content != '' then
      msg_body := new.content;
    elsif new.media_url is not null then
      msg_body := 'Sana bir fotograf gonderdi';
    else
      msg_body := 'Yeni bir mesaj gonderdi';
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', coalesce(sender_name, 'Anonim'),
        'body', msg_body,
        'sound', 'default',
        'badge', unread_badge,
        'data', json_build_object(
          'conversationId', new.conversation_id,
          'senderName', coalesce(sender_name, 'Anonim'),
          'type', 'chat_message'
        )
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  return new;
end;
$$;


-- SOURCE: migrations/0013_custom_notification_sound.sql
-- ============================================================================
-- 0013_custom_notification_sound.sql
-- Expo push bildirimlerinde uygulamanin ozel bildirim sesini kullan.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.handle_new_message_push()
returns trigger
language plpgsql
security definer
as $$
declare
  recipient_id uuid;
  recipient_token text;
  sender_name text;
  msg_body text;
  unread_badge integer := 0;
begin
  select user_id into recipient_id
  from public.conversation_participants
  where conversation_id = new.conversation_id
    and user_id != new.sender_id
  limit 1;

  if recipient_id is null then
    return new;
  end if;

  select expo_push_token into recipient_token
  from public.profiles
  where id = recipient_id;

  select username into sender_name
  from public.profiles
  where id = new.sender_id;

  select count(*)::integer into unread_badge
  from public.messages m
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id
   and cp.user_id = recipient_id
  where m.sender_id != recipient_id
    and m.deleted_at is null
    and m.created_at > cp.last_read_at;

  if recipient_token is not null and (recipient_token like 'ExponentPushToken[%' or recipient_token like 'ExpoPushToken[%') then
    if new.content is not null and new.content != '' then
      msg_body := new.content;
    elsif new.media_url is not null then
      msg_body := 'Sana bir fotograf gonderdi';
    else
      msg_body := 'Yeni bir mesaj gonderdi';
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', coalesce(sender_name, 'Anonim'),
        'body', msg_body,
        'sound', 'notification.mp3',
        'channelId', 'chat_messages',
        'badge', unread_badge,
        'data', json_build_object(
          'conversationId', new.conversation_id,
          'senderName', coalesce(sender_name, 'Anonim'),
          'type', 'chat_message'
        )
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  return new;
end;
$$;


-- SOURCE: migrations/0014_diamond_withdrawals.sql
-- ==========================================
-- ELMAS NAKIT CEKIM SISTEMI
-- ==========================================

insert into public.system_settings (key, value)
values ('diamond_cashout_user_percentage', '50')
on conflict (key) do nothing;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.diamond_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%purchase%'
    and pg_get_constraintdef(oid) like '%admin_deduct%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.diamond_transactions drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.diamond_transactions
  add constraint diamond_transactions_type_check
  check (type in ('purchase', 'gift', 'admin_grant', 'admin_deduct', 'cashout_request', 'cashout_refund'));

create table if not exists public.diamond_withdrawal_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  diamond_amount integer not null check (diamond_amount > 0),
  diamond_unit_price numeric(10, 2) not null check (diamond_unit_price >= 0),
  payout_percentage numeric(5, 2) not null check (payout_percentage >= 0 and payout_percentage <= 100),
  gross_cash_amount numeric(10, 2) not null check (gross_cash_amount >= 0),
  user_cash_amount numeric(10, 2) not null check (user_cash_amount >= 0),
  app_cash_amount numeric(10, 2) not null check (app_cash_amount >= 0),
  bank_name text not null,
  iban text not null,
  account_holder_name text not null,
  user_note text,
  admin_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed', 'cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  approved_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  refunded_at timestamp with time zone
);

create index if not exists idx_diamond_withdrawal_requests_user_id
  on public.diamond_withdrawal_requests(user_id);

create index if not exists idx_diamond_withdrawal_requests_status
  on public.diamond_withdrawal_requests(status);

alter table public.diamond_withdrawal_requests enable row level security;

drop policy if exists "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests;
drop policy if exists "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests;
create policy "Kullanicilar kendi nakit taleplerini gorebilir"
  on public.diamond_withdrawal_requests
  for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests;
drop policy if exists "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests;
create policy "Adminler nakit taleplerini yonetebilir"
  on public.diamond_withdrawal_requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.create_diamond_withdrawal_request(
  p_diamond_amount integer,
  p_bank_name text,
  p_iban text,
  p_account_holder_name text,
  p_user_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  unit_price numeric(10, 2);
  payout_pct numeric(5, 2);
  gross_amount numeric(10, 2);
  user_amount numeric(10, 2);
  app_amount numeric(10, 2);
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  if p_diamond_amount is null or p_diamond_amount <= 0 then
    raise exception 'Gecerli bir elmas miktari girin.';
  end if;

  if nullif(trim(p_bank_name), '') is null
    or nullif(trim(p_iban), '') is null
    or nullif(trim(p_account_holder_name), '') is null then
    raise exception 'Banka bilgileri eksiksiz doldurulmalidir.';
  end if;

  select coalesce(value::numeric, 1.00) into unit_price
  from public.system_settings
  where key = 'diamond_unit_price';

  select coalesce(value::numeric, 50.00) into payout_pct
  from public.system_settings
  where key = 'diamond_cashout_user_percentage';

  unit_price := coalesce(unit_price, 1.00);
  payout_pct := least(greatest(coalesce(payout_pct, 50.00), 0), 100);
  gross_amount := round((p_diamond_amount * unit_price)::numeric, 2);
  user_amount := round((gross_amount * payout_pct / 100)::numeric, 2);
  app_amount := round((gross_amount - user_amount)::numeric, 2);

  update public.profiles
  set diamonds = diamonds - p_diamond_amount
  where id = current_user_id
    and diamonds >= p_diamond_amount;

  if not found then
    raise exception 'Yetersiz elmas bakiyesi.';
  end if;

  insert into public.diamond_withdrawal_requests (
    user_id,
    diamond_amount,
    diamond_unit_price,
    payout_percentage,
    gross_cash_amount,
    user_cash_amount,
    app_cash_amount,
    bank_name,
    iban,
    account_holder_name,
    user_note
  )
  values (
    current_user_id,
    p_diamond_amount,
    unit_price,
    payout_pct,
    gross_amount,
    user_amount,
    app_amount,
    trim(p_bank_name),
    upper(replace(trim(p_iban), ' ', '')),
    trim(p_account_holder_name),
    nullif(trim(p_user_note), '')
  )
  returning id into request_id;

  insert into public.diamond_transactions (sender_id, amount, type, price_paid)
  values (current_user_id, p_diamond_amount, 'cashout_request', user_amount);

  return request_id;
end;
$$;

create or replace function public.update_diamond_withdrawal_status(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  now_value timestamp with time zone := timezone('utc'::text, now());
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if p_status not in ('pending', 'approved', 'completed', 'cancelled') then
    raise exception 'Gecersiz talep durumu.';
  end if;

  select * into req
  from public.diamond_withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Nakit cekim talebi bulunamadi.';
  end if;

  if req.status = p_status then
    update public.diamond_withdrawal_requests
    set admin_note = nullif(trim(p_admin_note), ''),
        reviewed_by = auth.uid(),
        updated_at = now_value
    where id = p_request_id;
    return;
  end if;

  if req.status = 'completed' and p_status <> 'completed' then
    raise exception 'Tamamlanmis talebin durumu degistirilemez.';
  end if;

  if p_status = 'cancelled' and req.status in ('pending', 'approved') and req.refunded_at is null then
    update public.profiles
    set diamonds = diamonds + req.diamond_amount
    where id = req.user_id;

    insert into public.diamond_transactions (receiver_id, amount, type, price_paid)
    values (req.user_id, req.diamond_amount, 'cashout_refund', req.user_cash_amount);
  end if;

  update public.diamond_withdrawal_requests
  set status = p_status,
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_by = auth.uid(),
      updated_at = now_value,
      approved_at = case when p_status = 'approved' and approved_at is null then now_value else approved_at end,
      completed_at = case when p_status = 'completed' then now_value else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now_value else cancelled_at end,
      refunded_at = case when p_status = 'cancelled' and req.status in ('pending', 'approved') and req.refunded_at is null then now_value else refunded_at end
  where id = p_request_id;
end;
$$;

revoke all on function public.create_diamond_withdrawal_request(integer, text, text, text, text) from public;
grant execute on function public.create_diamond_withdrawal_request(integer, text, text, text, text) to authenticated;

revoke all on function public.update_diamond_withdrawal_status(uuid, text, text) from public;
grant execute on function public.update_diamond_withdrawal_status(uuid, text, text) to authenticated;


-- SOURCE: migrations/0015_security_hardening_v2.sql
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
drop policy if exists "Profilleri herkes görüntüleyebilir" on public.profiles;
create policy "Profilleri herkes görüntüleyebilir" on public.profiles
  for select using (public.is_license_valid());

drop policy if exists "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles;
drop policy if exists "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles;
create policy "Kullanıcılar kendi profillerini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id and banned_at is null and public.is_license_valid());

drop policy if exists "Adminler tüm profilleri yönetebilir" on public.profiles;
drop policy if exists "Adminler tüm profilleri yönetebilir" on public.profiles;
create policy "Adminler tüm profilleri yönetebilir" on public.profiles
  for all using (public.is_admin() and public.is_license_valid());

-- B. STORIES
drop policy if exists "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories;
drop policy if exists "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories;
create policy "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories
  for select using ((expires_at > now() or is_highlight = true) and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi storylerini paylaşabilir" on public.stories;
drop policy if exists "Kullanıcılar kendi storylerini paylaşabilir" on public.stories;
create policy "Kullanıcılar kendi storylerini paylaşabilir" on public.stories
  for insert with check (auth.uid() = user_id and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi storylerini silebilir" on public.stories;
drop policy if exists "Kullanıcılar kendi storylerini silebilir" on public.stories;
create policy "Kullanıcılar kendi storylerini silebilir" on public.stories
  for delete using (auth.uid() = user_id and public.is_license_valid());

-- C. STORY_LIKES
drop policy if exists "Beğenileri herkes görebilir" on public.story_likes;
drop policy if exists "Beğenileri herkes görebilir" on public.story_likes;
create policy "Beğenileri herkes görebilir" on public.story_likes
  for select using (public.is_license_valid());

drop policy if exists "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes;
drop policy if exists "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes;
create policy "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes
  for insert with check (auth.uid() = user_id and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes;
drop policy if exists "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes;
create policy "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes
  for delete using (auth.uid() = user_id and public.is_license_valid());

-- D. CONVERSATIONS
drop policy if exists "Konuşmaları tüm kullanıcılar görebilir" on public.conversations;
drop policy if exists "Konuşmaları tüm kullanıcılar görebilir" on public.conversations;
create policy "Konuşmaları tüm kullanıcılar görebilir" on public.conversations
  for select using (auth.role() = 'authenticated' and public.is_license_valid());

drop policy if exists "Kullanıcılar yeni konuşma başlatabilir" on public.conversations;
drop policy if exists "Kullanıcılar yeni konuşma başlatabilir" on public.conversations;
create policy "Kullanıcılar yeni konuşma başlatabilir" on public.conversations
  for insert with check (auth.role() = 'authenticated' and public.is_license_valid());

-- E. CONVERSATION_PARTICIPANTS
drop policy if exists "conversation_participants_select" on public.conversation_participants;
drop policy if exists "conversation_participants_select" on public.conversation_participants;
create policy "conversation_participants_select" on public.conversation_participants
  for select using ((auth.uid() = user_id or public.is_conversation_participant(conversation_id) or public.is_admin()) and public.is_license_valid());

drop policy if exists "conversation_participants_insert" on public.conversation_participants;
drop policy if exists "conversation_participants_insert" on public.conversation_participants;
create policy "conversation_participants_insert" on public.conversation_participants
  for insert with check ((auth.uid() = user_id or public.is_admin()) and public.is_license_valid());

drop policy if exists "conversation_participants_delete" on public.conversation_participants;
drop policy if exists "conversation_participants_delete" on public.conversation_participants;
create policy "conversation_participants_delete" on public.conversation_participants
  for delete using ((auth.uid() = user_id or public.is_admin()) and public.is_license_valid());

-- F. MESSAGES
drop policy if exists "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages;
drop policy if exists "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages;
create policy "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages
  for select using (((exists (select 1 from public.conversation_participants where conversation_participants.conversation_id = messages.conversation_id and conversation_participants.user_id = auth.uid()) and deleted_at is null) or public.is_admin()) and public.is_license_valid());

drop policy if exists "Katılımcılar konuşmaya mesaj yazabilir" on public.messages;
drop policy if exists "Katılımcılar konuşmaya mesaj yazabilir" on public.messages;
create policy "Katılımcılar konuşmaya mesaj yazabilir" on public.messages
  for insert with check (auth.uid() = sender_id and exists (select 1 from public.conversation_participants where conversation_participants.conversation_id = messages.conversation_id and conversation_participants.user_id = auth.uid()) and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages;
drop policy if exists "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages;
create policy "Kullanıcılar kendi mesajlarını güncelleyebilir/silebilir" on public.messages
  for update using (auth.uid() = sender_id and public.is_license_valid());

-- G. BLOCKS
drop policy if exists "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks;
drop policy if exists "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks;
create policy "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks
  for select using (blocker_id = auth.uid() and public.is_license_valid());

drop policy if exists "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks;
drop policy if exists "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks;
create policy "Kullanıcılar engelleme ekleyebilir veya kaldırabilir" on public.blocks
  for all using (blocker_id = auth.uid() and public.is_license_valid());

-- H. REPORTS
drop policy if exists "Kullanıcılar şikayet oluşturabilir" on public.reports;
drop policy if exists "Kullanıcılar şikayet oluşturabilir" on public.reports;
create policy "Kullanıcılar şikayet oluşturabilir" on public.reports
  for insert with check (reporter_id = auth.uid() and public.is_license_valid());

drop policy if exists "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports;
drop policy if exists "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports;
create policy "Adminler tüm şikayetleri görebilir ve yönetebilir" on public.reports
  for all using (public.is_admin() and public.is_license_valid());

-- I. DAILY_MATCHES
drop policy if exists "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches;
drop policy if exists "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches;
create policy "Kullanıcılar kendi eşleşme haklarını görebilir" on public.daily_matches
  for select using (user_id = auth.uid() and public.is_license_valid());

drop policy if exists "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches;
drop policy if exists "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches;
create policy "Kullanıcılar kendi eşleşme haklarını güncelleyebilir" on public.daily_matches
  for update using (user_id = auth.uid() and public.is_license_valid());

-- J. DIAMOND_TRANSACTIONS
drop policy if exists "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions;
drop policy if exists "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions;
create policy "Kullanıcılar kendi transferlerini görebilir" on public.diamond_transactions
  for select using ((sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin()) and public.is_license_valid());

-- K. DIAMOND_PACKAGES
drop policy if exists "Aktif paketleri herkes görebilir" on public.diamond_packages;
drop policy if exists "Aktif paketleri herkes görebilir" on public.diamond_packages;
create policy "Aktif paketleri herkes görebilir" on public.diamond_packages
  for select using (public.is_license_valid());

drop policy if exists "Adminler paketleri yönetebilir" on public.diamond_packages;
drop policy if exists "Adminler paketleri yönetebilir" on public.diamond_packages;
create policy "Adminler paketleri yönetebilir" on public.diamond_packages
  for all using (public.is_admin() and public.is_license_valid());

-- L. DIAMOND_WITHDRAWAL_REQUESTS
drop policy if exists "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests;
drop policy if exists "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests;
create policy "Kullanicilar kendi nakit taleplerini gorebilir" on public.diamond_withdrawal_requests
  for select using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests;
drop policy if exists "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests;
create policy "Adminler nakit taleplerini yonetebilir" on public.diamond_withdrawal_requests
  for all using (public.is_admin() and public.is_license_valid());

-- M. PROFILE_PRIVATE
drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
create policy "profile_private_select_own_or_admin" on public.profile_private
  for select using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_insert_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_insert_own_or_admin" on public.profile_private;
create policy "profile_private_insert_own_or_admin" on public.profile_private
  for insert with check ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
create policy "profile_private_update_own_or_admin" on public.profile_private
  for update using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid())
  with check ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());

drop policy if exists "profile_private_delete_own_or_admin" on public.profile_private;
drop policy if exists "profile_private_delete_own_or_admin" on public.profile_private;
create policy "profile_private_delete_own_or_admin" on public.profile_private
  for delete using ((user_id = auth.uid() or public.is_admin()) and public.is_license_valid());


-- SOURCE: migrations/0016_fix_block_rls.sql
-- Fix blocks SELECT policy to allow users to see blocks where they are either the blocker or the blocked user.
drop policy if exists "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks;
drop policy if exists "Kullanıcılar engelledikleri veya kendilerini engelleyen kişileri görebilir" on public.blocks;

drop policy if exists "Kullanıcılar engelledikleri veya kendilerini engelleyen kişileri görebilir" on public.blocks;
create policy "Kullanıcılar engelledikleri veya kendilerini engelleyen kişileri görebilir" on public.blocks
  for select using ((blocker_id = auth.uid() or blocked_id = auth.uid()) and public.is_license_valid());


-- SOURCE: migrations/0017_get_email_by_username.sql
-- ============================================================================
-- 0017_get_email_by_username.sql
-- Kullanıcı adı ile giriş desteği için e-posta sorgulama RPC'si ekler.
-- ============================================================================

create or replace function public.get_email_by_username(p_username text)
returns text
language plpgsql
security definer
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from auth.users u
  join public.profiles p on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;

  return v_email;
end;
$$;

-- Herkesin bu RPC'yi çağırabilmesini sağla (Anonim/Giriş yapmamış kullanıcılar için)
grant execute on function public.get_email_by_username(text) to public, anon, authenticated;


-- SOURCE: migrations/0018_auto_confirm_all_emails.sql
-- ============================================================================
-- 0018_auto_confirm_all_emails.sql
-- Tüm kayıtların e-posta doğrulamasını otomatik olarak onaylar.
-- ============================================================================

create or replace function public.auto_confirm_anon_email()
returns trigger as $$
begin
  new.email_confirmed_at := now();
  new.confirmed_at := now();
  return new;
end;
$$ language plpgsql security definer;


-- SOURCE: migrations/0019_cash_withdrawal_toggle.sql
-- ============================================================================
-- 0019_cash_withdrawal_toggle.sql
-- Adds cash_withdrawal_enabled key to system_settings table.
-- ============================================================================

insert into public.system_settings (key, value)
values ('cash_withdrawal_enabled', 'true')
on conflict (key) do nothing;


-- SOURCE: migrations/0020_user_notification_settings.sql
-- 1. Profiles tablosuna bildirim ayarları kolonlarını ekleme
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_new_matches boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_calls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_campaigns boolean NOT NULL DEFAULT true;

-- 2. Yeni mesaj geldiğinde push bildirim gönderen fonksiyonu güncelleme (ayarı kontrol etmesi için)
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id uuid;
  recipient_token text;
  is_msg_notif_enabled boolean;
  sender_name text;
  msg_body text;
  unread_badge integer := 0;
BEGIN
  -- Alıcıyı bul (katılımcılardan gönderen kişi olmayan diğeri)
  SELECT user_id INTO recipient_id
  FROM public.conversation_participants
  WHERE conversation_id = new.conversation_id
    AND user_id != new.sender_id
  LIMIT 1;

  IF recipient_id IS NULL THEN
    RETURN new;
  END IF;

  -- Alıcının push token'ını ve bildirim ayarını çek
  SELECT expo_push_token, notification_messages INTO recipient_token, is_msg_notif_enabled
  FROM public.profiles
  WHERE id = recipient_id;

  -- Gönderenin adını çek
  SELECT username INTO sender_name
  FROM public.profiles
  WHERE id = new.sender_id;

  -- Alıcının okunmamış mesaj sayısını hesapla
  SELECT COUNT(*)::integer INTO unread_badge
  FROM public.messages m
  JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id
   AND cp.user_id = recipient_id
  WHERE m.sender_id != recipient_id
    AND m.deleted_at IS NULL
    AND m.created_at > cp.last_read_at;

  -- Eğer alıcının geçerli bir token'ı varsa ve mesaj bildirimleri açık ise gönder
  IF recipient_token IS NOT NULL
     AND is_msg_notif_enabled = true
     AND (recipient_token LIKE 'ExponentPushToken[%' OR recipient_token LIKE 'ExpoPushToken[%')
  THEN
    -- Bildirim gövdesi
    IF new.content IS NOT NULL AND new.content != '' THEN
      msg_body := new.content;
    ELSIF new.media_url IS NOT NULL THEN
      msg_body := 'Sana bir fotoğraf gönderdi';
    ELSE
      msg_body := 'Yeni bir mesaj gönderdi';
    END IF;

    -- Asenkron HTTP POST isteği ile push bildirimi gönder
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', COALESCE(sender_name, 'Anonim'),
        'body', msg_body,
        'sound', 'notification.mp3',
        'channelId', 'chat_messages',
        'badge', unread_badge,
        'data', json_build_object(
          'conversationId', new.conversation_id,
          'senderName', COALESCE(sender_name, 'Anonim'),
          'type', 'chat_message'
        )
      )::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;

  RETURN new;
END;
$$;


-- SOURCE: migrations/0021_calls_and_matches_notifications.sql
-- 1. Calls tablosunu oluşturma
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  room_name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- RLS ayarları
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;
drop policy if exists "Users can insert calls" on public.calls;
CREATE POLICY "Users can insert calls"
  ON public.calls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "Users can view their own calls" ON public.calls;
drop policy if exists "Users can view their own calls" on public.calls;
CREATE POLICY "Users can view their own calls"
  ON public.calls FOR SELECT
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- 2. Yeni arama isteğinde push bildirim gönderen fonksiyon
CREATE OR REPLACE FUNCTION public.handle_new_call_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_token text;
  is_calls_notif_enabled boolean;
  caller_name text;
  caller_avatar text;
BEGIN
  -- Alıcının push token'ını ve arama bildirim ayarını çek
  SELECT expo_push_token, notification_calls INTO recipient_token, is_calls_notif_enabled
  FROM public.profiles
  WHERE id = new.receiver_id;

  -- Gönderenin adını ve avatarını çek
  SELECT username, avatar_url INTO caller_name, caller_avatar
  FROM public.profiles
  WHERE id = new.caller_id;

  -- Eğer alıcının geçerli bir token'ı varsa ve arama bildirimleri açık ise gönder
  IF recipient_token IS NOT NULL
     AND is_calls_notif_enabled = true
     AND (recipient_token LIKE 'ExponentPushToken[%' OR recipient_token LIKE 'ExpoPushToken[%')
  THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', 'Gelen Arama 📞',
        'body', COALESCE(caller_name, 'Birisi') || ' seni arıyor...',
        'sound', 'default',
        'channelId', 'chat_messages',
        'data', json_build_object(
          'conversationId', new.room_name,
          'callerId', new.caller_id,
          'senderName', COALESCE(caller_name, 'Birisi'),
          'callerAvatar', caller_avatar,
          'type', 'call_incoming'
        )
      )::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_call_inserted_push ON public.calls;
CREATE TRIGGER on_call_inserted_push
  AFTER INSERT ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_call_push();

-- 3. Yeni eşleşmede push bildirim gönderen fonksiyon
CREATE OR REPLACE FUNCTION public.handle_new_match_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  other_user_id uuid;
  recipient_token text;
  is_matches_notif_enabled boolean;
  my_name text;
BEGIN
  -- Diğer katılımcıyı bul
  SELECT user_id INTO other_user_id
  FROM public.conversation_participants
  WHERE conversation_id = new.conversation_id
    AND user_id != new.user_id
  LIMIT 1;

  -- Eğer diğer katılımcı varsa (yani eşleşme tamamlandıysa)
  IF other_user_id IS NOT NULL THEN
    -- 1. Diğer kullanıcıya bildirim gönder
    SELECT expo_push_token, notification_new_matches INTO recipient_token, is_matches_notif_enabled
    FROM public.profiles
    WHERE id = other_user_id;

    SELECT username INTO my_name
    FROM public.profiles
    WHERE id = new.user_id;

    IF recipient_token IS NOT NULL
       AND is_matches_notif_enabled = true
       AND (recipient_token LIKE 'ExponentPushToken[%' OR recipient_token LIKE 'ExpoPushToken[%')
    THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := json_build_object(
          'to', recipient_token,
          'title', 'Yeni Eşleşme! 👥',
          'body', COALESCE(my_name, 'Birisi') || ' ile eşleştiniz! Sohbet etmeye başlayın.',
          'sound', 'default',
          'channelId', 'chat_messages',
          'data', json_build_object(
            'conversationId', new.conversation_id,
            'senderName', COALESCE(my_name, 'Birisi'),
            'type', 'new_match'
          )
        )::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    END IF;

    -- 2. Yeni eklenen kullanıcıya bildirim gönder
    SELECT expo_push_token, notification_new_matches INTO recipient_token, is_matches_notif_enabled
    FROM public.profiles
    WHERE id = new.user_id;

    SELECT username INTO my_name
    FROM public.profiles
    WHERE id = other_user_id;

    IF recipient_token IS NOT NULL
       AND is_matches_notif_enabled = true
       AND (recipient_token LIKE 'ExponentPushToken[%' OR recipient_token LIKE 'ExpoPushToken[%')
    THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := json_build_object(
          'to', recipient_token,
          'title', 'Yeni Eşleşme! 👥',
          'body', COALESCE(my_name, 'Birisi') || ' ile eşleştiniz! Sohbet etmeye başlayın.',
          'sound', 'default',
          'channelId', 'chat_messages',
          'data', json_build_object(
            'conversationId', new.conversation_id,
            'senderName', COALESCE(my_name, 'Birisi'),
            'type', 'new_match'
          )
        )::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_participant_inserted_push ON public.conversation_participants;
CREATE TRIGGER on_conversation_participant_inserted_push
  AFTER INSERT ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_match_push();


-- SOURCE: migrations/0022_profile_highlight.sql
-- 1. profiles tablosuna öne çıkarma kolonlarını ekle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_highlighted boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS highlighted_until timestamp with time zone;

-- 2. Index ekle
CREATE INDEX IF NOT EXISTS idx_profiles_highlighted ON public.profiles (is_highlighted) WHERE is_highlighted = true;

-- 3. Ayarı ekle
INSERT INTO public.system_settings (key, value)
VALUES ('profile_highlight_cost', '50')
ON CONFLICT (key) DO NOTHING;

-- 4. diamond_transactions tablosunun check constraint'ini güncelle
ALTER TABLE public.diamond_transactions DROP CONSTRAINT IF EXISTS diamond_transactions_type_check;
ALTER TABLE public.diamond_transactions ADD CONSTRAINT diamond_transactions_type_check
  CHECK (type = ANY (ARRAY['purchase'::text, 'gift'::text, 'admin_grant'::text, 'admin_deduct'::text, 'cashout_request'::text, 'cashout_refund'::text, 'profile_highlight'::text]));

-- 5. clean_inactive_users fonksiyonunu güncelle
CREATE OR REPLACE FUNCTION public.clean_inactive_users()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Çevrimdışı olanları işaretle
  update public.profiles
  set is_online = false
  where is_online = true
    and is_bot = false
    and last_active_at < now() - interval '3 minutes';

  -- Süresi dolmuş öne çıkarmaları kapat
  update public.profiles
  set is_highlighted = false
  where is_highlighted = true
    and highlighted_until < now();
end;
$function$;

-- 6. Öne çıkarma fonksiyonunu oluştur
CREATE OR REPLACE FUNCTION public.highlight_profile(p_duration_hours integer default 24)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  current_user_id uuid := auth.uid();
  cost_diamonds integer;
  user_diamonds integer;
  new_highlighted_until timestamp with time zone;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  -- Ayarlardan maliyeti çek
  select coalesce(value::integer, 50) into cost_diamonds
  from public.system_settings
  where key = 'profile_highlight_cost';

  -- Kullanıcının elmas bakiyesini kontrol et
  select diamonds into user_diamonds
  from public.profiles
  where id = current_user_id;

  if user_diamonds is null or user_diamonds < cost_diamonds then
    raise exception 'Yetersiz elmas bakiyesi. Profilinizi öne çıkarmak için % elmas gereklidir.', cost_diamonds;
  end if;

  -- Elmas bakiyesini düş
  update public.profiles
  set diamonds = diamonds - cost_diamonds
  where id = current_user_id;

  -- Bitiş süresini hesapla
  new_highlighted_until := now() + (p_duration_hours || ' hours')::interval;

  -- Profil tablosunu güncelle
  update public.profiles
  set is_highlighted = true,
      highlighted_until = new_highlighted_until
  where id = current_user_id;

  -- İşlemi diamond_transactions tablosuna ekle
  insert into public.diamond_transactions (sender_id, amount, type, price_paid)
  values (current_user_id, cost_diamonds, 'profile_highlight', null);

  return new_highlighted_until;
end;
$$;

-- Fonksiyon yetkisini ver
REVOKE ALL ON FUNCTION public.highlight_profile(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.highlight_profile(integer) TO authenticated;

-- 7. Güvenlik tetikleyicisi
CREATE OR REPLACE FUNCTION public.check_profile_highlight_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if (old.is_highlighted IS DISTINCT FROM new.is_highlighted or old.highlighted_until IS DISTINCT FROM new.highlighted_until) then
    if current_setting('role', true) = 'authenticated' and not public.is_admin() then
      raise exception 'Öne çıkarma alanları doğrudan güncellenemez. Lütfen ilgili sistemi kullanın.';
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS check_profile_highlight_update_trg ON public.profiles;
CREATE TRIGGER check_profile_highlight_update_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_highlight_update();


-- SOURCE: migrations/0023_block_rls_filters.sql
-- ============================================================================
-- 0023_block_rls_filters.sql
-- Engelleme (Block) durumlarının RLS seviyesinde otomatik filtrelenmesi
-- ============================================================================

-- 1. PROFILES SELECT Politikasının Güncellenmesi
-- Engellenen veya engelleyen profillerin listelenmesini engelle.
DROP POLICY IF EXISTS "Profilleri herkes görüntüleyebilir" ON public.profiles;
drop policy if exists "Profilleri herkes görüntüleyebilir" on public.profiles;
CREATE POLICY "Profilleri herkes görüntüleyebilir" ON public.profiles
  FOR SELECT USING (
    public.is_license_valid()
    AND (
      auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = auth.uid() AND blocked_id = profiles.id)
           OR (blocker_id = profiles.id AND blocked_id = auth.uid())
      )
    )
  );

-- 2. CONVERSATION_PARTICIPANTS SELECT Politikasının Güncellenmesi
-- Engelleme durumu olan konuşma katılımcılarını filtrele.
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;
drop policy if exists "conversation_participants_select" on public.conversation_participants;
CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT USING (
    (
      auth.uid() = user_id
      OR (
        public.is_conversation_participant(conversation_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks
          WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
             OR (blocker_id = user_id AND blocked_id = auth.uid())
        )
      )
      OR public.is_admin()
    )
    AND public.is_license_valid()
  );

-- 3. MESSAGES SELECT Politikasının Güncellenmesi
-- Engellenen kişilerden gelen veya engellenen kişilere gönderilen mesajların okunmasını engelle.
DROP POLICY IF EXISTS "Mesajları sadece sohbet katılımcıları ve adminler görebilir" ON public.messages;
drop policy if exists "Mesajları sadece sohbet katılımcıları ve adminler görebilir" on public.messages;
CREATE POLICY "Mesajları sadece sohbet katılımcıları ve adminler görebilir" ON public.messages
  FOR SELECT USING (
    (
      (
        EXISTS (
          SELECT 1 FROM public.conversation_participants
          WHERE conversation_participants.conversation_id = messages.conversation_id
          AND conversation_participants.user_id = auth.uid()
        )
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks
          WHERE (blocker_id = auth.uid() AND blocked_id = sender_id)
             OR (blocker_id = sender_id AND blocked_id = auth.uid())
        )
      )
      OR public.is_admin()
    )
    AND public.is_license_valid()
  );

-- 4. MESSAGES INSERT Politikasının Güncellenmesi
-- Engelleme durumu varsa konuşmaya yeni mesaj yazılmasını engelle.
DROP POLICY IF EXISTS "Katılımcılar konuşmaya mesaj yazabilir" ON public.messages;
drop policy if exists "Katılımcılar konuşmaya mesaj yazabilir" on public.messages;
CREATE POLICY "Katılımcılar konuşmaya mesaj yazabilir" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_participants.conversation_id = messages.conversation_id
      AND conversation_participants.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.blocks b ON
        (b.blocker_id = cp.user_id AND b.blocked_id = auth.uid()) OR
        (b.blocker_id = auth.uid() AND b.blocked_id = cp.user_id)
      WHERE cp.conversation_id = messages.conversation_id
    )
    AND public.is_license_valid()
  );

-- 5. STORIES SELECT Politikasının Güncellenmesi
-- Engellenen veya engelleyen kullanıcıların storylerini görmesini engelle.
DROP POLICY IF EXISTS "Aktif veya öne çıkarılmış storyleri herkes görebilir" ON public.stories;
drop policy if exists "Aktif veya öne çıkarılmış storyleri herkes görebilir" on public.stories;
CREATE POLICY "Aktif veya öne çıkarılmış storyleri herkes görebilir" ON public.stories
  FOR SELECT USING (
    (expires_at > now() OR is_highlight = true)
    AND public.is_license_valid()
    AND (
      auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
           OR (blocker_id = user_id AND blocked_id = auth.uid())
      )
    )
  );


-- SOURCE: migrations/0024_user_privacy_settings.sql
-- 1. Profiles tablosuna gizlilik ayarları kolonlarını ekleme
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_show_online boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_show_in_searches boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_show_read_receipts boolean NOT NULL DEFAULT true;

-- 2. Çevrimiçi gizliliği için otomatik tetikleyici (trigger)
CREATE OR REPLACE FUNCTION public.handle_profile_online_privacy()
RETURNS trigger AS $$
BEGIN
  IF NEW.privacy_show_online = false THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_online_privacy_update ON public.profiles;
CREATE TRIGGER on_profile_online_privacy_update
  BEFORE INSERT OR UPDATE OF is_online, privacy_show_online ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_online_privacy();

-- 3. conversation_participants tablosunu realtime yayınına ekleme
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;
END;
$$;


-- SOURCE: migrations/0025_security_fixes_phase1.sql
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

drop policy if exists "Kullanıcılar sadece kendi konuşmalarını görebilir" on public.conversations;
create policy "Kullanıcılar sadece kendi konuşmalarını görebilir" on public.conversations
  for select using (
    (public.is_conversation_participant(id) or public.is_admin())
    and public.is_license_valid()
  );


-- SOURCE: migrations/0026_account_deletion_rpc.sql
-- ============================================================================
-- 0026_account_deletion_rpc.sql
-- Apple App Store 5.1.1(v) kuralı gereğince kullanıcıların kendi hesaplarını
-- ve ilişkili tüm verilerini kalıcı olarak silebilmelerini sağlayan RPC.
-- ============================================================================

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Kimlik doğrulaması yapılmamış kullanıcı!';
  end if;

  -- 1. Kullanıcıya ait ilişkili verileri temizle
  delete from public.story_likes where user_id = current_user_id;
  delete from public.stories where user_id = current_user_id;
  delete from public.messages where sender_id = current_user_id;
  delete from public.conversation_participants where user_id = current_user_id;
  delete from public.blocks where blocker_id = current_user_id or blocked_id = current_user_id;
  delete from public.reports where reporter_id = current_user_id or reported_id = current_user_id;
  delete from public.daily_matches where user_id = current_user_id;
  delete from public.diamond_withdrawal_requests where user_id = current_user_id;
  delete from public.diamond_transactions where sender_id = current_user_id or receiver_id = current_user_id;
  delete from public.diamond_wallets where user_id = current_user_id;
  delete from public.profile_private where user_id = current_user_id;

  -- 2. Profiles tablosundan sil
  delete from public.profiles where id = current_user_id;

  -- 3. auth.users tablosundan sil
  delete from auth.users where id = current_user_id;
end;
$$;

grant execute on function public.delete_user_account() to authenticated;


-- SOURCE: migrations/0027_story_interactions.sql
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

drop policy if exists "Beğenileri herkes görebilir" on public.story_likes;
create policy "Beğenileri herkes görebilir" on public.story_likes
  for select using (true);

drop policy if exists "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes;
create policy "Kullanıcılar kendi beğenisini ekleyebilir" on public.story_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Kullanıcılar kendi beğenisini kaldırabilir" on public.story_likes;
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


-- SOURCE: migrations/0028_demo_licensing.sql
-- Add licensing keys to system_settings table
INSERT INTO public.system_settings (key, value)
VALUES
  ('demo_license_active', 'true'),
  ('demo_expiration_date', '2030-12-31T23:59:59Z')
ON CONFLICT (key) DO NOTHING;


-- SOURCE: migrations/0029_fix_license_check_timestamp.sql
-- 0029_fix_license_check_timestamp.sql
-- Fix timestamp conversion error in is_license_valid function
-- Handles empty or malformed strings safely without throwing 22007 error

-- 1. Ensure demo_expiration_date in system_settings has a valid value if empty or null
UPDATE public.system_settings
SET value = '2030-12-31T23:59:59Z'
WHERE key = 'demo_expiration_date' AND (value = '' OR value IS NULL);

-- 2. Update is_license_valid to safely check non-empty string and catch cast exceptions
create or replace function public.is_license_valid()
returns boolean
language plpgsql
stable
security definer as $$
declare
  license_active text;
  expiration_date text;
  parsed_date timestamp with time zone;
begin
  select value into license_active from public.system_settings where key = 'demo_license_active';
  select value into expiration_date from public.system_settings where key = 'demo_expiration_date';

  if license_active is null or license_active <> 'true' then
    return false;
  end if;

  if expiration_date is not null and trim(expiration_date) <> '' then
    begin
      parsed_date := trim(expiration_date)::timestamp with time zone;
      if now() > parsed_date then
        return false;
      end if;
    exception when others then
      -- If the date format is malformed or invalid, do not break application queries
      null;
    end;
  end if;

  return true;
end;
$$;


-- Guide sections 1.3 / 1.4: owner UPDATE policy and remaining realtime tables.
-- Kılavuz 1.3 ve 1.4: mevcut verileri silmeden eksikleri tamamlar.

do $setup$
declare
  table_name text;
begin
  foreach table_name in array array['conversations', 'daily_matches', 'stories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = 'app_owner_update_media_v1'
  ) then
    create policy app_owner_update_media_v1
      on storage.objects for update to authenticated
      using (
        bucket_id in ('avatars', 'chat_media', 'stories')
        and auth.uid() = owner
      )
      with check (
        bucket_id in ('avatars', 'chat_media', 'stories')
        and auth.uid() = owner
      );
  end if;
end;
$setup$;


-- Sonuçları kontrol edin; önceki audit sorgusu da tekrar çalıştırılabilir.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE';

commit;
