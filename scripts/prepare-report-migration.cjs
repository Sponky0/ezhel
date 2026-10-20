// Generates the same reviewed additive patch used by local database tests.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file => /^003[0-3]_.*\.sql$/.test(file)).sort();
if (files.length !== 4) throw Error('Expected migrations 0030–0033');
const sql = `-- Napan existing installation: additive patch 0030–0033. Run ONCE as project owner.
-- Contains no table drops, profile reset, passwords or payment keys.
-- Do not run tests/fixtures/base-schema.sql on a real project.
begin;
create table if not exists public.napan_patch_history(name text primary key,applied_at timestamptz not null default now());
alter table public.napan_patch_history enable row level security;
revoke all on public.napan_patch_history from anon,authenticated;
do $guard$ begin
 if exists(select 1 from public.napan_patch_history where name='real-user-report-v1') then raise exception 'This patch is already applied'; end if;
 if to_regclass('public.profiles') is null then raise exception 'Existing Napan schema is required'; end if;
end $guard$;
` + files.map(file => '\n-- SOURCE: ' + file + '\n' + fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8').replace(/^\s*(begin|commit);\s*$/gmi, '')).join('\n') + `\ninsert into public.napan_patch_history(name) values('real-user-report-v1');\ncommit;\n`;
fs.mkdirSync(path.join(root, 'supabase/patches'), { recursive: true });
fs.writeFileSync(path.join(root, 'supabase/patches/real-user-report.sql'), sql);
console.log('Prepared supabase/patches/real-user-report.sql');
