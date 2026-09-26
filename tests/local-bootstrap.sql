-- Disposable PostgreSQL bootstrap. Create roles anon, authenticated, service_role
-- once per cluster before running this file; service_role must BYPASSRLS.
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$ select email from auth.users where id=auth.uid() $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create publication supabase_realtime;
