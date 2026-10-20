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
