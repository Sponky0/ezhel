-- Bot hoş geldin mesajını güvenli bir şekilde eklemek için fonksiyon
create or replace function public.send_bot_welcome_message(conv_id uuid, bot_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Arayan kişinin bu sohbetin katılımcısı olup olmadığını doğrula
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = auth.uid()
  ) then
    raise exception 'Unauthorized';
  end if;

  -- bot_id'nin gerçekten bir bot olduğunu doğrula
  if not exists (
    select 1 from public.profiles
    where id = bot_id and is_bot = true
  ) then
    raise exception 'Target user is not a bot';
  end if;

  -- Mesajı ekle
  insert into public.messages (conversation_id, sender_id, content)
  values (conv_id, bot_id, 'Merhaba! Sesli eşleşmede tanıştığımıza çok memnun oldum. 😊 Nasıl gidiyor?');
end;
$$;
