-- ============================================================================
-- 0010_conversation_rpc.sql
-- RLS uyumlu 1:1 sohbet bulma/olusturma fonksiyonu
-- ============================================================================

-- RLS policy'lerinde ayni tabloya dogrudan bakmak recursion yaratabilecegi icin
-- katilimcilik kontrolunu security definer helper ile yapiyoruz.
create or replace function public.is_conversation_participant(check_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = check_conversation_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

drop policy if exists "conversation_participants_policy" on public.conversation_participants;
drop policy if exists "Allow all for conversation_participants" on public.conversation_participants;
drop policy if exists "Katılımcılar kendilerini ekleyebilir/görebilir" on public.conversation_participants;
drop policy if exists "conversation_participants_select" on public.conversation_participants;
drop policy if exists "conversation_participants_insert" on public.conversation_participants;
drop policy if exists "conversation_participants_delete" on public.conversation_participants;

create policy "conversation_participants_select"
  on public.conversation_participants
  for select
  using (
    auth.uid() = user_id
    or public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

create policy "conversation_participants_insert"
  on public.conversation_participants
  for insert
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

create policy "conversation_participants_delete"
  on public.conversation_participants
  for delete
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

create or replace function public.find_or_create_conversation(other_user_id uuid)
returns table(conversation_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Yetkisiz erisim. Lutfen giris yapin.';
  end if;

  if other_user_id is null then
    raise exception 'Gecersiz kullanici.';
  end if;

  if other_user_id = current_user_id then
    raise exception 'Kendinizle sohbet baslatamazsiniz.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = other_user_id
      and banned_at is null
  ) then
    raise exception 'Kullanici bulunamadi.';
  end if;

  select mine.conversation_id
    into existing_conversation_id
  from public.conversation_participants as mine
  join public.conversation_participants as other
    on other.conversation_id = mine.conversation_id
  where mine.user_id = current_user_id
    and other.user_id = other_user_id
  limit 1;

  if existing_conversation_id is not null then
    return query select existing_conversation_id, false;
    return;
  end if;

  insert into public.conversations default values
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conversation_id, current_user_id),
    (new_conversation_id, other_user_id);

  return query select new_conversation_id, true;
end;
$$;

revoke all on function public.find_or_create_conversation(uuid) from public;
grant execute on function public.find_or_create_conversation(uuid) to authenticated;
