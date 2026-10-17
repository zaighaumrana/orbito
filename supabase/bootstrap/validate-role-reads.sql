-- READ ONLY structural verification after separately approved migration 14.
-- Actual signed-in Master/Manager/Billing API/browser tests remain a separate gate.
begin read only;
do $$ declare t text; f record;begin
 if current_user<>'postgres' then raise exception 'Trusted postgres operator required';end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>14
  or not exists(select 1 from supabase_migrations.schema_migrations where version='20261012231226' and cardinality(statements)>0) then
  raise exception 'Expected fourteen genuine CLI migration records';
 end if;
 foreach t in array array['clients','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log','platform_config','platform_users','support_tickets','bridge_sources','bridge_events','bridge_failures','billing_projections','paper_requests','paper_supplies','operator_audit','config_jobs'] loop
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='operator_read' and cmd='SELECT' and qual like '%master_admin%')
   or not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='platform_master_read_ceiling' and cmd='SELECT' and permissive='RESTRICTIVE' and qual like '%master_admin%')
   or exists(select 1 from pg_policies where schemaname='public' and tablename=t and cmd in ('ALL','SELECT') and permissive='PERMISSIVE' and policyname<>'operator_read' and roles && array['public','authenticated']::name[]) then
   raise exception 'Unexpected raw-table read policy on %',t;
  end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='platform_private' and p.proname not in ('operator_role','require_role') and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))) then
  raise exception 'Private helper execution is exposed';
 end if;
 for f in select p.* from pg_proc p where p.oid in ('public.platform_read_page(text,integer)'::regprocedure,'public.platform_save_client(integer,jsonb)'::regprocedure,'public.platform_resolve_ticket(integer)'::regprocedure,'public.platform_dashboard_summary()'::regprocedure) loop
  if f.proowner<>'postgres'::regrole or not f.prosecdef or not ('search_path=""'=any(f.proconfig)) or has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'Unexpected read/write boundary ownership, search path or grant';end if;
 end loop;
 if (select count(*) from pg_policies where schemaname in ('storage','realtime') and policyname='platform_master_read_ceiling' and permissive='RESTRICTIVE')<>2
  or exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname in ('public','platform_private')) then
  raise exception 'Storage/private Realtime/publication ceiling missing';
 end if;
end $$;
select version,name from supabase_migrations.schema_migrations order by version;
select 'REQUIRED: real signed-in role API/Console smoke, no fabricated claims' as hosted_verification;
rollback;
