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
