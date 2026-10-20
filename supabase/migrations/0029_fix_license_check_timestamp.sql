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
security definer as 
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
;
