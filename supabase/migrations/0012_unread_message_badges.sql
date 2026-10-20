-- ============================================================================
-- 0012_unread_message_badges.sql
-- Sohbet okunmamis mesaj rozetleri icin katilimci bazli okundu zamani.
-- ============================================================================

alter table public.conversation_participants
  add column if not exists last_read_at timestamp with time zone;

update public.conversation_participants
set last_read_at = timezone('utc'::text, now())
where last_read_at is null;

alter table public.conversation_participants
  alter column last_read_at set default timezone('utc'::text, now()),
  alter column last_read_at set not null;

create or replace function public.mark_conversation_read(read_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  update public.conversation_participants
  set last_read_at = timezone('utc'::text, now())
  where conversation_id = read_conversation_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Konusma bulunamadi.';
  end if;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create index if not exists idx_messages_unread_lookup
  on public.messages (conversation_id, created_at)
  where deleted_at is null;

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

  if recipient_token is not null and recipient_token like 'ExponentPushToken[%' then
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
        'sound', 'default',
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
