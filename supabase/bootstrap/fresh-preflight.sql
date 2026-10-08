-- Run preflight.sql first. This additional check refuses an existing application.
do $$
begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','S','v','m')) or to_regnamespace('platform_private') is not null then
  raise exception 'Not an empty Platform; use staging upgrade, never replay baseline';
 end if;
 if to_regclass('supabase_migrations.schema_migrations') is not null then
  if exists(select 1 from supabase_migrations.schema_migrations) then raise exception 'Migration history is not empty; inspect partial installation'; end if;
 end if;
 if exists(select 1 from auth.users) then raise exception 'Fresh bootstrap expects no Auth users; create the administrator after the chain'; end if;
 if exists(select 1 from pg_event_trigger where evtname='ensure_rls')
  or to_regprocedure('public.rls_auto_enable()') is not null then
  raise exception 'Baseline RLS trigger/function collision: inspect owner/definition and use the documented controlled procedure';
 end if;
 -- Exercise the real privilege needed by the immutable baseline, then roll it back.
end $$;
begin;
create function public.platform_bootstrap_event_probe() returns event_trigger language plpgsql as $$begin end$$;
create event trigger platform_bootstrap_event_probe on ddl_command_end when tag in ('CREATE TABLE') execute function public.platform_bootstrap_event_probe();
rollback;
