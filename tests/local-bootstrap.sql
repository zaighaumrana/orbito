-- Disposable PostgreSQL bootstrap. Create roles anon, authenticated, service_role
-- once per cluster before running this file; service_role must BYPASSRLS.
create schema auth;
-- Synthetic SQL fixtures represent confirmed users; this is not hosted Auth.
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),
 is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$ select email from auth.users where id=auth.uid() $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create publication supabase_realtime;
