-- READ ONLY. Run only after separate authorization against the verified target.
-- CLI 2.120.0 must show exactly the unapplied 20261010233446 migration afterward.
begin read only;
select current_user,version();
do $$ declare t record; begin
 if to_regclass('auth.sessions') is null or to_regclass('auth.mfa_amr_claims') is null then raise exception 'Managed Auth sessions/AMR schema required'; end if;
 if to_regclass('storage.objects') is null then raise exception 'Storage inventory required'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261010233446') then raise exception 'Lifecycle version already applied: preserve applied bytes'; end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>12 or not exists(select 1 from supabase_migrations.schema_migrations where version='20261008191709') then raise exception 'Expected twelve genuine migration records including UUID bootstrap'; end if;
 for t in select c.oid::regclass as relation,c.relowner,c.relrowsecurity,n.nspname||'.'||c.relname as policy_target
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid in(to_regclass('storage.objects'),to_regclass('realtime.messages')) loop
  if not t.relrowsecurity then raise exception 'Managed RLS missing on %',t.relation; end if;
  -- A registered sighup GUC proves supautils is loaded, not a custom placeholder.
  -- Its exact caller/table allowlist replaces managed-owner SET ROLE; never edit it.
  if not pg_has_role(current_user,t.relowner,'USAGE') and not exists(
   select 1 from pg_settings where name='supautils.policy_grants' and context='sighup'
    and (setting::jsonb->current_user) ? t.policy_target
  ) then raise exception 'Managed CREATE POLICY permission unverified for %; require owner authority or provider supautils allowlist, never ownership/membership changes',t.relation; end if;
 end loop;
 if exists(select 1 from public.platform_users group by auth_user_id having auth_user_id is not null and count(*)>1)
  or exists(select 1 from public.platform_users group by lower(trim(email)) having count(*)>1)
  or exists(select 1 from public.platform_users where status is null or status not in ('Active','Pending','Inactive')) then raise exception 'Ambiguous team inventory'; end if;
end $$;
select n.nspname,t.relname,c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where c.contype='f' and c.confrelid in ('auth.users'::regclass,'public.platform_users'::regclass)
order by n.nspname,t.relname,c.conname;
select tablename,policyname,roles,cmd,permissive from pg_policies where schemaname in ('storage','realtime') order by schemaname,tablename,policyname;
rollback;
