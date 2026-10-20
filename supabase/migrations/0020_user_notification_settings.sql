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
