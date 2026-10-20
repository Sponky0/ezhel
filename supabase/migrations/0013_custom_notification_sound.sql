-- ============================================================================
-- 0013_custom_notification_sound.sql
-- Expo push bildirimlerinde uygulamanin ozel bildirim sesini kullan.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.handle_new_message_push()
returns trigger
language plpgsql
security definer
as $$
declare
  recipient_id uuid;
  recipient_token text;
  sender_name text;
  msg_body text;
  unread_badge integer := 0;
begin
  select user_id into recipient_id
  from public.conversation_participants
  where conversation_id = new.conversation_id
    and user_id != new.sender_id
  limit 1;

  if recipient_id is null then
    return new;
  end if;

  select expo_push_token into recipient_token
  from public.profiles
  where id = recipient_id;

  select username into sender_name
  from public.profiles
  where id = new.sender_id;

  select count(*)::integer into unread_badge
  from public.messages m
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id
   and cp.user_id = recipient_id
  where m.sender_id != recipient_id
    and m.deleted_at is null
    and m.created_at > cp.last_read_at;

  if recipient_token is not null and (recipient_token like 'ExponentPushToken[%' or recipient_token like 'ExpoPushToken[%') then
    if new.content is not null and new.content != '' then
      msg_body := new.content;
    elsif new.media_url is not null then
      msg_body := 'Sana bir fotograf gonderdi';
    else
      msg_body := 'Yeni bir mesaj gonderdi';
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := json_build_object(
        'to', recipient_token,
        'title', coalesce(sender_name, 'Anonim'),
        'body', msg_body,
        'sound', 'notification.mp3',
        'channelId', 'chat_messages',
        'badge', unread_badge,
        'data', json_build_object(
          'conversationId', new.conversation_id,
          'senderName', coalesce(sender_name, 'Anonim'),
          'type', 'chat_message'
        )
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  return new;
end;
$$;
