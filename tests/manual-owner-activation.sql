-- Disposable local database only; no secret values returned.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
select pg_temp.assert(not has_function_privilege('service_role','platform_private.provision_step_legacy(uuid,text,jsonb)','EXECUTE'),'retired direct writer inaccessible to service role');
select pg_temp.assert(not has_function_privilege('service_role','public.platform_shop_credential(integer)','EXECUTE'),'retired privileged resolver inaccessible');
insert into auth.users(id,email) values('31000000-0000-4000-8000-000000000001','platformadmin@retailos.internal');
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
do $$
declare c integer; blocked boolean; r jsonb; old_health jsonb; n integer;
begin
 insert into public.clients(name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email,pairing_mode)
 values('Manual Shop','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,'Owner','owner@example.test','byo') returning id into c;
 perform public.platform_provision_begin(c,'41000000-0000-4000-8000-000000000001','pair-shop','{}');
 r:=public.platform_onboarding_step('41000000-0000-4000-8000-000000000001','prepare');
 select count(*) into n from vault.secrets;
 foreach r in array array['"credential"'::jsonb,'"context"'::jsonb,'"secret"'::jsonb] loop
  blocked:=false;
  begin perform public.platform_provision_step('41000000-0000-4000-8000-000000000001',r#>>'{}','{"credential":"never-store-this"}'); exception when others then blocked:=true; end;
  perform pg_temp.assert(blocked,'V2 cannot enter legacy resolver or credential writer');
 end loop;
 perform pg_temp.assert((select count(*)=n from vault.secrets) and (select secret_id is null from platform_private.shop_credentials where client_id=c),'no historical privileged key write');
 perform public.platform_provision_step('41000000-0000-4000-8000-000000000001','complete','{}');
 perform public.platform_provision_begin(c,'41000000-0000-4000-8000-000000000002','invite-owner','{}');
 blocked:=false;
 begin perform public.platform_onboarding_step('41000000-0000-4000-8000-000000000002','prepare'); exception when others then blocked:=true; end;
 perform pg_temp.assert(blocked,'optional invite requires provisioned infrastructure');
 perform public.platform_provision_step('41000000-0000-4000-8000-000000000002','complete','{}');
 perform public.platform_provision_begin(c,'41000000-0000-4000-8000-000000000003','bootstrap-shop','{}');
 -- Simulate a retained legacy privileged slot without exposing its value.
 update platform_private.shop_credentials set secret_id=vault.create_secret('synthetic-retired-key-not-a-real-secret') where client_id=c;
 r:=public.platform_onboarding_step('41000000-0000-4000-8000-000000000003','prepare');
 perform pg_temp.assert(position('synthetic-retired-key-not-a-real-secret' in r::text)=0,'V2 never resolves a retained historical key');
 perform pg_temp.assert(platform_private.shop_credential(c) ? 'project_ref' and not(platform_private.shop_credential(c) ? 'service_role_key'),'legacy context is metadata only');
 perform public.platform_onboarding_step('41000000-0000-4000-8000-000000000003','registered',jsonb_build_object('source_id','94000000-0000-4000-8000-000000000001','client_binding','orbito-client-'||c));
 perform public.platform_onboarding_step('41000000-0000-4000-8000-000000000003','health','{"infrastructure":"ready","owner_setup":"owner_setup_pending","owner_invite":"owner_invite_not_started","onboarding":"onboarding_pending","config":{"repair_module_enabled":true,"inventory_module_enabled":false,"technician_module_enabled":false,"live_tracking_enabled":false,"ems_enabled":false,"ems_track_breaks":false,"suspended":false}}'::jsonb||jsonb_build_object('source_id','94000000-0000-4000-8000-000000000001','contract','orbito-onboarding-runtime-v1','owner_account','missing','client_binding','orbito-client-'||c,'checks','{"migrations":true,"database_privileges":true,"rpc_privileges":true,"sequence_privileges":true,"private_config":true,"storage":true,"owner_reservation":true,"bridge_mode":true,"config_projection":true,"database_reachable":true,"bridge_configuration":true,"edge_functions":true,"runtime_configuration":true,"authentication":true}'::jsonb));
 perform public.platform_provision_step('41000000-0000-4000-8000-000000000003','complete','{}');
 select health into old_health from platform_private.shop_credentials where client_id=c;
 perform public.platform_provision_begin(c,'41000000-0000-4000-8000-000000000004','invite-owner','{}');
 perform public.platform_onboarding_step('41000000-0000-4000-8000-000000000004','prepare');
 perform public.platform_provision_step('41000000-0000-4000-8000-000000000004','complete','{}');
 perform pg_temp.assert((select health=old_health and secret_id is not null from platform_private.shop_credentials where client_id=c),'optional outcome preserves manual infrastructure and no privileged dependency');
end $$;
rollback;
