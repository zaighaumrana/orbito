begin;
alter table public.clients add column owner_name text, add column owner_email text,
 add column onboarding_version integer not null default 0,
 add column pairing_mode text not null default 'managed' check(pairing_mode in ('managed','byo')),
 add column ems_track_breaks boolean not null default false,
 add column desired_entitlements jsonb;
alter table platform_private.shop_credentials alter column secret_id drop not null;

-- One canonical commercial mapping. Existing clients are unchanged until an
-- explicit plan/addon change; break tracking remains independently selected.
create function public.platform_plan_entitlements(p_plan text,p_inventory boolean,p_breaks boolean default false) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if p_plan not in ('Basic','Pro','Pro Plus') or p_plan is null then raise exception 'Unknown plan'; end if;
 return jsonb_build_object('repair_module_enabled',true,'inventory_module_enabled',coalesce(p_inventory,false),
  'technician_module_enabled',p_plan in ('Pro','Pro Plus'),'live_tracking_enabled',p_plan in ('Pro','Pro Plus'),
  'ems_enabled',p_plan='Pro Plus','ems_track_breaks',p_plan='Pro Plus' and coalesce(p_breaks,false));
end $$;
revoke all on function public.platform_plan_entitlements(text,boolean,boolean) from public,anon;
grant execute on function public.platform_plan_entitlements(text,boolean,boolean) to authenticated,service_role;
create function platform_private.client_onboarding_defaults() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.onboarding_version=2 then
  new.owner_name:=trim(new.owner_name); new.owner_email:=lower(trim(new.owner_email));
  if length(coalesce(new.owner_name,'')) not between 1 and 160 or length(coalesce(new.owner_email,''))>254
   or coalesce(new.owner_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or coalesce(new.shop_url,'') !~ '^https://[^[:space:]]+$' or coalesce(new.currency,'') !~ '^[A-Z]{3}$'
   or new.supabase_url !~ '^https://[a-z]{20}\.supabase\.co$' then raise exception 'Valid owner, HTTPS Shop URL, project and ISO currency required'; end if;
  if tg_op='INSERT' or new.plan is distinct from old.plan or new.inventory_billable is distinct from old.inventory_billable then
   new.desired_entitlements:=public.platform_plan_entitlements(new.plan,new.inventory_billable,new.ems_track_breaks);
   new.repair_module_enabled:=(new.desired_entitlements->>'repair_module_enabled')::boolean;
   new.inventory_module_enabled:=(new.desired_entitlements->>'inventory_module_enabled')::boolean;
   new.technician_module_enabled:=(new.desired_entitlements->>'technician_module_enabled')::boolean;
   new.live_tracking_enabled:=(new.desired_entitlements->>'live_tracking_enabled')::boolean;
   new.ems_enabled:=(new.desired_entitlements->>'ems_enabled')::boolean;
   new.ems_track_breaks:=(new.desired_entitlements->>'ems_track_breaks')::boolean;
  end if;
  new.ems_track_breaks:=new.ems_enabled and new.ems_track_breaks;
  new.desired_entitlements:=new.desired_entitlements||jsonb_build_object('ems_track_breaks',new.ems_track_breaks);
 end if;
 return new;
end $$;
create trigger client_onboarding_defaults before insert or update on public.clients for each row execute function platform_private.client_onboarding_defaults();

alter table platform_private.provision_jobs drop constraint provision_jobs_action_check;
alter table platform_private.provision_jobs add constraint provision_jobs_action_check check(action in
 ('provision','verify','activate','rotate','replace','provision-call','rotate-call','pair-shop','bootstrap-shop','onboarding-status'));

-- Extend the existing lock/request identity protocol; no parallel job system.
create or replace function platform_private.provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 if not found or p_request is null then raise exception 'Client and request identity required'; end if;
 if p_action not in ('provision','verify','activate','rotate','replace','provision-call','rotate-call','pair-shop','bootstrap-shop','onboarding-status') or p_params is null
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

-- Service-only pairing payload. Secrets never enter browser RPCs, status, jobs,
-- logs or client records. BYO downloads are an explicit sensitive setup response.
create function public.platform_onboarding_step(p_request uuid,p_step text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c public.clients%rowtype;
 s platform_private.shop_credentials%rowtype; ref text; v uuid; src uuid; payload jsonb;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('pair-shop','bootstrap-shop','onboarding-status') then raise exception 'Invalid onboarding job'; end if;
 select * into s from platform_private.shop_credentials where client_id=j.client_id for update;
 if p_step='prepare' then
  if c.onboarding_version<>2 then raise exception 'Existing clients use existing verification/cutover workflow'; end if;
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
  update platform_private.shop_credentials set health=health||jsonb_build_object('connection',p_data->>'connection','owner_invite','owner_invite_not_started','onboarding','onboarding_pending') where client_id=c.id;
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
  if coalesce(p_data->>'owner_invite','') not in ('owner_invite_not_started','owner_invite_sent','owner_invite_accepted','owner_invite_failed')
   or coalesce(p_data->>'onboarding','') not in ('onboarding_pending','onboarding_complete')
   or jsonb_typeof(p_data->'config') is distinct from 'object'
   or not ((p_data->'config') ?& array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended'])
   or (p_data->'config')-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended']<>'{}'
   then raise exception 'Invalid diagnostic'; end if;
  if exists(select 1 from jsonb_each(p_data->'config') where jsonb_typeof(value)<>'boolean') then raise exception 'Boolean diagnostics required'; end if;
  update platform_private.shop_credentials set verified_at=now(),health=health-'error'||jsonb_build_object(
   'connection','Connected','config_access','Reachable','bridge_call_configured',true,
   'owner_invite',p_data->>'owner_invite','onboarding',p_data->>'onboarding','shop_config',p_data->'config',
   'billing_projection',case when exists(select 1 from public.billing_projections where client_id=c.id) then 'Ready' else 'Pending' end)
   where client_id=c.id;
 else raise exception 'Unsupported onboarding step'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.platform_onboarding_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_onboarding_step(uuid,text,jsonb) to service_role;

-- Existing scheduler cadence is unchanged; it may resume idempotent bootstrap jobs.
create function public.platform_onboarding_retry_targets() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as (
  select request_id from platform_private.provision_jobs
  where action='bootstrap-shop' and state<>'complete' and updated_at<now()-interval '5 minutes'
  order by updated_at limit 2 for update skip locked
 ), claimed as (
  update platform_private.provision_jobs j set state='running',updated_at=now(),error=null
  from candidates c where j.request_id=c.request_id returning j.request_id,j.client_id,j.action,j.params
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end $$;
revoke all on function public.platform_onboarding_retry_targets() from public,anon,authenticated;
grant execute on function public.platform_onboarding_retry_targets() to service_role;

-- Stop returning legacy Shop privileged keys even to new server code. Historical
-- Vault entries are retained for reviewed cleanup, not used by the V2 runtime.
create or replace function platform_private.shop_credential(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project_ref',project_ref,'client_binding',client_binding)
 from platform_private.shop_credentials where client_id=p_client
$$;

create or replace function platform_private.begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype; k text;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if p_request is null or p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb
  or (p_changes-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended'])<>'{}'::jsonb then raise exception 'Unsupported config write'; end if;
 for k in select jsonb_object_keys(p_changes) loop if jsonb_typeof(p_changes->k)<>'boolean' then raise exception 'Boolean required'; end if; end loop;
 perform 1 from public.clients where id=p_client for update;
 if not found then raise exception 'Unknown client'; end if;
 select * into j from public.config_jobs where request_id=p_request;
 if found then
  if j.client_id<>p_client or j.changes<>p_changes or j.actor_id<>auth.uid() then raise exception 'Config identity conflict'; end if;
  return to_jsonb(j)||jsonb_build_object('dispatch',false);
 end if;
 insert into public.config_jobs(request_id,client_id,actor_id,changes) values(p_request,p_client,auth.uid(),p_changes) returning * into j;
 return to_jsonb(j)||jsonb_build_object('dispatch',true);
end $$;

create or replace function platform_private.finish_config(p_request uuid,p_state text,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype;
begin
 select * into strict j from public.config_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from public.config_jobs where request_id=p_request for update;
 if j.state='applied' then return; end if;
 if p_state not in ('applied','failed','uncertain') or p_state is null then raise exception 'Invalid outcome'; end if;
 if p_state='applied' then
  if p_result is null or not (p_result @> j.changes) then raise exception 'Config verification mismatch'; end if;
  update public.clients set repair_module_enabled=(p_result->>'repair_module_enabled')::boolean,
  inventory_module_enabled=(p_result->>'inventory_module_enabled')::boolean,technician_module_enabled=(p_result->>'technician_module_enabled')::boolean,
  live_tracking_enabled=(p_result->>'live_tracking_enabled')::boolean,ems_enabled=(p_result->>'ems_enabled')::boolean,
  ems_track_breaks=coalesce((p_result->>'ems_track_breaks')::boolean,ems_track_breaks),
  status=case when (p_result->>'suspended')::boolean then 'Suspended' else 'Active' end,config_synced_at=clock_timestamp() where id=j.client_id;
 end if;
 update public.config_jobs set state=p_state,result=p_result,finished_at=clock_timestamp() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'config_'||p_state,jsonb_build_object('request_id',p_request,'changes',j.changes));
end $$;

-- Retire the public server-side credential write while retaining legacy cutover.
alter function platform_private.provision_step(uuid,text,jsonb) rename to provision_step_legacy;
create function platform_private.provision_step(p_request uuid,p_step text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_step='credential' then raise exception 'Shop privileged credentials are not accepted; use pairing'; end if;
 return platform_private.provision_step_legacy(p_request,p_step,p_data);
end $$;
revoke all on function platform_private.provision_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function platform_private.provision_step(uuid,text,jsonb) to service_role;

commit;
