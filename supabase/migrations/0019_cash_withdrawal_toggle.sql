-- ============================================================================
-- 0019_cash_withdrawal_toggle.sql
-- Adds cash_withdrawal_enabled key to system_settings table.
-- ============================================================================

insert into public.system_settings (key, value)
values ('cash_withdrawal_enabled', 'true')
on conflict (key) do nothing;
