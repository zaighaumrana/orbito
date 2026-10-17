-- READ ONLY, verified Platform only, after separate hosted authorization.
-- Staging currently has 12 genuine rows. The approved rollout must apply 13 and
-- 14 in order; never repair/fabricate history or apply permissions before 13.
begin read only;
do $$ declare t record; count_versions integer;begin
 if current_user<>'postgres' then raise exception 'Trusted postgres operator required';end if;
 if current_setting('server_version_num')::integer<170000 then raise exception 'PostgreSQL 17+ required';end if;
 select count(*) into count_versions from supabase_migrations.schema_migrations;
 if count_versions not in (12,13) or not exists(select 1 from supabase_migrations.schema_migrations where version='20261008191709')
  or count_versions=13 and not exists(select 1 from supabase_migrations.schema_migrations where version='20261010233446') then
  raise exception 'Expected 12 UUID-hardened or 13 lifecycle-hardened genuine versions';
 end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261012231226') then raise exception 'Read-isolation migration already applied; preserve applied bytes';end if;
 if to_regclass('auth.sessions') is null or to_regclass('auth.mfa_amr_claims') is null or to_regclass('storage.objects') is null or to_regclass('realtime.messages') is null then
  raise exception 'Managed Auth/Storage/Realtime prerequisites required';
 end if;
 if not exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables and pubowner='postgres'::regrole) then
  raise exception 'Explicit-table postgres-owned Realtime publication required';
 end if;
 if exists(select 1 from pg_publication_namespace pn join pg_publication p on p.oid=pn.pnpubid join pg_namespace n on n.oid=pn.pnnspid where p.pubname='supabase_realtime' and n.nspname in ('public','platform_private')) then
  raise exception 'Schema-level Realtime membership requires separate review';
 end if;
 for t in select c.oid::regclass relation,c.relowner,c.relrowsecurity,n.nspname||'.'||c.relname as policy_target
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid in ('storage.objects'::regclass,'realtime.messages'::regclass) loop
  if not t.relrowsecurity then raise exception 'Managed RLS missing on %',t.relation;end if;
  -- Require loaded supautils and the exact caller/table policy allowlist, or
  -- inherited owner authority. SET membership alone is not used by migrations.
  if not pg_has_role(current_user,t.relowner,'USAGE') and not exists(
   select 1 from pg_settings where name='supautils.policy_grants' and context='sighup'
    and (setting::jsonb->current_user) ? t.policy_target
  ) then
   raise exception 'Managed CREATE POLICY permission unverified for %; require owner authority or provider supautils allowlist, never ownership/membership changes',t.relation;
  end if;
 end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','platform_private') and c.relkind in ('v','m')) then
  raise exception 'Additional view/materialized-view surface requires independent review';
 end if;
end $$;
select schemaname,tablename,policyname,cmd,roles,permissive from pg_policies where schemaname in ('public','platform_private','storage','realtime') order by schemaname,tablename,policyname;
select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename;
-- Review any provider/custom functions, exposed schemas, GraphQL, aliases, API
-- grants and default privileges in addition to this checked-in source inventory.
rollback;
