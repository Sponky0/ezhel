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
