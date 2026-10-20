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
create policy "Kullanicilar kendi nakit taleplerini gorebilir"
  on public.diamond_withdrawal_requests
  for select
  using (user_id = auth.uid() or public.is_admin());

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
