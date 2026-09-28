-- Dedicated Platform -> Shop invocation credential. No ledger/source/cutover writes.
begin;
alter table platform_private.shop_credentials add column bridge_call_secret_id uuid references vault.secrets(id);
-- Pending secret survives retries without replacing the existing source-secret slot.
alter table platform_private.provision_jobs add column bridge_call_secret_id uuid references vault.secrets(id);
alter table platform_private.provision_jobs drop constraint provision_jobs_action_check;
alter table platform_private.provision_jobs add constraint provision_jobs_action_check
 check(action in ('provision','verify','activate','rotate','replace','provision-call','rotate-call'));
create or replace function platform_private.provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 if not found or p_request is null then raise exception 'Client and request identity required'; end if;
 if p_action not in ('provision','verify','activate','rotate','replace','provision-call','rotate-call') or p_params is null
  or jsonb_typeof(p_params)<>'object' or p_params-array['project_ref','client_binding','confirmed','note']<>'{}'::jsonb then raise exception 'Invalid provisioning intent'; end if;
 if p_action='activate' and (p_params->>'confirmed' is distinct from 'true' or length(coalesce(p_params->>'note','')) not between 5 and 500) then raise exception 'Confirm paused Shop writes and reconciliation with a cutover note'; end if;
 select * into j from platform_private.provision_jobs where request_id=p_request for update;
 if found then
  if j.client_id<>p_client or j.action<>p_action or j.params<>p_params or j.actor_id<>auth.uid() then raise exception 'Request identity conflict'; end if;
  if j.state='running' then raise exception 'Operation is still running; refresh status. Interrupted executions require administrator reconciliation'; end if;
  if j.state='complete' then return jsonb_build_object('complete',true); end if;
  update platform_private.provision_jobs set state='running',error=null,updated_at=now() where request_id=p_request;
 else
  if exists(select 1 from platform_private.provision_jobs where client_id=p_client and state<>'complete') then raise exception 'Resume the pending provisioning operation first'; end if;
  if exists(select 1 from public.config_jobs where client_id=p_client and state in ('sending','uncertain')) then raise exception 'Reconcile the pending module configuration first'; end if;
  insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params) values(p_request,p_client,auth.uid(),p_action,p_params);
 end if;
 return jsonb_build_object('complete',false);
end $$;
create or replace function platform_private.provision_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 return jsonb_build_object(
  'connection',(select jsonb_build_object('project_ref',project_ref,'client_binding',client_binding,'credential_stored',true,'bridge_call_configured',bridge_call_secret_id is not null,'rotated_at',rotated_at,'health',health,'verified_at',verified_at) from platform_private.shop_credentials where client_id=p_client),
  'job',(select jsonb_build_object('request_id',request_id,'action',action,'state',state,'step',step,'error',error,'updated_at',updated_at,'cutover_sequence',plan->>'cutover_sequence','params',params) from platform_private.provision_jobs where client_id=p_client order by created_at desc limit 1),
  'last_accepted_event',(select max(received_at) from public.bridge_events where client_id=p_client),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select action,detail,created_at from public.operator_audit where client_id=p_client and action like 'provision_%' order by id desc limit 12) a)
 );
end $$;

create function platform_private.bridge_call_credential(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project_ref',c.project_ref,'bridge_call_secret',v.decrypted_secret)
 from platform_private.shop_credentials c left join vault.decrypted_secrets v on v.id=c.bridge_call_secret_id
 where c.client_id=p_client
$$;
create function public.platform_bridge_call_credential(p_client integer) returns jsonb
language sql set search_path='' as $$ select platform_private.bridge_call_credential(p_client) $$;

create function platform_private.prepare_bridge_call(p_request uuid,p_candidate text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c platform_private.shop_credentials%rowtype; v uuid; value text;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('provision','provision-call','rotate-call') then raise exception 'Invalid call-credential operation'; end if;
 select * into strict c from platform_private.shop_credentials where client_id=j.client_id for update;
 v:=j.bridge_call_secret_id;
 if v is null then
  if j.action<>'rotate-call' then v:=c.bridge_call_secret_id; end if;
  if v is null then
   if p_candidate is null or p_candidate !~ '^[a-f0-9]{64}$' then raise exception 'Random 32-byte call credential required'; end if;
   v:=vault.create_secret(p_candidate);
  end if;
  update platform_private.provision_jobs set bridge_call_secret_id=v where request_id=p_request;
 end if;
 select decrypted_secret into strict value from vault.decrypted_secrets where id=v;
 return jsonb_build_object('project_ref',c.project_ref,'bridge_call_secret',value);
end $$;
create function public.platform_prepare_bridge_call(p_request uuid,p_candidate text) returns jsonb
language sql set search_path='' as $$ select platform_private.prepare_bridge_call(p_request,p_candidate) $$;

create function platform_private.commit_bridge_call(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; prior uuid;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('provision','provision-call','rotate-call') or j.bridge_call_secret_id is null then raise exception 'Call credential not prepared'; end if;
 select bridge_call_secret_id into prior from platform_private.shop_credentials where client_id=j.client_id for update;
 update platform_private.shop_credentials set bridge_call_secret_id=j.bridge_call_secret_id where client_id=j.client_id;
 if not found then raise exception 'Existing Shop credential record required'; end if;
 if prior is distinct from j.bridge_call_secret_id then
  insert into public.operator_audit(client_id,actor_id,action,detail)
  values(j.client_id,j.actor_id,case when prior is null then 'provision_bridge_call_stored' else 'provision_bridge_call_rotated' end,jsonb_build_object('request_id',p_request));
 end if;
end $$;
create function public.platform_commit_bridge_call(p_request uuid) returns void
language sql set search_path='' as $$ select platform_private.commit_bridge_call(p_request) $$;

-- Safe poll diagnostics belong to private connection health, not ingestion last_error.
create function platform_private.bridge_call_health(p_client integer,p_code text,p_http_status integer default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_code is null or p_code not in ('ok','missing_bridge_call_credential','credential_lookup_failed','shop_http_error','network_or_timeout','invalid_shop_response','shop_delivery_disabled')
  or (p_http_status is not null and p_http_status not between 100 and 599) then raise exception 'Invalid bridge diagnostic'; end if;
 update platform_private.shop_credentials set health=health||jsonb_build_object('bridge_call',jsonb_build_object('code',p_code,'http_status',p_http_status,'checked_at',clock_timestamp())) where client_id=p_client;
end $$;
create function public.platform_bridge_call_health(p_client integer,p_code text,p_http_status integer default null) returns void
language sql set search_path='' as $$ select platform_private.bridge_call_health(p_client,p_code,p_http_status) $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='platform_private' and p.proname in ('bridge_call_credential','prepare_bridge_call','commit_bridge_call','bridge_call_health'))
 or (n.nspname='public' and p.proname in ('platform_bridge_call_credential','platform_prepare_bridge_call','platform_commit_bridge_call','platform_bridge_call_health')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
-- Replaced begin/status functions preserve their existing role checks and grants.
commit;
