-- Read-only capability checks for forward 16. Run as the trusted operator only
-- after separately authorized rollout; also verify genuine CLI migration history.
begin read only;
do $$
declare f record;
begin
 for f in select * from (values
  ('public.platform_team_clear_failed_invitation(uuid,uuid,uuid,uuid)',false,true),
  ('public.platform_team_delete_state(uuid,uuid)',true,false),
  ('public.platform_account_access_notice()',true,false)
 ) as required(signature,authenticated_access,service_access) loop
  if to_regprocedure(f.signature) is null then raise exception 'Missing reviewed Team function';end if;
  if has_function_privilege('anon',f.signature,'execute')
   or has_function_privilege('authenticated',f.signature,'execute') is distinct from f.authenticated_access
   or has_function_privilege('service_role',f.signature,'execute') is distinct from f.service_access
   or not exists(select 1 from pg_proc p where p.oid=to_regprocedure(f.signature) and p.prosecdef
    and pg_get_userbyid(p.proowner)='postgres' and 'search_path=""'=any(p.proconfig))
  then raise exception 'Unexpected Team function authority';end if;
 end loop;
 if not exists(select 1 from pg_class where oid='platform_private.team_operations'::regclass and relrowsecurity)
  or has_table_privilege('anon','platform_private.team_operations','select,insert,update,delete,truncate,references,trigger,maintain')
  or has_table_privilege('authenticated','platform_private.team_operations','select,insert,update,delete,truncate,references,trigger,maintain')
  or has_table_privilege('service_role','platform_private.team_operations','select,insert,update,delete,truncate,references,trigger,maintain')
  or not exists(select 1 from platform_private.password_verification_policy where singleton and enabled=false)
 then raise exception 'Team operation privileges or disabled deletion gate require review';end if;
end $$;
rollback;
