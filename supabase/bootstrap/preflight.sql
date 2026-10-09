-- Read-only prerequisites. Run on the VERIFIED Platform as postgres, never Shop.
do $$ declare required text;
begin
 if current_user<>'postgres' then raise exception 'Use the trusted postgres database operator'; end if;
 if current_setting('server_version_num')::integer<170000 then raise exception 'PostgreSQL 17+ required by immutable baseline MAINTAIN grants'; end if;
 foreach required in array array['postgres','anon','authenticated','service_role'] loop
  if not exists(select 1 from pg_roles where rolname=required) then raise exception 'Missing Supabase role: %',required; end if;
 end loop;
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then raise exception 'service_role must retain Supabase BYPASSRLS'; end if;
 if pg_has_role('authenticated','postgres','MEMBER') or pg_has_role('anon','postgres','MEMBER')
  or pg_has_role('service_role','postgres','MEMBER') then raise exception 'API roles must not inherit postgres'; end if;
 if to_regprocedure('auth.uid()') is null or to_regclass('auth.users') is null then raise exception 'Supabase Auth schema/functions missing'; end if;
 foreach required in array array['id','email','email_confirmed_at','is_anonymous','banned_until','deleted_at'] loop
  if not exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name=required) then
   raise exception 'Auth prerequisite missing: auth.users.% (finish actual Auth migrations)',required;
  end if;
 end loop;
 if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions')
  or to_regprocedure('extensions.gen_random_bytes(integer)') is null or to_regprocedure('extensions.digest(text,text)') is null then
  raise exception 'Install pgcrypto in extensions before the Platform chain';
 end if;
 if not exists(select 1 from pg_extension where extname='supabase_vault')
  or to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null
  or to_regprocedure('vault.create_secret(text,text,text,uuid)') is null
  or to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') is null then
  raise exception 'Real Supabase Vault prerequisites missing; do not substitute plaintext storage';
 end if;
 if not exists(select 1 from pg_publication where pubname='supabase_realtime' and pubowner=(select oid from pg_roles where rolname='postgres') and not puballtables) then
  raise exception 'Explicit-table supabase_realtime publication owned by postgres required';
 end if;
end $$;
select current_user, current_setting('server_version') as server_version,
 (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto') as pgcrypto_schema,
 (select extversion from pg_extension where extname='supabase_vault') as vault_version;
