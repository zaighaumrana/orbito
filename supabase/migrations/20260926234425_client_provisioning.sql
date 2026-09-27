-- Additive provisioning; requires the deployed Platform control plane and Supabase Vault.
-- No reset, billing-rule changes or Shop schema changes.
begin;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;
revoke all on schema vault from public,anon,authenticated;
revoke all on all tables in schema vault from public,anon,authenticated;
create table platform_private.shop_credentials (
 client_id integer primary key references public.clients(id),
 project_ref text not null unique check(project_ref ~ '^[a-z]{20}$'),
 client_binding text not null check(length(client_binding) between 1 and 200),
 secret_id uuid not null references vault.secrets(id),
 bridge_secret_id uuid references vault.secrets(id),
 created_at timestamptz not null default now(), rotated_at timestamptz, poll_attempted_at timestamptz,
 health jsonb not null default '{}', verified_at timestamptz
);
create table platform_private.provision_jobs (
 request_id uuid primary key, client_id integer not null references public.clients(id), actor_id uuid not null,
 action text not null check(action in ('provision','verify','activate','rotate','replace')),
 params jsonb not null, state text not null default 'running' check(state in ('running','retry','complete')),
 step text not null default 'reserved', plan jsonb not null default '{}',
 secret_id uuid references vault.secrets(id), error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index provision_one_pending on platform_private.provision_jobs(client_id) where state<>'complete';
create index provision_client_recent on platform_private.provision_jobs(client_id,created_at desc);
alter table platform_private.shop_credentials enable row level security;
alter table platform_private.provision_jobs enable row level security;
revoke all on platform_private.shop_credentials,platform_private.provision_jobs from public,anon,authenticated;
grant all on platform_private.shop_credentials,platform_private.provision_jobs to service_role;

create function platform_private.provision_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 return jsonb_build_object(
  'connection',(select jsonb_build_object('project_ref',project_ref,'client_binding',client_binding,'credential_stored',true,'rotated_at',rotated_at,'health',health,'verified_at',verified_at) from platform_private.shop_credentials where client_id=p_client),
  'job',(select jsonb_build_object('request_id',request_id,'action',action,'state',state,'step',step,'error',error,'updated_at',updated_at,'cutover_sequence',plan->>'cutover_sequence','params',params) from platform_private.provision_jobs where client_id=p_client order by created_at desc limit 1),
  'last_accepted_event',(select max(received_at) from public.bridge_events where client_id=p_client),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select action,detail,created_at from public.operator_audit where client_id=p_client and action like 'provision_%' order by id desc limit 12) a)
 );
end $$;
create function public.platform_provision_status(p_client integer) returns jsonb
language sql set search_path='' as $$ select platform_private.provision_status(p_client) $$;

-- Browser callers reserve NON-SECRET intent only. A unique pending job serializes all
-- provisioning actions. No timed lease permits overlapping cross-project writes.
create function platform_private.provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 if not found or p_request is null then raise exception 'Client and request identity required'; end if;
 if p_action not in ('provision','verify','activate','rotate','replace') or p_params is null
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
create function public.platform_provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb
language sql set search_path='' as $$ select platform_private.provision_begin(p_client,p_request,p_action,p_params) $$;

-- ONLY service_role can retrieve plaintext from Vault; never grant these wrappers to operators.
create function platform_private.shop_credential(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project_ref',c.project_ref,'client_binding',c.client_binding,'service_role_key',s.decrypted_secret)
 from platform_private.shop_credentials c join vault.decrypted_secrets s on s.id=c.secret_id where c.client_id=p_client
$$;
create function public.platform_shop_credential(p_client integer) returns jsonb
language sql set search_path='' as $$ select platform_private.shop_credential(p_client) $$;

-- Fixed narrow service operations; raw secrets never enter job params, audit or public status.
create function platform_private.provision_step(p_request uuid,p_step text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c platform_private.shop_credentials%rowtype;
 s public.bridge_sources%rowtype; v uuid; sid uuid; secret text; client public.clients%rowtype;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 select * into strict client from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' then raise exception 'Job not running'; end if;
 select * into c from platform_private.shop_credentials where client_id=j.client_id;
 select * into s from public.bridge_sources where client_id=j.client_id;
 if p_step='context' then
  return jsonb_build_object('job',to_jsonb(j)-'secret_id','connection',platform_private.shop_credential(j.client_id),
   'source',case when s.source_id is null then null else to_jsonb(s) end,'currency',client.currency,'review_required',client.accounting_review_required,
   'source_credential_exists',exists(select 1 from platform_private.source_credentials where source_id=s.source_id),
   'projection_exists',exists(select 1 from public.billing_projections where client_id=j.client_id));
 elsif p_step='credential' then
  if j.action not in ('provision','replace') then raise exception 'Credential operation not allowed'; end if;
  if (j.params->>'project_ref') !~ '^[a-z]{20}$' or length(coalesce(j.params->>'client_binding','')) not between 1 and 200 then raise exception 'Project and binding required'; end if;
  if c.client_id is not null and (c.project_ref<>j.params->>'project_ref' or c.client_binding<>j.params->>'client_binding') then raise exception 'Existing destination and binding are immutable; reconcile before reassignment'; end if;
  if s.source_id is not null and s.client_binding<>j.params->>'client_binding' then raise exception 'Existing source binding differs'; end if;
  if length(coalesce(p_data->>'credential','')) not between 40 and 4096 then raise exception 'Shop service credential required'; end if;
  if c.secret_id is null then
   v:=vault.create_secret(p_data->>'credential');
   insert into platform_private.shop_credentials(client_id,project_ref,client_binding,secret_id) values(j.client_id,j.params->>'project_ref',j.params->>'client_binding',v);
  else
   perform vault.update_secret(c.secret_id,p_data->>'credential');
   update platform_private.shop_credentials set rotated_at=now(),verified_at=null,health='{}' where client_id=j.client_id;
  end if;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,case when c.secret_id is null then 'provision_credentials_stored' else 'provision_credential_replaced' end,jsonb_build_object('request_id',p_request));
  update platform_private.provision_jobs set step='credential_saved' where request_id=p_request;
 elsif p_step='checkpoint' then
  update platform_private.provision_jobs set step='remote_changes_started' where request_id=p_request;
 elsif p_step='secret' then
  if j.action not in ('provision','rotate') then raise exception 'Secret operation not allowed'; end if;
  if j.secret_id is null then
   if j.action='provision' and c.bridge_secret_id is not null then v:=c.bridge_secret_id;
   else v:=vault.create_secret(p_data->>'secret'); end if;
   if v is null then raise exception 'Secret required'; end if;
   update platform_private.provision_jobs set secret_id=v where request_id=p_request;
  else v:=j.secret_id; end if;
  select decrypted_secret into strict secret from vault.decrypted_secrets where id=v;
  return jsonb_build_object('secret',secret);
 elsif p_step='bind' then
  sid:=(p_data->>'source_id')::uuid;
  if j.action<>'provision' or c.client_id is null or j.secret_id is null or client.currency is null then raise exception 'Provisioning prerequisites missing'; end if;
  if s.source_id is not null and (s.source_id<>sid or s.enabled or s.usage_from_sequence is not null) then raise exception 'Cannot reprovision an active or different source'; end if;
  insert into public.bridge_sources(source_id,client_id,client_binding) values(sid,j.client_id,c.client_binding) on conflict(client_id) do nothing;
  insert into platform_private.source_credentials(source_id,secret_sha256) values(sid,p_data->>'hash') on conflict(source_id) do update set secret_sha256=excluded.secret_sha256;
  update platform_private.shop_credentials set bridge_secret_id=j.secret_id where client_id=j.client_id;
  perform platform_private.publish_billing(j.client_id);
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_source_ready',jsonb_build_object('source_id',sid,'request_id',p_request));
 elsif p_step='plan' then
  if j.action<>'activate' or s.source_id is null or s.enabled or s.usage_from_sequence is not null or client.currency is null or client.accounting_review_required or (c.verified_at is null and j.plan->>'cutover_sequence' is null) then raise exception 'Verify and reconcile the inactive source before activation'; end if;
  if (p_data->>'cutover_sequence')::bigint<1 then raise exception 'Invalid cutover'; end if;
  update platform_private.provision_jobs set plan=jsonb_build_object('cutover_sequence',p_data->>'cutover_sequence'),step='cutover_planned' where request_id=p_request;
 elsif p_step='enable_source' then
  if j.action<>'activate' or j.plan->>'cutover_sequence' is null then raise exception 'Cutover plan required'; end if;
  if s.usage_from_sequence is not null and s.usage_from_sequence<>(j.plan->>'cutover_sequence')::bigint then raise exception 'Cutover conflict'; end if;
  update public.bridge_sources set usage_from_sequence=(j.plan->>'cutover_sequence')::bigint,cutover_note=j.params->>'note',enabled=true where client_id=j.client_id;
  perform platform_private.publish_billing(j.client_id);
  update platform_private.provision_jobs set step='source_enabled' where request_id=p_request;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_source_activated',jsonb_build_object('request_id',p_request,'cutover_sequence',j.plan->>'cutover_sequence'));
 elsif p_step='rotation_plan' then
  if j.action<>'rotate' then raise exception 'Rotation required'; end if;
  if j.plan='{}' then update platform_private.provision_jobs set plan=jsonb_build_object('restore_delivery',p_data->'restore_delivery'),step='rotation_planned' where request_id=p_request; end if;
 elsif p_step='rotate_hash' then
  if j.action<>'rotate' or j.secret_id is null or s.source_id is null then raise exception 'Rotation prerequisites missing'; end if;
  update platform_private.source_credentials set secret_sha256=p_data->>'hash' where source_id=s.source_id;
  if not found then raise exception 'Source credential missing'; end if;
  update platform_private.shop_credentials set bridge_secret_id=j.secret_id,rotated_at=now() where client_id=j.client_id;
 elsif p_step='verified' then
  update platform_private.shop_credentials set health=p_data,verified_at=now() where client_id=j.client_id;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_connection_verified',jsonb_build_object('request_id',p_request));
 elsif p_step='complete' then
  update platform_private.provision_jobs set state='complete',step='complete',error=null,updated_at=now() where request_id=p_request;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_'||j.action||'_complete',jsonb_build_object('request_id',p_request));
 elsif p_step='failure' then
  update platform_private.provision_jobs set state='retry',error=left(p_data->>'error',300),updated_at=now() where request_id=p_request;
  update platform_private.shop_credentials set verified_at=null,health=health||jsonb_build_object('error',left(p_data->>'error',300)) where client_id=j.client_id;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'provision_failed',jsonb_build_object('request_id',p_request,'stage',p_data->>'stage'));
 else raise exception 'Unsupported provisioning step'; end if;
 return '{}'::jsonb;
end $$;
create function public.platform_provision_step(p_request uuid,p_step text,p_data jsonb) returns jsonb
language sql set search_path='' as $$ select platform_private.provision_step(p_request,p_step,p_data) $$;

-- Safe cancellation only before remote changes, or after a read-only verification failure.
create function platform_private.provision_cancel(p_client integer,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request and client_id=p_client for update;
 if j.state<>'retry' or not (j.step in ('reserved','credential_saved') or j.action='verify') then raise exception 'Remote changes may exist; resume or reconcile this operation'; end if;
 update platform_private.provision_jobs set state='complete',step='cancelled',updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'provision_cancelled',jsonb_build_object('request_id',p_request));
end $$;
create function public.platform_provision_cancel(p_client integer,p_request uuid) returns void
language sql set search_path='' as $$ select platform_private.provision_cancel(p_client,p_request) $$;

-- A single Platform scheduler polls newly managed active Shops; no per-Shop cron setup.
create function platform_private.provision_poll_targets() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as (
  select c.client_id from platform_private.shop_credentials c join public.bridge_sources s using(client_id)
  where s.enabled and (c.poll_attempted_at is null or c.poll_attempted_at<now()-interval '50 seconds')
   and not exists(select 1 from platform_private.provision_jobs j where j.client_id=c.client_id and j.state<>'complete')
  order by c.poll_attempted_at nulls first,c.client_id limit 20 for update of c skip locked
 ), claimed as (
  update platform_private.shop_credentials c set poll_attempted_at=now() from candidates t where t.client_id=c.client_id returning c.client_id
 ) select coalesce(jsonb_agg(client_id),'[]') into result from claimed;
 return result;
end $$;
create function public.platform_provision_poll_targets() returns jsonb
language sql set search_path='' as $$ select platform_private.provision_poll_targets() $$;

-- Existing config dispatch shares the client lock with credential/provisioning changes.
create function platform_private.guard_config_provisioning() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clients where id=new.client_id for update;
 if exists(select 1 from platform_private.provision_jobs where client_id=new.client_id and state<>'complete') then raise exception 'Finish provisioning before changing modules'; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(new.client_id,new.actor_id,'provision_module_dispatched',jsonb_build_object('request_id',new.request_id,'changes',new.changes));
 return new;
end $$;
create trigger config_provisioning_guard before insert on public.config_jobs for each row execute function platform_private.guard_config_provisioning();

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='platform_private' and p.proname in ('provision_status','provision_begin','shop_credential','provision_step','guard_config_provisioning','provision_cancel','provision_poll_targets'))
 or (n.nspname='public' and p.proname in ('platform_provision_status','platform_provision_begin','platform_shop_credential','platform_provision_step','platform_provision_cancel','platform_provision_poll_targets')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function platform_private.provision_status(integer),public.platform_provision_status(integer),
 platform_private.provision_begin(integer,uuid,text,jsonb),public.platform_provision_begin(integer,uuid,text,jsonb),
 platform_private.provision_cancel(integer,uuid),public.platform_provision_cancel(integer,uuid) to authenticated;
commit;
