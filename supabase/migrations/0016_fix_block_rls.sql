-- Fix blocks SELECT policy to allow users to see blocks where they are either the blocker or the blocked user.
drop policy if exists "Kullanıcılar engelledikleri kişileri görebilir" on public.blocks;
drop policy if exists "Kullanıcılar engelledikleri veya kendilerini engelleyen kişileri görebilir" on public.blocks;

create policy "Kullanıcılar engelledikleri veya kendilerini engelleyen kişileri görebilir" on public.blocks
  for select using ((blocker_id = auth.uid() or blocked_id = auth.uid()) and public.is_license_valid());
