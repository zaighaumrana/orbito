begin;
-- Extend the stage allowlist without changing existing stage/retry behavior.
alter function public.platform_managed_stage(uuid,text,text,text) rename to platform_managed_stage_v1;
create function public.platform_managed_stage(p_request uuid,p_name text,p_state text,p_checksum text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; previous platform_private.provision_stages%rowtype;
begin
 if p_name is distinct from 'support-auth-config' then return public.platform_managed_stage_v1(p_request,p_name,p_state,p_checksum); end if;
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned') for update;
 if not found then raise exception 'Infrastructure retired'; end if;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action<>'managed-setup' or p_checksum is not null or p_state is null or p_state not in ('running','passed','failed','manual') then raise exception 'Invalid support configuration stage'; end if;
 select * into previous from platform_private.provision_stages where request_id=p_request and name=p_name;
 if found and previous.state='passed' then return jsonb_build_object('skip',true); end if;
 insert into platform_private.provision_stages(request_id,name,state,checksum) values(p_request,p_name,p_state,null)
 on conflict(request_id,name) do update set state=excluded.state,updated_at=now();
 update platform_private.provision_jobs set step=p_name,updated_at=now() where request_id=p_request;
 if p_state='passed' then update platform_private.shop_credentials set health=health||jsonb_build_object('support_auth_configured',true,'support_auth_verified_at',now()) where client_id=j.client_id; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_stage',jsonb_build_object('request_id',p_request,'stage',p_name,'state',p_state));
 return jsonb_build_object('skip',false);
end $$;
revoke all on function public.platform_managed_stage(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.platform_managed_stage(uuid,text,text,text) to service_role;

-- Optional support presence does not participate in customer onboarding readiness.
alter function public.platform_onboarding_step(uuid,text,jsonb) rename to platform_onboarding_step_v1;
create function public.platform_onboarding_step(p_request uuid,p_step text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.platform_onboarding_step_v1(p_request,p_step,p_data);
 if p_step='health' and p_data->>'contract'='orbito-onboarding-runtime-v1'
  and jsonb_typeof(p_data->'runtime_details'->'support_auth_configured')='boolean' then
  update platform_private.shop_credentials s set health=s.health||jsonb_build_object('support_auth_configured',p_data->'runtime_details'->'support_auth_configured','support_auth_verified_at',now())
  where s.client_id=(select client_id from platform_private.provision_jobs where request_id=p_request);
 end if;
 return result;
end $$;
revoke all on function public.platform_onboarding_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_onboarding_step(uuid,text,jsonb) to service_role;

-- Repair intent is independent of provisioning jobs and their completed history.
create function public.platform_support_access_target(p_client integer,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; s platform_private.shop_credentials%rowtype; a public.operator_audit%rowtype; owner_request text;
begin
 perform platform_private.require_role(array['master_admin']);
 if p_request is null then raise exception 'Repair request identity required'; end if;
 select * into strict c from public.clients where id=p_client for update;
 select * into s from platform_private.shop_credentials where client_id=p_client;
 if c.pairing_mode<>'managed' or c.onboarding_version<>2 or c.lifecycle_state='Archived' or c.infrastructure_state in ('destroyed','decommissioned')
  or s.client_id is null or c.supabase_url is distinct from 'https://'||s.project_ref||'.supabase.co' or s.bridge_call_secret_id is null then raise exception 'Existing managed Shop with immutable pairing required'; end if;
 if exists(select 1 from platform_private.provision_jobs where client_id=p_client and state<>'complete') then raise exception 'Finish or reconcile pending provisioning before support repair'; end if;
 select plan->'bootstrap'->>'request_id' into owner_request from platform_private.provision_jobs
 where client_id=p_client and state='complete' and action in ('managed-setup','bootstrap-shop') and plan ? 'bootstrap' order by created_at limit 1;
 if owner_request is null then raise exception 'Completed Shop owner reservation required'; end if;
 select * into a from public.operator_audit where action='provision_support_access_repair' and detail->>'request_id'=p_request::text order by id limit 1;
 if found then
  if a.client_id<>p_client or a.actor_id is distinct from auth.uid() or a.detail->>'project_ref' is distinct from s.project_ref or a.detail->>'client_binding' is distinct from s.client_binding then raise exception 'Repair request identity conflict'; end if;
 else
  insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'provision_support_access_repair',jsonb_build_object('request_id',p_request,'project_ref',s.project_ref,'client_binding',s.client_binding,'state','started'));
 end if;
 return jsonb_build_object('project_ref',s.project_ref,'client_binding',s.client_binding,'owner_request',owner_request);
end $$;
revoke all on function public.platform_support_access_target(integer,uuid) from public,anon;
grant execute on function public.platform_support_access_target(integer,uuid) to authenticated;

create function public.platform_support_access_finish(p_client integer,p_request uuid,p_configured boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.operator_audit%rowtype; c public.clients%rowtype; s platform_private.shop_credentials%rowtype;
begin
 if p_configured is null then raise exception 'Boolean support verification required'; end if;
 select * into strict c from public.clients where id=p_client for update;
 select * into strict a from public.operator_audit where client_id=p_client and action='provision_support_access_repair' and detail->>'request_id'=p_request::text order by id limit 1;
 select * into strict s from platform_private.shop_credentials where client_id=p_client for update;
 if c.pairing_mode<>'managed' or c.lifecycle_state='Archived' or c.infrastructure_state in ('destroyed','decommissioned')
  or c.supabase_url is distinct from 'https://'||s.project_ref||'.supabase.co' or a.detail->>'project_ref' is distinct from s.project_ref or a.detail->>'client_binding' is distinct from s.client_binding then raise exception 'Managed repair target changed'; end if;
 update platform_private.shop_credentials set health=health||jsonb_build_object('support_auth_configured',p_configured,'support_auth_verified_at',case when p_configured then now() else null end) where client_id=p_client;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,a.actor_id,'provision_support_access_result',jsonb_build_object('request_id',p_request,'configured',p_configured));
end $$;
revoke all on function public.platform_support_access_finish(integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.platform_support_access_finish(integer,uuid,boolean) to service_role;
commit;
