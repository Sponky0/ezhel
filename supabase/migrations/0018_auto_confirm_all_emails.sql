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
