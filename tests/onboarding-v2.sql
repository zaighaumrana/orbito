-- Disposable LOCAL database only, after all migrations. Every fixture rolls back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
do $$
declare selected_plan text; inventory boolean; paper boolean; breaks boolean; m jsonb; c integer;
begin
 foreach selected_plan in array array['Basic','Pro','Pro Plus'] loop
  foreach inventory in array array[false,true] loop
   foreach paper in array array[false,true] loop
   foreach breaks in array array[false,true] loop
    m:=public.platform_plan_entitlements(selected_plan,inventory,breaks);
    perform pg_temp.assert((m->>'repair_module_enabled')::boolean,'repair included');
    perform pg_temp.assert((m->>'inventory_module_enabled')::boolean=inventory,'independent Inventory addon');
    perform pg_temp.assert((m->>'technician_module_enabled')::boolean=(selected_plan<>'Basic'),'canonical technician mapping');
    perform pg_temp.assert((m->>'live_tracking_enabled')::boolean=(selected_plan<>'Basic'),'tracking mapping');
    perform pg_temp.assert((m->>'ems_enabled')::boolean=(selected_plan='Pro Plus'),'EMS mapping');
    perform pg_temp.assert((m->>'ems_track_breaks')::boolean=(selected_plan='Pro Plus' and breaks),'break tracking remains distinct');
    perform pg_temp.assert(not(m ? 'printing_enabled'),'printing is ungated');
    insert into public.clients(name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email,plan,inventory_billable,paper_resupply_enabled,ems_track_breaks)
     values('Module fixture','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,'Test Owner','owner@example.test',selected_plan,inventory,paper,breaks) returning id into c;
    perform pg_temp.assert((select desired_entitlements=m and paper_resupply_enabled=paper and inventory_module_enabled=inventory
     and technician_module_enabled=(selected_plan<>'Basic') and live_tracking_enabled=(selected_plan<>'Basic')
     and ems_enabled=(selected_plan='Pro Plus') and ems_track_breaks=(selected_plan='Pro Plus' and breaks) from public.clients where id=c),'all 12 selected_plan/Inventory/Paper combinations and independent break variants');
   end loop;
   end loop;
  end loop;
 end loop;
end $$;
insert into auth.users(id,email) values('30000000-0000-4000-8000-000000000001','platformadmin@retailos.internal');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
do $$
declare c integer; r jsonb; first_payload jsonb; blocked boolean; call_key text; source_key text;
begin
 blocked:=false;
 begin insert into public.clients(name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email)
 values('Bad','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,'','bad'); exception when others then blocked:=true; end;
 perform pg_temp.assert(blocked,'owner validation is authoritative');
 insert into public.clients(name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email,plan,inventory_billable,paper_resupply_enabled,pairing_mode)
 values('Test Shop','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,' Test Owner ','OWNER@EXAMPLE.TEST','Pro',true,true,'byo') returning id into c;
 perform pg_temp.assert((select owner_email='owner@example.test' and owner_name='Test Owner' and technician_module_enabled and inventory_module_enabled and paper_resupply_enabled and not ems_track_breaks from public.clients where id=c),'client normalized and entitlements derived');
 perform public.platform_provision_begin(c,'40000000-0000-4000-8000-000000000001','pair-shop','{}');
 r:=public.platform_onboarding_step('40000000-0000-4000-8000-000000000001','prepare');
 call_key:=r->>'call_secret'; source_key:=r->>'source_secret';
 perform pg_temp.assert(length(call_key)=64 and length(source_key)=64 and call_key<>source_key,'independent per-Shop random secrets');
 perform pg_temp.assert((select secret_id is null from platform_private.shop_credentials where client_id=c),'no Shop service credential stored');
 perform pg_temp.assert(not(public.platform_provision_status(c)::text like '%'||call_key||'%'),'safe status omits secrets');
 perform public.platform_onboarding_step('40000000-0000-4000-8000-000000000001','paired','{"connection":"Manual pairing required"}');
 perform public.platform_provision_step('40000000-0000-4000-8000-000000000001','complete','{}');
 perform public.platform_provision_begin(c,'40000000-0000-4000-8000-000000000002','bootstrap-shop','{}');
 r:=public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','prepare'); first_payload:=r->'payload';
 perform pg_temp.assert(first_payload->>'owner_email'='owner@example.test' and first_payload->>'billing_currency'='PKR' and (first_payload->>'paper_resupply_enabled')::boolean,'bootstrap payload');
 perform pg_temp.assert(not(first_payload ?| array['password','service_role_key','secret_api_key','database_password']),'no privileged key or password payload');
 perform public.platform_provision_step('40000000-0000-4000-8000-000000000002','failure','{"error":"Synthetic retry","stage":"onboarding"}');
 perform public.platform_provision_begin(c,'40000000-0000-4000-8000-000000000002','bootstrap-shop','{}');
 r:=public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','prepare');
 perform pg_temp.assert(r->'payload'=first_payload and r->>'call_secret'=call_key and r->>'source_secret'=source_key,'retry retains payload and credentials');
 blocked:=false;
 begin perform public.platform_provision_begin(c,'40000000-0000-4000-8000-000000000003','bootstrap-shop','{}'); exception when others then blocked:=true; end;
 perform pg_temp.assert(blocked,'parallel jobs blocked');
 blocked:=false;
 begin perform public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','registered',jsonb_build_object('source_id','50000000-0000-4000-8000-000000000001')); exception when others then blocked:=true; end;
 perform pg_temp.assert(blocked,'missing source binding rejected');
 perform public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','registered',jsonb_build_object('source_id','50000000-0000-4000-8000-000000000001','client_binding','orbito-client-'||c));
 perform public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','registered',jsonb_build_object('source_id','50000000-0000-4000-8000-000000000001','client_binding','orbito-client-'||c));
 perform pg_temp.assert((select count(*)=1 from public.bridge_sources where client_id=c),'source registration idempotent');
 perform pg_temp.assert(exists(select 1 from public.billing_projections where client_id=c),'initial billing projection created');
 blocked:=false;
 begin perform public.platform_onboarding_step('40000000-0000-4000-8000-000000000002','health','{"owner_invite":"owner_invite_sent","onboarding":"onboarding_pending","config":{"repair_module_enabled":"do-not-store-remote-secrets"}}'); exception when others then blocked:=true; end;
 perform pg_temp.assert(blocked,'remote diagnostic payload cannot inject text into boolean config');
 perform public.platform_provision_step('40000000-0000-4000-8000-000000000002','failure','{"error":"Synthetic retry","stage":"onboarding"}');
 update platform_private.provision_jobs set updated_at=now()-interval '6 minutes' where request_id='40000000-0000-4000-8000-000000000002';
 r:=public.platform_onboarding_retry_targets();
 perform pg_temp.assert(jsonb_array_length(r)=1,'existing scheduler can recover retry');
 perform pg_temp.assert(jsonb_array_length(public.platform_onboarding_retry_targets())=0,'retry lease prevents duplicate dispatch');
 perform public.platform_provision_step('40000000-0000-4000-8000-000000000002','complete','{}');
 r:=public.platform_provision_begin(c,'40000000-0000-4000-8000-000000000002','bootstrap-shop','{}');
 perform pg_temp.assert((r->>'complete')::boolean,'completed request idempotent');
end $$;
select pg_temp.assert(not has_function_privilege('authenticated','public.platform_onboarding_step(uuid,text,jsonb)','EXECUTE'),'secret resolver service-only');
select pg_temp.assert(not has_function_privilege('authenticated','public.platform_onboarding_retry_targets()','EXECUTE'),'retry claim service-only');
rollback;
