-- Disposable PostgreSQL bootstrap. Create roles anon, authenticated, service_role
-- once per cluster before running this file; service_role must BYPASSRLS.
create schema auth;
-- Synthetic SQL fixtures represent confirmed users; this is not hosted Auth.
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),
 is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$ select email from auth.users where id=auth.uid() $$;
-- SQL-only fixture sessions, not a provider/JWT validation substitute. The real
-- PG17/GoTrue suites test malformed/missing claims and native session behavior.
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),not_after timestamptz);
create table auth.mfa_amr_claims(id uuid primary key default gen_random_uuid(),session_id uuid references auth.sessions(id) on delete cascade,authentication_method text not null);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create function auth.fixture_session() returns trigger language plpgsql as $$begin
 insert into auth.sessions(id,user_id) values(new.id,new.id);
 insert into auth.mfa_amr_claims(session_id,authentication_method) values(new.id,'password');return new;
end$$;
create trigger fixture_session after insert on auth.users for each row execute function auth.fixture_session();
create schema storage;
create table storage.objects(id uuid primary key,owner uuid);
alter table storage.objects enable row level security;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create publication supabase_realtime;
