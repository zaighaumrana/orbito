-- Forward-only lifecycle/recovery extension. No ledger/history deletion.
begin;
alter table public.clients add column lifecycle_state text not null default 'Active'
 check(lifecycle_state in ('Provisioning','Active','Suspended','Archived')),
 add column infrastructure_state text not null default 'unknown'
 check(infrastructure_state in ('unknown','present','unreachable','destroyed','decommissioned')),
 add column archived_at timestamptz,
 add column turnstile_site_key text,
 add column turnstile_configured_at timestamptz;
update public.clients set lifecycle_state=case when status='Suspended' then 'Suspended' else 'Active' end;
alter table public.config_jobs add column updated_at timestamptz not null default now(),
 add column recovery_id uuid, add column recovery_until timestamptz;

create function platform_private.lifecycle_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if current_user='authenticated' then new.infrastructure_state:='unknown';new.archived_at:=null;new.turnstile_configured_at:=null;new.turnstile_site_key:=null;end if;
  new.lifecycle_state:=case when new.onboarding_version=2 then 'Provisioning' when new.status='Suspended' then 'Suspended' else 'Active' end;
 else
  if new.pairing_mode is distinct from old.pairing_mode then raise exception 'Managed/BYO mode is immutable; rebind requires a separately reviewed migration'; end if;
  if old.lifecycle_state='Archived' and (new.lifecycle_state<>'Archived' or new.status is distinct from old.status) then raise exception 'Archived clients cannot be reactivated'; end if;
  if new.lifecycle_state<>'Archived' and new.status is distinct from old.status then
   new.lifecycle_state:=case when new.status='Suspended' then 'Suspended' else 'Active' end;
  end if;
 end if;
 return new;
end $$;
create trigger ab_client_lifecycle before insert or update on public.clients for each row execute function platform_private.lifecycle_guard();
revoke all on function platform_private.lifecycle_guard() from public,anon,authenticated;
create function platform_private.audit_client_binding_decision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.onboarding_version=2 then insert into public.operator_audit(client_id,actor_id,action,detail) values(new.id,auth.uid(),'binding_mode_selected',jsonb_build_object('mode',new.pairing_mode,'project_ref',substring(new.supabase_url from '^https://([a-z]{20})\.supabase\.co$'),'mode_immutable',true));end if;
 return new;
end $$;
create trigger client_binding_decision after insert on public.clients for each row execute function platform_private.audit_client_binding_decision();
revoke all on function platform_private.audit_client_binding_decision() from public,anon,authenticated;

create function public.platform_client_lifecycle(p_client integer,p_action text,p_reason text,p_project_ref text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; j record;
begin
 perform platform_private.require_role(array['master_admin']);
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'An audited reason of 10–500 characters is required'; end if;
 select * into strict c from public.clients where id=p_client for update;
 if p_action not in ('archive','mark-destroyed','mark-decommissioned') or p_action is null then raise exception 'Unsupported lifecycle action'; end if;
 if p_action<>'archive' and (p_project_ref is null or c.supabase_url is distinct from 'https://'||p_project_ref||'.supabase.co') then raise exception 'Confirm the exact retired Shop project ref'; end if;
 if p_action='archive' then
  update public.clients set lifecycle_state='Archived',status='Archived',archived_at=coalesce(archived_at,now()) where id=p_client;
 else
  update public.clients set infrastructure_state=case when p_action='mark-destroyed' then 'destroyed' else 'decommissioned' end where id=p_client;
 end if;
 -- Never contact the remote Shop. Late callbacks cannot resurrect this account.
 update public.bridge_sources set enabled=false where client_id=p_client;
 for j in select request_id from public.config_jobs where client_id=p_client and state in ('sending','uncertain') loop
  update public.config_jobs set state='failed',result=jsonb_build_object('resolution',p_action,'remote_outcome','unknown'),finished_at=now(),updated_at=now(),recovery_id=null,recovery_until=null where request_id=j.request_id;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'operation_closed',jsonb_build_object('request_id',j.request_id,'resolution',p_action,'reason',p_reason,'remote_outcome','unknown'));
 end loop;
 for j in select request_id from platform_private.provision_jobs where client_id=p_client and state<>'complete' loop
  update platform_private.provision_jobs set state='complete',step='closed',error='Closed locally: '||p_action,updated_at=now() where request_id=j.request_id;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'provision_closed',jsonb_build_object('request_id',j.request_id,'resolution',p_action,'reason',p_reason));
 end loop;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),p_action,jsonb_build_object('reason',p_reason,'project_ref',p_project_ref,'remote_call',false));
 return jsonb_build_object('client_id',p_client,'action',p_action);
end $$;
revoke all on function public.platform_client_lifecycle(integer,text,text,text) from public,anon;
grant execute on function public.platform_client_lifecycle(integer,text,text,text) to authenticated;

-- Reuse the original request protocol and its boolean-field validation.
alter function platform_private.begin_config(integer,uuid,jsonb) rename to begin_config_v1;
create function platform_private.begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 perform 1 from public.clients where id=p_client and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned') for update;
 if not found then raise exception 'Client infrastructure is retired; configuration dispatch is unavailable'; end if;
 return platform_private.begin_config_v1(p_client,p_request,p_changes);
end $$;
revoke all on function platform_private.begin_config_v1(integer,uuid,jsonb) from public,anon,authenticated;
revoke all on function platform_private.begin_config(integer,uuid,jsonb) from public,anon;
grant execute on function platform_private.begin_config(integer,uuid,jsonb) to authenticated;

alter function platform_private.finish_config(uuid,text,jsonb) rename to finish_config_v1;
create function platform_private.finish_config(p_request uuid,p_state text,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype;
begin
 select * into strict j from public.config_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from public.config_jobs where request_id=p_request for update;
 if j.state not in ('sending','uncertain') or exists(select 1 from public.clients where id=j.client_id and (lifecycle_state='Archived' or infrastructure_state in ('destroyed','decommissioned'))) then return; end if;
 perform platform_private.finish_config_v1(p_request,p_state,p_result);
 if p_state='applied' and j.changes ? 'suspended' then
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,case when (j.changes->>'suspended')::boolean then 'suspend' else 'reactivate' end,jsonb_build_object('request_id',p_request,'verified_remote',true));
 end if;
 update public.config_jobs set updated_at=now() where request_id=p_request;
end $$;
revoke all on function platform_private.finish_config_v1(uuid,text,jsonb),platform_private.finish_config(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function platform_private.finish_config(uuid,text,jsonb) to service_role;

create function public.platform_config_recovery(p_client integer,p_request uuid,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype; token uuid;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 select * into strict j from public.config_jobs where client_id=p_client and request_id=p_request for update;
 if p_action not in ('read','retry','reconcile','close') or p_action is null or length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Recovery action and audited reason required'; end if;
 if j.state not in ('sending','uncertain') then return jsonb_build_object('complete',true,'state',j.state); end if;
 if j.updated_at>now()-interval '60 seconds' or j.recovery_until>now() then raise exception 'Operation still executing; wait before recovery'; end if;
 if exists(select 1 from public.clients where id=p_client and (lifecycle_state='Archived' or infrastructure_state in ('destroyed','decommissioned'))) then raise exception 'Infrastructure retired; archive or close locally'; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'config_recovery_'||p_action,jsonb_build_object('request_id',p_request,'reason',p_reason));
 if p_action='close' then
  update public.config_jobs set state='failed',result=jsonb_build_object('resolution','manual-close','remote_outcome','unknown'),finished_at=now(),updated_at=now() where request_id=p_request;
  return jsonb_build_object('complete',true,'state','failed');
 end if;
 token:=pg_catalog.gen_random_uuid();
 update public.config_jobs set recovery_id=token,recovery_until=now()+interval '60 seconds' where request_id=p_request;
 return jsonb_build_object('complete',false,'recovery_id',token,'request_id',p_request,'changes',j.changes);
end $$;
revoke all on function public.platform_config_recovery(integer,uuid,text,text) from public,anon;
grant execute on function public.platform_config_recovery(integer,uuid,text,text) to authenticated;
create function public.platform_config_recovery_finish(p_request uuid,p_recovery uuid,p_state text,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype;
begin
 select * into strict j from public.config_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from public.config_jobs where request_id=p_request for update;
 if j.recovery_id is distinct from p_recovery or p_recovery is null then raise exception 'Recovery lease changed'; end if;
 if p_state is not null then perform platform_private.finish_config(p_request,p_state,p_result); end if;
 update public.config_jobs set recovery_id=null,recovery_until=null,result=coalesce(p_result,result) where request_id=p_request;
end $$;
revoke all on function public.platform_config_recovery_finish(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_config_recovery_finish(uuid,uuid,text,jsonb) to service_role;

create table platform_private.provision_stages (
 request_id uuid references platform_private.provision_jobs(request_id),name text not null,
 state text not null check(state in ('running','passed','failed','manual')),
 checksum text,updated_at timestamptz not null default now(), primary key(request_id,name)
);
alter table platform_private.provision_stages enable row level security;
revoke all on platform_private.provision_stages from public,anon,authenticated;
grant all on platform_private.provision_stages to service_role;
alter table platform_private.provision_jobs drop constraint provision_jobs_action_check;
alter table platform_private.provision_jobs add constraint provision_jobs_action_check check(action in
 ('provision','verify','activate','rotate','replace','provision-call','rotate-call','pair-shop','bootstrap-shop','onboarding-status','invite-owner','managed-setup','rotate-turnstile'));
alter function platform_private.provision_begin(integer,uuid,text,jsonb) rename to provision_begin_v1;
create function platform_private.provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict c from public.clients where id=p_client for update;
 if c.lifecycle_state='Archived' or c.infrastructure_state in ('destroyed','decommissioned') then raise exception 'Retired infrastructure cannot be provisioned'; end if;
 if p_action not in ('managed-setup','rotate-turnstile') then return platform_private.provision_begin_v1(p_client,p_request,p_action,p_params); end if;
 if c.pairing_mode<>'managed' or c.onboarding_version<>2 or p_request is null or p_params is null or jsonb_typeof(p_params)<>'object' or p_params-array['site_key']<>'{}' or jsonb_typeof(p_params->'site_key') is distinct from 'string' or coalesce(p_params->>'site_key','') !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'Managed V2 setup and public site key required'; end if;
 select * into j from platform_private.provision_jobs where request_id=p_request for update;
 if found then
  if j.client_id<>p_client or j.action<>p_action or j.params<>p_params or j.actor_id<>auth.uid() then raise exception 'Request identity conflict'; end if;
  if j.state='complete' then return jsonb_build_object('complete',true); end if;
  if j.state='running' then raise exception 'Running operation must be reconciled before retry'; end if;
  update platform_private.provision_jobs set state='running',error=null,updated_at=now() where request_id=p_request;
 else
  if exists(select 1 from platform_private.provision_jobs where client_id=p_client and state<>'complete') or exists(select 1 from public.config_jobs where client_id=p_client and state in ('sending','uncertain')) then raise exception 'Reconcile pending operation first'; end if;
  insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params) values(p_request,p_client,auth.uid(),p_action,p_params);
 end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'provision_'||p_action,jsonb_build_object('request_id',p_request,'mode',c.pairing_mode,'project_ref',substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$')));
 return jsonb_build_object('complete',false);
end $$;
revoke all on function platform_private.provision_begin_v1(integer,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function platform_private.provision_begin(integer,uuid,text,jsonb) from public,anon;
grant execute on function platform_private.provision_begin(integer,uuid,text,jsonb) to authenticated;

create function public.platform_managed_stage(p_request uuid,p_name text,p_state text,p_checksum text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; previous platform_private.provision_stages%rowtype;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned') for update;
 if not found then raise exception 'Infrastructure retired'; end if;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('managed-setup','rotate-turnstile') or p_name !~ '^(project-access|migrations|migration:[0-9]+|server-secrets|turnstile|functions|function:[a-z-]+|bridge-owner|preflight)$' or p_state not in ('running','passed','failed','manual') then raise exception 'Invalid managed stage'; end if;
 select * into previous from platform_private.provision_stages where request_id=p_request and name=p_name;
 if found and p_name='turnstile' and previous.checksum is not null and previous.checksum is distinct from p_checksum and not (previous.state='passed' and p_checksum is null) then raise exception 'Resume with the original Turnstile secret or close and begin explicit rotation'; end if;
 if found and previous.state='passed' then
  if previous.checksum is distinct from p_checksum and not (p_name='turnstile' and p_checksum is null) then raise exception 'Approved artifact changed; reconcile before retry'; end if;
  return jsonb_build_object('skip',true);
 end if;
 insert into platform_private.provision_stages(request_id,name,state,checksum) values(p_request,p_name,p_state,p_checksum)
 on conflict(request_id,name) do update set state=excluded.state,checksum=excluded.checksum,updated_at=now();
 update platform_private.provision_jobs set step=p_name,updated_at=now() where request_id=p_request;
 if p_name='turnstile' and p_state='passed' then update public.clients set turnstile_configured_at=now(),turnstile_site_key=j.params->>'site_key' where id=j.client_id; end if;
 if p_name='project-access' and p_state='passed' then update public.clients set infrastructure_state='present' where id=j.client_id; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_stage',jsonb_build_object('request_id',p_request,'stage',p_name,'state',p_state));
 return jsonb_build_object('skip',false);
end $$;
revoke all on function public.platform_managed_stage(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.platform_managed_stage(uuid,text,text,text) to service_role;

create function public.platform_provision_reconcile(p_client integer,p_request uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request and client_id=p_client for update;
 if p_action not in ('resume','close') or p_action is null or length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Audited recovery reason required'; end if;
 -- Longer than the Edge execution window; never race a live provisioner.
 if j.state='running' and j.updated_at>now()-interval '10 minutes' then raise exception 'Provisioner may still be running; wait ten minutes'; end if;
 if j.state='complete' then return; end if;
 if p_action='resume' and j.action not in ('managed-setup','rotate-turnstile','pair-shop','bootstrap-shop','onboarding-status') then raise exception 'This legacy operation requires manual reconciliation'; end if;
 update platform_private.provision_jobs set state=case when p_action='close' then 'complete' else 'retry' end,step=case when p_action='close' then 'closed' else step end,error='Administrator reconciliation: '||p_action,updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'provision_reconcile_'||p_action,jsonb_build_object('request_id',p_request,'reason',p_reason,'remote_outcome','unknown'));
end $$;
revoke all on function public.platform_provision_reconcile(integer,uuid,text,text) from public,anon;
grant execute on function public.platform_provision_reconcile(integer,uuid,text,text) to authenticated;

create function public.platform_overhaul_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 return jsonb_build_object('config_jobs',(select coalesce(jsonb_agg(to_jsonb(j) order by created_at desc),'[]') from public.config_jobs j where client_id=p_client and state in ('sending','uncertain')),
 'stages',(select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at),'[]') from platform_private.provision_stages s where request_id=(select request_id from platform_private.provision_jobs where client_id=p_client order by created_at desc limit 1)),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select actor_id,action,detail,created_at from public.operator_audit where client_id=p_client order by id desc limit 30) a));
end $$;
revoke all on function public.platform_overhaul_status(integer) from public,anon;
grant execute on function public.platform_overhaul_status(integer) to authenticated;

-- Preserve the exact V2 payload/health contract for the two managed actions.
create or replace function public.platform_onboarding_step(p_request uuid,p_step text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c public.clients%rowtype;
 s platform_private.shop_credentials%rowtype; ref text; v uuid; src uuid; payload jsonb; checks jsonb; ready boolean;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('pair-shop','bootstrap-shop','onboarding-status','invite-owner','managed-setup','rotate-turnstile') then raise exception 'Invalid onboarding job'; end if;
 select * into s from platform_private.shop_credentials where client_id=j.client_id for update;
 if p_step='prepare' then
  if c.onboarding_version<>2 then raise exception 'Existing clients use existing verification/cutover workflow'; end if;
  if j.action='invite-owner' and coalesce(s.health->>'infrastructure','')<>'ready' then raise exception 'Provision infrastructure before requesting an optional invitation'; end if;
  ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');
  if ref is null then raise exception 'Shop project required'; end if;
  if s.client_id is null then
   if j.action not in ('pair-shop','managed-setup') then raise exception 'Pair Shop first'; end if;
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
  if p_data->>'client_binding' is distinct from s.client_binding and coalesce(p_data->'checks'->>'owner_reservation','false')='true' then raise exception 'Shop binding mismatch'; end if;
  select jsonb_object_agg(k,coalesce(p_data->>'contract','')='orbito-onboarding-runtime-v1' and coalesce(p_data->'checks'->k,'false')='true'::jsonb) into checks
   from unnest(array['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication']) k;
  ready:=not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb) and p_data->>'client_binding'=s.client_binding
   and coalesce(p_data->>'owner_account','missing')<>'conflict'
   and exists(select 1 from public.bridge_sources bs where bs.client_id=c.id and bs.client_binding=s.client_binding and bs.enabled and bs.source_id::text=p_data->>'source_id');
  if coalesce(p_data->>'owner_account','missing') not in ('missing','unconfirmed','ready','active','conflict') then raise exception 'Invalid owner diagnostic'; end if;
  update platform_private.shop_credentials set verified_at=now(),health=health-'error'||jsonb_build_object(
   'connection','Connected','config_access',case when checks->>'database_reachable'='true' then 'Reachable' else 'Pending' end,'bridge_call_configured',true,
   'runtime_details',jsonb_build_object('turnstile',p_data->'runtime_details'->'turnstile'='true'::jsonb,'functions',coalesce((select jsonb_object_agg(k,coalesce(p_data->'runtime_details'->'functions'->k='true'::jsonb,false)) from unnest(array['login','account-admin','verify-pin','password-reset-request','public-track']) k),'{}'::jsonb)),'owner_setup',p_data->>'owner_setup','infrastructure',case when ready then 'ready' else 'pending' end,'checks',checks,'owner_account',coalesce(p_data->>'owner_account','missing'),'owner_invite',p_data->>'owner_invite','onboarding',p_data->>'onboarding','shop_config',p_data->'config',
   'billing_projection',case when checks->>'config_projection'='true' then 'Ready' else 'Pending' end)
   where client_id=c.id;
 if ready and p_data->>'onboarding'='onboarding_complete' and p_data->>'owner_setup'='owner_active' then update public.clients set lifecycle_state=case when status='Suspended' then 'Suspended' else 'Active' end where id=c.id and lifecycle_state='Provisioning'; end if;
 else raise exception 'Unsupported onboarding step'; end if;
 return '{}'::jsonb;
end $$;

create function public.platform_provision_status_service(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$ select health from platform_private.shop_credentials where client_id=p_client $$;
revoke all on function public.platform_provision_status_service(integer) from public,anon,authenticated;
grant execute on function public.platform_provision_status_service(integer) to service_role;
-- Retired infrastructure must not be contacted by any older bridge caller either.
create or replace function platform_private.bridge_call_credential(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project_ref',s.project_ref,'bridge_call_secret',v.decrypted_secret)
 from platform_private.shop_credentials s join vault.decrypted_secrets v on v.id=s.bridge_call_secret_id
 join public.clients c on c.id=s.client_id
 where s.client_id=p_client and c.lifecycle_state<>'Archived' and c.infrastructure_state not in ('destroyed','decommissioned')
$$;
commit;
