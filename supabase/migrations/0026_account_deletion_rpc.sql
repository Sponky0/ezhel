-- ============================================================================
-- 0026_account_deletion_rpc.sql
-- Apple App Store 5.1.1(v) kuralı gereğince kullanıcıların kendi hesaplarını
-- ve ilişkili tüm verilerini kalıcı olarak silebilmelerini sağlayan RPC.
-- ============================================================================

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  
  if current_user_id is null then
    raise exception 'Kimlik doğrulaması yapılmamış kullanıcı!';
  end if;

  -- 1. Kullanıcıya ait ilişkili verileri temizle
  delete from public.story_likes where user_id = current_user_id;
  delete from public.stories where user_id = current_user_id;
  delete from public.messages where sender_id = current_user_id;
  delete from public.conversation_participants where user_id = current_user_id;
  delete from public.blocks where blocker_id = current_user_id or blocked_id = current_user_id;
  delete from public.reports where reporter_id = current_user_id or reported_id = current_user_id;
  delete from public.daily_matches where user_id = current_user_id;
  delete from public.diamond_withdrawal_requests where user_id = current_user_id;
  delete from public.diamond_transactions where sender_id = current_user_id or receiver_id = current_user_id;
  delete from public.diamond_wallets where user_id = current_user_id;
  delete from public.profile_private where user_id = current_user_id;
  
  -- 2. Profiles tablosundan sil
  delete from public.profiles where id = current_user_id;

  -- 3. auth.users tablosundan sil
  delete from auth.users where id = current_user_id;
end;
$$;

grant execute on function public.delete_user_account() to authenticated;
