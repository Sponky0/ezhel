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
