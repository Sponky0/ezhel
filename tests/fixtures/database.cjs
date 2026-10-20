const fs=require('node:fs'),path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
module.exports=async function setup(){const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage; create schema net; create schema realtime; create table realtime.messages(id bigint); alter table realtime.messages enable row level security; create function realtime.topic() returns text language sql stable as $$select current_setting('test.topic',true)$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon')$$;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz,confirmed_at timestamptz);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,owner uuid,name text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
create function net.http_post(url text,body jsonb,headers jsonb) returns bigint language sql as $$select 1::bigint$$;
`);
const sql=fs.readFileSync(path.join(__dirname,'base-schema.sql'),'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pg_net;/gi,'');await db.exec(sql);
await db.exec(`grant usage on schema public,auth,storage to authenticated,anon; grant select,insert,update,delete on all tables in schema public,storage to authenticated;grant select on all tables in schema public,storage to anon;grant execute on all functions in schema public,auth to authenticated,anon;`);


return db;};
