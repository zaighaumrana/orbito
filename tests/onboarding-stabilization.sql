-- LOCAL disposable replay only. Real authenticated roles exercise table ACL + RLS.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end $$;
select pg_temp.assert(has_table_privilege('authenticated','public.clients','SELECT,INSERT,UPDATE') and not has_table_privilege('authenticated','public.clients','DELETE'),'client browser write grants, no DELETE');
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','platformadmin@retailos.internal'),
 ('91000000-0000-4000-8000-000000000002','manager@example.test'),
 ('91000000-0000-4000-8000-000000000003','billing@example.test'),
 ('91000000-0000-4000-8000-000000000004','unknown@example.test');
insert into public.platform_users(auth_user_id,name,email,role,status) values
 ('91000000-0000-4000-8000-000000000002','Manager','manager@example.test','portfolio_manager','Active'),
 ('91000000-0000-4000-8000-000000000003','Billing','billing@example.test','billing_person','Active');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into public.clients(id,name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email,pairing_mode,plan)
 values(9500,'Role Shop','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,'Owner','owner@example.test','byo','Basic');
select pg_temp.assert(public.platform_operator_identity()->>'role'='portfolio_manager','server role bound to Auth UUID');
update public.clients set name='Saved Shop',plan='Pro',shop_url='https://shop.example.test' where id=9500;
select pg_temp.assert((select technician_module_enabled from public.clients where id=9500),'allowed plan update derives entitlements');
do $$ declare blocked boolean:=false;begin
 begin update public.clients set event_rate=999 where id=9500;exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'table UPDATE grant cannot bypass audited pricing');
 blocked:=false;begin update public.clients set owner_email='replacement@example.test' where id=9500;exception when others then blocked:=true;end;
 perform pg_temp.assert(blocked,'direct owner replacement denied');
end $$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert(public.platform_operator_identity()->>'role'='master_admin','canonical master email works without browser alias');
insert into public.clients(id,name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email)
 values(9501,'Master Shop','https://abcdefghijklmnopqrsv.supabase.co','','https://master.example.test','PKR',2,'Owner','master@example.test');
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ declare n integer;blocked boolean:=false;begin
 update public.clients set name='Forbidden' where id=9500;get diagnostics n=row_count;
 perform pg_temp.assert(n=0,'billing role UPDATE rejected by RLS');
 begin insert into public.clients(name,supabase_url,supabase_anon) values('Forbidden','https://invalid.test','');exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'billing role INSERT rejected by RLS');
end $$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.clients),'unknown authenticated user cannot read clients');
do $$ declare blocked boolean:=false;begin
 begin perform public.platform_operator_identity();exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'unknown user has no operator identity');
 blocked:=false;begin insert into public.clients(name,supabase_url,supabase_anon) values('Forbidden','https://invalid.test','');exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'unknown user cannot create client');
end $$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.platform_provision_begin(9500,'93000000-0000-4000-8000-000000000001','pair-shop','{}');
do $$ begin perform public.platform_onboarding_step('93000000-0000-4000-8000-000000000001','prepare');end $$;
select public.platform_onboarding_step('93000000-0000-4000-8000-000000000001','health','{"infrastructure":"ready","owner_setup":"owner_setup_pending","owner_invite":"owner_invite_not_started","onboarding":"onboarding_pending","config":{"repair_module_enabled":true,"inventory_module_enabled":false,"technician_module_enabled":true,"live_tracking_enabled":true,"ems_enabled":false,"ems_track_breaks":false,"suspended":false}}');
select pg_temp.assert((select health->>'infrastructure'='pending' from platform_private.shop_credentials where client_id=9500),'old optimistic ready response cannot become ready without runtime attestations');
do $$ declare blocked boolean:=false;r jsonb:='{"infrastructure":"ready","owner_setup":"owner_setup_pending","owner_invite":"owner_invite_not_started","onboarding":"onboarding_pending","config":{"repair_module_enabled":true,"inventory_module_enabled":false,"technician_module_enabled":true,"live_tracking_enabled":true,"ems_enabled":false,"ems_track_breaks":false,"suspended":false},"contract":"orbito-onboarding-runtime-v1","owner_account":"missing","client_binding":"wrong-client","checks":{"migrations":true,"database_privileges":true,"rpc_privileges":true,"sequence_privileges":true,"private_config":true,"storage":true,"owner_reservation":true,"bridge_mode":true,"config_projection":true,"database_reachable":true,"bridge_configuration":true,"edge_functions":true,"runtime_configuration":true,"authentication":true}}';begin
 begin perform public.platform_onboarding_step('93000000-0000-4000-8000-000000000001','health',r);exception when others then blocked:=true;end;
 perform pg_temp.assert(blocked,'cross-client runtime diagnostic fails closed');
end $$;
rollback;
