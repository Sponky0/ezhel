const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const names=['0034_boost_super_messages.sql','0035_atomic_voice_matching.sql'];
const sql=`-- Napan design/call update. Existing installation with migrations0030-0033 required.
-- Apply ONCE; no profile reset or table drop.
begin;
create table if not exists public.napan_patch_history(name text primary key,applied_at timestamptz not null default now());
alter table public.napan_patch_history enable row level security;
revoke all on public.napan_patch_history from anon,authenticated;
do $guard$ begin
 if exists(select 1 from public.napan_patch_history where name='design-and-calls-v2') then raise exception 'This patch is already applied'; end if;
 if to_regclass('public.confirmed_matches') is null or to_regclass('public.story_like_history') is not null then raise exception 'Expected0030-0033 installed and0034 not yet applied'; end if;
end $guard$;
`+names.map(name=>'\n-- SOURCE: '+name+'\n'+fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8').replace(/^\s*(begin|commit);\s*$/gmi,'')).join('\n')+"\ninsert into public.napan_patch_history(name) values('design-and-calls-v2');\ncommit;\n";
fs.writeFileSync(path.join(root,'supabase/patches/design-and-calls.sql'),sql);console.log('Prepared supabase/patches/design-and-calls.sql');
