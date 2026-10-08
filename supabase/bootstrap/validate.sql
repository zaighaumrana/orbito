-- Post-bootstrap database assertions. No writes, secret values or hosted RPCs.
do $$ declare identity uuid; api_role text; protected_table text; signature text; function_oid oid;
begin
 if current_user<>'postgres' then raise exception 'Validate as trusted postgres'; end if;
 if (select nspowner from pg_namespace where nspname='platform_private') is distinct from 'postgres'::regrole::oid then
  raise exception 'Unexpected private schema ownership';
 end if;
 foreach protected_table in array array['platform_private.master_identity','platform_private.master_bootstrap_approval','public.platform_config'] loop
  if not exists(select 1 from pg_class where oid=to_regclass(protected_table) and relowner='postgres'::regrole and relrowsecurity) then
   raise exception 'Unexpected protected table ownership/RLS: %',protected_table;
  end if;
 end loop;
 if not exists(select 1 from public.platform_config where id=1 and admin_password is null) then raise exception 'Configuration missing or legacy password not cleared'; end if;
 select auth_user_id into identity from platform_private.master_identity where singleton;
 if identity is null then raise exception 'Master UUID binding missing'; end if;
 if not exists(select 1 from auth.users where id=identity and email_confirmed_at is not null and not coalesce(is_anonymous,false)
  and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'Bound Auth user is not verified/enabled'; end if;
 foreach api_role in array array['anon','authenticated','service_role'] loop
  if pg_has_role(api_role,'postgres','MEMBER') or has_schema_privilege(api_role,'platform_private','CREATE') then
   raise exception 'API role can assume owner or create private code: %',api_role;
  end if;
  if has_function_privilege(api_role,'platform_private.bind_master(uuid,uuid,text)','EXECUTE')
   or has_function_privilege(api_role,'platform_private.initialize_config(text,text)','EXECUTE')
   or has_table_privilege(api_role,'platform_private.master_identity','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   or has_table_privilege(api_role,'platform_private.master_bootstrap_approval','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
   raise exception 'Unexpected bootstrap privilege for %',api_role;
  end if;
  -- Column ACLs can grant access even when the table-level ACL does not.
  if exists(select 1 from pg_attribute where attrelid in ('platform_private.master_identity'::regclass,'platform_private.master_bootstrap_approval'::regclass)
   and attnum>0 and not attisdropped and has_column_privilege(api_role,attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then
   raise exception 'Unexpected bootstrap column privilege for %',api_role;
  end if;
 end loop;
 foreach signature in array array['platform_private.bind_master(uuid,uuid,text)','platform_private.initialize_config(text,text)'] loop
  function_oid:=to_regprocedure(signature);
  if not exists(select 1 from pg_proc where oid=function_oid and proowner='postgres'::regrole and not prosecdef
   and 'search_path=""'=any(proconfig)) then raise exception 'Unexpected bootstrap function ownership/security/search_path: %',signature; end if;
 end loop;
 if not exists(select 1 from pg_proc where oid='platform_private.operator_role()'::regprocedure and proowner='postgres'::regrole
  and prosecdef and 'search_path=""'=any(proconfig)) then raise exception 'Unexpected operator authority ownership/security/search_path'; end if;
 -- Service operational rights on public.platform_config are intentionally retained.
 -- Unprivileged browser roles must have only the existing alias column rights.
 foreach api_role in array array['anon','authenticated'] loop
  if has_table_privilege(api_role,'public.platform_config','INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   or has_column_privilege(api_role,'public.platform_config','admin_password','SELECT,INSERT,UPDATE,REFERENCES') then
   raise exception 'Unexpected configuration/legacy credential privilege for %',api_role;
  end if;
 end loop;
 if exists(select 1 from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) like '%auth.email%') then
  raise exception 'Email-based public policy requires review';
 end if;
end $$;
select auth_user_id,revision,bound_at,bound_by_database_role from platform_private.master_identity;
select id,admin_username,admin_password is null as legacy_password_cleared from public.platform_config;
-- Database-only identity proof. A real browser Auth/Turnstile smoke is separate.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from platform_private.master_identity),true);
set local role authenticated;
select public.platform_operator_identity();
rollback;
