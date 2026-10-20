-- The story composer writes this field and the story feed selects it.
-- Additive migration: existing rows and policies are preserved.
alter table public.stories
  add column if not exists media_transform jsonb;

notify pgrst, 'reload schema';
