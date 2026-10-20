-- ============================================================================
-- 0017_get_email_by_username.sql
-- Kullanıcı adı ile giriş desteği için e-posta sorgulama RPC'si ekler.
-- ============================================================================

create or replace function public.get_email_by_username(p_username text)
returns text
language plpgsql
security definer
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from auth.users u
  join public.profiles p on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
  
  return v_email;
end;
$$;

-- Herkesin bu RPC'yi çağırabilmesini sağla (Anonim/Giriş yapmamış kullanıcılar için)
grant execute on function public.get_email_by_username(text) to public, anon, authenticated;
