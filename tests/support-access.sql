-- Disposable local fixtures only. UUID-authorized master with a real Auth email.
begin;
create function pg_temp.support_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERT: %',msg;end if;end$$;
insert into auth.users(id,email,email_confirmed_at) values('98000000-0000-4000-8000-000000000001','canonical-master@example.test',now()),('98000000-0000-4000-8000-000000000002','manager@example.test',now());
insert into public.platform_users(auth_user_id,name,email,role,status) values('98000000-0000-4000-8000-000000000002','Manager','manager@example.test','portfolio_manager','Active');
select platform_private.initialize_config('Fixture master','Disposable support fixture');
select platform_private.bind_master('98000000-0000-4000-8000-000000000001',null,'Disposable support fixture');
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
select pg_temp.support_assert(public.platform_operator_identity()->>'email'='canonical-master@example.test','existing identity RPC returns canonical Auth email for UUID-authorized master');
insert into public.clients(id,name,plan,onboarding_version,owner_name,owner_email,supabase_url,supabase_anon,shop_url,currency,billing_policy,pairing_mode)
values(9800,'Support repair','Basic',2,'Reserved owner','owner@example.test','https://dexzxxqkbwnpetbsuxxv.supabase.co','','https://shop.example.test','PKR','usage-v1','managed'),
(9801,'BYO rejected','Basic',2,'BYO owner','byo@example.test','https://bcdefghijklmnopqrstu.supabase.co','','https://byo.example.test','PKR','usage-v1','byo');
select public.platform_provision_begin(9800,'98000000-0000-4000-8000-000000000010','managed-setup','{"site_key":"public-site"}');
select public.platform_onboarding_step('98000000-0000-4000-8000-000000000010','prepare','{}');
select public.platform_managed_stage('98000000-0000-4000-8000-000000000010','server-secrets','passed',null);
select public.platform_managed_stage('98000000-0000-4000-8000-000000000010','support-auth-config','passed',null);
select pg_temp.support_assert((public.platform_managed_stage('98000000-0000-4000-8000-000000000010','support-auth-config','running',null)->>'skip')::boolean,'support stage persists and skips after passing independently of server secrets');
select public.platform_provision_step('98000000-0000-4000-8000-000000000010','complete','{}');
update public.clients set lifecycle_state='Suspended',status='Suspended' where id=9800;
create temp table support_before as select to_jsonb(c) client,(select jsonb_agg(to_jsonb(j)) from platform_private.provision_jobs j where client_id=9800) jobs,
(select jsonb_agg(to_jsonb(s)) from platform_private.provision_stages s where request_id='98000000-0000-4000-8000-000000000010') stages,
(select to_jsonb(s)-'health' from platform_private.shop_credentials s where client_id=9800) credentials from public.clients c where id=9800;
set local role authenticated;
select pg_temp.support_assert(public.platform_support_access_target(9800,'98000000-0000-4000-8000-000000000020')->>'owner_request'='98000000-0000-4000-8000-000000000010','repair reads the original immutable reservation while suspended');
select public.platform_support_access_target(9800,'98000000-0000-4000-8000-000000000020');
reset role;
select public.platform_support_access_finish(9800,'98000000-0000-4000-8000-000000000020',true);
select pg_temp.support_assert((select health->>'support_auth_configured'='true' from platform_private.shop_credentials where client_id=9800),'repair records nonsecret configuration status');
select pg_temp.support_assert(exists(select 1 from support_before b where b.client=(select to_jsonb(c) from public.clients c where id=9800)
and b.jobs=(select jsonb_agg(to_jsonb(j)) from platform_private.provision_jobs j where client_id=9800)
and b.stages=(select jsonb_agg(to_jsonb(s)) from platform_private.provision_stages s where request_id='98000000-0000-4000-8000-000000000010')
and b.credentials=(select to_jsonb(s)-'health' from platform_private.shop_credentials s where client_id=9800)),'repair preserves client, billing/lifecycle, pairing/owner and completed provisioning jobs/stages exactly');
select pg_temp.support_assert((select count(*)=1 from public.operator_audit where action='provision_support_access_repair' and client_id=9800),'same repair UUID is correlated without duplicate intent');
select pg_temp.support_assert(exists(select 1 from public.operator_audit where action='provision_support_access_result' and detail->>'configured'='true'),'repair result audited');
select pg_temp.support_assert(not exists(select 1 from public.operator_audit where action like 'provision_support_access%' and detail::text ~ 'canonical-master|PLATFORM_SUPABASE|PLATFORM_AUTH_EMAIL|secret'),'configuration values absent from repair audit');
do $$begin
 begin
  perform public.platform_provision_begin(9800,gen_random_uuid(),'managed-setup','{"site_key":"public-site","PLATFORM_AUTH_EMAIL":"browser@example.test"}');
  raise exception 'browser managed config accepted';
 exception when others then if sqlerrm not like 'Managed V2 setup and public site key required%' then raise;end if;end;
 begin
  perform public.platform_provision_begin(9800,'98000000-0000-4000-8000-000000000030','onboarding-status','{}');
  begin perform public.platform_support_access_target(9800,gen_random_uuid());raise exception 'pending provisioning accepted';exception when others then if sqlerrm not like 'Finish or reconcile pending provisioning%' then raise;end if;end;
  raise exception 'rollback pending fixture';
 exception when others then if sqlerrm<>'rollback pending fixture' then raise;end if;end;
end$$;
do $$declare flag text;begin
 begin perform public.platform_support_access_target(9801,gen_random_uuid());raise exception 'BYO accepted';exception when others then if sqlerrm not like 'Existing managed Shop%' then raise;end if;end;
 foreach flag in array array['Archived','destroyed','decommissioned'] loop
  begin
   if flag='Archived' then update public.clients set lifecycle_state=flag,status=flag where id=9800;else update public.clients set infrastructure_state=flag where id=9800;end if;
   begin perform public.platform_support_access_target(9800,gen_random_uuid());raise exception 'retired accepted';exception when others then if sqlerrm not like 'Existing managed Shop%' then raise;end if;end;
   raise exception 'rollback retired fixture';
  exception when others then if sqlerrm<>'rollback retired fixture' then raise;end if;end;
 end loop;
end$$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 begin perform public.platform_support_access_target(9800,gen_random_uuid());raise exception 'manager accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
select pg_temp.support_assert(not has_function_privilege('anon','public.platform_support_access_target(integer,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.platform_support_access_finish(integer,uuid,boolean)','EXECUTE'),'anonymous repair and caller result writes denied');
rollback;
