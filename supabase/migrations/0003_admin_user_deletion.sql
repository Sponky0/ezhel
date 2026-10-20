-- Adminlerin kullanıcıları (ve dolayısıyla botları) tamamen silebilmesini sağlayan fonksiyon
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Arayan kişinin admin olup olmadığını kontrol et
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Sadece yöneticiler kullanıcı silebilir';
  end if;

  -- auth.users tablosundan sil (public.profiles ve diğer tablolara cascade eder)
  delete from auth.users where id = target_user_id;
end;
$$;
