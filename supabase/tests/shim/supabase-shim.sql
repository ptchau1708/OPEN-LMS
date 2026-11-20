-- Minimal Supabase-like environment for local testing — chỉ dùng cho tools/run-db-tests.sh --plain (Postgres thường, không có Supabase CLI). Supabase CLI đã có sẵn các schema này..
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator login noinherit;
    grant anon, authenticated, service_role to authenticator;
  end if;
  -- Vai trò có thể đã tồn tại từ lần chạy trước mà thiếu bypassrls (Supabase thật: service_role luôn bypassrls).
  alter role service_role bypassrls;
end $$;
create schema auth;
create schema extensions;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text, role text,
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create publication supabase_realtime;

create schema realtime;
create table realtime.messages (
  id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text $$;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;

create extension pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- storage (tối thiểu cho migration 20261111000002_v2_assess.sql)
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(cardinality(string_to_array(name, '/')) - 1, 0)] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
