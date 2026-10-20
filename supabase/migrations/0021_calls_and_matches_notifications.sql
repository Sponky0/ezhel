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
CREATE POLICY "Users can insert calls" 
  ON public.calls FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "Users can view their own calls" ON public.calls;
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
