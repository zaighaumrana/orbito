begin;
alter table platform_private.provision_jobs drop constraint provision_jobs_action_check;
alter table platform_private.provision_jobs add constraint provision_jobs_action_check check(action in
 ('provision','verify','activate','rotate','replace','provision-call','rotate-call','pair-shop','bootstrap-shop','onboarding-status','invite-owner'));

-- Retired privileged-key paths are callable only by their owning wrapper.
-- No hosted secret inventory, deletion, rotation or value retrieval occurs here.
revoke all on function platform_private.provision_step_legacy(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.platform_shop_credential(integer) from public,anon,authenticated,service_role;

create or replace function platform_private.provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 if not found or p_request is null then raise exception 'Client and request identity required'; end if;
 if p_action not in ('provision','verify','activate','rotate','replace','provision-call','rotate-call','pair-shop','bootstrap-shop','onboarding-status','invite-owner') or p_params is null
  or jsonb_typeof(p_params)<>'object' or p_params-array['project_ref','client_binding','confirmed','note']<>'{}' then raise exception 'Invalid provisioning intent'; end if;
 if p_action='activate' and (p_params->>'confirmed' is distinct from 'true' or length(coalesce(p_params->>'note','')) not between 5 and 500) then raise exception 'Confirm paused Shop writes and reconciliation with a cutover note'; end if;
 select * into j from platform_private.provision_jobs where request_id=p_request for update;
 if found then
  if j.client_id<>p_client or j.action<>p_action or j.params<>p_params or j.actor_id<>auth.uid() then raise exception 'Request identity conflict'; end if;
  if j.state='running' then raise exception 'Operation is running; refresh status. Interrupted execution requires administrator reconciliation'; end if;
  if j.state='complete' then return jsonb_build_object('complete',true); end if;
  update platform_private.provision_jobs set state='running',error=null,updated_at=now() where request_id=p_request;
 else
  if exists(select 1 from platform_private.provision_jobs where client_id=p_client and state<>'complete') then raise exception 'Resume pending operation first'; end if;
  if exists(select 1 from public.config_jobs where client_id=p_client and state in ('sending','uncertain')) then raise exception 'Reconcile pending module configuration first'; end if;
  insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params) values(p_request,p_client,auth.uid(),p_action,p_params);
 end if;
 return jsonb_build_object('complete',false);
end $$;

create or replace function public.platform_onboarding_step(p_request uuid,p_step text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c public.clients%rowtype;
 s platform_private.shop_credentials%rowtype; ref text; v uuid; src uuid; payload jsonb;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('pair-shop','bootstrap-shop','onboarding-status','invite-owner') then raise exception 'Invalid onboarding job'; end if;
 select * into s from platform_private.shop_credentials where client_id=j.client_id for update;
 if p_step='prepare' then
  if c.onboarding_version<>2 then raise exception 'Existing clients use existing verification/cutover workflow'; end if;
  if j.action='invite-owner' and coalesce(s.health->>'infrastructure','')<>'ready' then raise exception 'Provision infrastructure before requesting an optional invitation'; end if;
  ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');
  if ref is null then raise exception 'Shop project required'; end if;
  if s.client_id is null then
   if j.action<>'pair-shop' then raise exception 'Pair Shop first'; end if;
   insert into platform_private.shop_credentials(client_id,project_ref,client_binding)
    values(c.id,ref,'orbito-client-'||c.id) returning * into s;
  end if;
  if s.project_ref<>ref then raise exception 'Shop destination cannot be reassigned'; end if;
  if s.bridge_call_secret_id is null then
   v:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'));
   update platform_private.shop_credentials set bridge_call_secret_id=v where client_id=c.id;
  end if;
  if s.bridge_secret_id is null then
   v:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'));
   update platform_private.shop_credentials set bridge_secret_id=v where client_id=c.id;
  end if;
  select * into s from platform_private.shop_credentials where client_id=c.id;
  payload:=j.plan->'bootstrap';
  if payload is null then
   -- The first bootstrap payload is immutable across retries and later status calls.
   select plan->'bootstrap' into payload from platform_private.provision_jobs
    where client_id=c.id and action='bootstrap-shop' and plan ? 'bootstrap' order by created_at limit 1;
   if payload is null then payload:=jsonb_build_object('request_id',p_request,'platform_client_id',c.id,'client_binding',s.client_binding,
    'business_name',c.name,'owner_name',c.owner_name,'owner_email',c.owner_email,'billing_currency',c.currency,
    'shop_url',c.shop_url,'modules',c.desired_entitlements,'paper_resupply_enabled',c.paper_resupply_enabled,'onboarding_version',2); end if;
   update platform_private.provision_jobs set plan=plan||jsonb_build_object('bootstrap',payload) where request_id=p_request;
  end if;
  return jsonb_build_object('project_ref',ref,'pairing_mode',c.pairing_mode,'payload',payload,
   'call_secret',(select decrypted_secret from vault.decrypted_secrets where id=s.bridge_call_secret_id),
   'source_secret',(select decrypted_secret from vault.decrypted_secrets where id=s.bridge_secret_id));
 elsif p_step='paired' then
  update platform_private.shop_credentials set health=health||jsonb_build_object('connection',p_data->>'connection','owner_invite',coalesce(health->>'owner_invite','owner_invite_not_started'),'owner_setup',coalesce(health->>'owner_setup','owner_setup_pending'),'infrastructure',coalesce(health->>'infrastructure','pending'),'onboarding',coalesce(health->>'onboarding','onboarding_pending')) where client_id=c.id;
 elsif p_step='registered' then
  src:=(p_data->>'source_id')::uuid;
  if src is null or p_data->>'client_binding' is distinct from s.client_binding then raise exception 'Shop source binding mismatch'; end if;
  if exists(select 1 from public.bridge_sources where client_id=c.id and (source_id<>src or client_binding<>s.client_binding)) then raise exception 'Source conflict'; end if;
  insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note)
   values(src,c.id,s.client_binding,true,1,'New Shop onboarding V2; no legacy usage') on conflict(client_id) do nothing;
  insert into platform_private.source_credentials(source_id,secret_sha256)
   select src,encode(extensions.digest(decrypted_secret,'sha256'),'hex') from vault.decrypted_secrets where id=s.bridge_secret_id
   on conflict(source_id) do nothing;
  perform platform_private.publish_billing(c.id);
 elsif p_step='health' then
  if coalesce(p_data->>'owner_setup','') not in ('owner_setup_pending','owner_active')
   or coalesce(p_data->>'infrastructure','') not in ('pending','ready')
   or coalesce(p_data->>'owner_invite','') not in ('owner_invite_not_started','owner_invite_sent','owner_invite_accepted','owner_invite_failed')
   or coalesce(p_data->>'onboarding','') not in ('onboarding_pending','onboarding_complete')
   or jsonb_typeof(p_data->'config') is distinct from 'object'
   or not ((p_data->'config') ?& array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended'])
   or (p_data->'config')-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended']<>'{}'
   then raise exception 'Invalid diagnostic'; end if;
  if exists(select 1 from jsonb_each(p_data->'config') where jsonb_typeof(value)<>'boolean') then raise exception 'Boolean diagnostics required'; end if;
  update platform_private.shop_credentials set verified_at=now(),health=health-'error'||jsonb_build_object(
   'connection','Connected','config_access','Reachable','bridge_call_configured',true,
   'owner_setup',p_data->>'owner_setup','infrastructure',p_data->>'infrastructure','owner_invite',p_data->>'owner_invite','onboarding',p_data->>'onboarding','shop_config',p_data->'config',
   'billing_projection',case when exists(select 1 from public.billing_projections where client_id=c.id) then 'Ready' else 'Pending' end)
   where client_id=c.id;
 else raise exception 'Unsupported onboarding step'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.platform_onboarding_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_onboarding_step(uuid,text,jsonb) to service_role;


create or replace function platform_private.provision_step(p_request uuid,p_step text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare action text;
begin
 if p_step='credential' then raise exception 'Shop privileged credentials are not accepted; use pairing'; end if;
 select j.action into strict action from platform_private.provision_jobs j where j.request_id=p_request;
 if action in ('pair-shop','bootstrap-shop','onboarding-status','invite-owner') and p_step not in ('complete','failure') then
  raise exception 'V2 actions use the isolated onboarding state machine';
 end if;
 return platform_private.provision_step_legacy(p_request,p_step,p_data);
end $$;
revoke all on function platform_private.provision_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function platform_private.provision_step(uuid,text,jsonb) to service_role;
commit;
