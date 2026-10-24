-- Owner-run, read-only verification. Does not create or advance an upgrade job.
begin read only;
select jsonb_build_object(
 'migration_applied', exists(
  select 1 from supabase_migrations.schema_migrations where version='20261024014319'),
 'functions', (
  select jsonb_agg(jsonb_build_object(
   'function', n.nspname||'.'||p.proname,
   'managed_requires_present', strpos(pg_get_functiondef(p.oid),
    '(c.pairing_mode=''managed'' and c.infrastructure_state=''present'')')>0,
   'byo_allows_unknown_or_present', strpos(pg_get_functiondef(p.oid),
    '(c.pairing_mode=''byo'' and c.infrastructure_state in(''unknown'',''present''))')>0,
   'null_policy_fails_closed', strpos(pg_get_functiondef(p.oid),'not coalesce(')>0,
   'security_definer', p.prosecdef,
   'configuration', p.proconfig,
   'anonymous_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) order by n.nspname,p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.oid in (
   'public.platform_upgrade_prepare(integer,uuid,text,text)'::regprocedure,
   'platform_private.upgrade_fence(uuid)'::regprocedure)),
 'byo_client', (
  select jsonb_build_object('id',id,'project_url',supabase_url,
   'lifecycle_state',lifecycle_state,'pairing_mode',pairing_mode,
   'infrastructure_state',infrastructure_state)
  from public.clients where supabase_url='https://ampwuqwokkbhkizcetsd.supabase.co'),
 'byo_upgrade_jobs', (
  select count(*) from platform_private.shop_upgrade_jobs j
  join public.clients c on c.id=j.client_id
  where c.supabase_url='https://ampwuqwokkbhkizcetsd.supabase.co')
);
rollback;
