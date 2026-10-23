-- Platform control plane only. No customer SQL, pins, owner identities or secrets changed.
begin;
create table platform_private.shop_upgrade_jobs(
 request_id uuid primary key,client_id integer not null references public.clients(id),mode text not null check(mode in('managed','byo')),
 project_ref text not null,source_id uuid not null,client_binding text not null,source_sha256 text not null,target_sha256 text not null,
 actor_id uuid not null,session_id uuid not null,state text not null default 'review' check(state in('review','approved','running','paused','uncertain','verification_required','complete','completed_reviewed','cancelled')),
 plan jsonb,plan_sha256 text,conditions jsonb,steps jsonb not null default '{}',verification jsonb,
 invocation uuid,unknown_step text,customer_token_hash text,customer_expires_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index shop_upgrade_one_active on platform_private.shop_upgrade_jobs(client_id) where state not in('complete','completed_reviewed','cancelled');
alter table platform_private.shop_upgrade_jobs enable row level security;
revoke all on platform_private.shop_upgrade_jobs from public,anon,authenticated,service_role;
create function platform_private.upgrade_blockers(p_client integer,p_request uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from platform_private.provision_jobs where client_id=p_client and state<>'complete')
 or exists(select 1 from platform_private.managed_invocations i join platform_private.provision_jobs j using(request_id) where j.client_id=p_client and i.unknown_step is not null)
 or exists(select 1 from public.config_jobs where client_id=p_client and state in('sending','uncertain'))
 or exists(select 1 from platform_private.shop_upgrade_jobs where client_id=p_client and request_id is distinct from p_request and state not in('complete','completed_reviewed','cancelled'))
 then raise exception 'Reconcile original provisioning, configuration or upgrade operation first';end if;
end$$;
revoke all on function platform_private.upgrade_blockers(integer,uuid) from public,anon,authenticated,service_role;
-- Both directions take the same client row lock, closing preflight/start races.
create function platform_private.upgrade_operation_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.clients where id=new.client_id for update;
 if new.state in('complete','applied','failed') then return new;end if;
 if exists(select 1 from platform_private.shop_upgrade_jobs where client_id=new.client_id and state not in('complete','completed_reviewed','cancelled')) then raise exception 'Original backend upgrade must be settled before starting this operation';end if;
 return new;
end$$;
revoke all on function platform_private.upgrade_operation_guard() from public,anon,authenticated,service_role;
create trigger provision_upgrade_guard before insert or update on platform_private.provision_jobs for each row execute function platform_private.upgrade_operation_guard();
create trigger config_upgrade_guard before insert or update on public.config_jobs for each row execute function platform_private.upgrade_operation_guard();
create function platform_private.upgrade_target_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (new.supabase_url,new.pairing_mode,new.lifecycle_state,new.infrastructure_state) is distinct from (old.supabase_url,old.pairing_mode,old.lifecycle_state,old.infrastructure_state)
 and exists(select 1 from platform_private.shop_upgrade_jobs where client_id=old.id and state not in('complete','completed_reviewed','cancelled')) then raise exception 'Settle original backend upgrade before changing its target or lifecycle';end if;
 return new;
end$$;
revoke all on function platform_private.upgrade_target_guard() from public,anon,authenticated,service_role;
create trigger client_upgrade_guard before update on public.clients for each row execute function platform_private.upgrade_target_guard();
create function platform_private.upgrade_fence(p_request uuid) returns platform_private.shop_upgrade_jobs language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;c public.clients;b public.bridge_sources;begin
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request for update;
 perform platform_private.team_master(j.actor_id);
 select * into b from public.bridge_sources where client_id=j.client_id;
 if not platform_private.session_live(j.actor_id,j.session_id) or c.lifecycle_state<>'Active' or c.infrastructure_state<>'present'
 or c.pairing_mode<>j.mode or c.supabase_url is distinct from 'https://'||j.project_ref||'.supabase.co'
 or b.source_id is distinct from j.source_id or b.client_binding is distinct from j.client_binding then raise exception 'Upgrade authority or original destination changed' using errcode='42501';end if;
 perform platform_private.upgrade_blockers(j.client_id,j.request_id);
 return j;
end$$;
revoke all on function platform_private.upgrade_fence(uuid) from public,anon,authenticated,service_role;
-- A new authenticated Master session can review the SAME idle/interrupted job.
-- This never leases a running executor or discards its unknown provider step.
create function platform_private.upgrade_review_session(p_request uuid) returns platform_private.shop_upgrade_jobs language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request for update;
 if j.actor_id<>auth.uid() or (j.state in('running','uncertain') and j.updated_at>now()-interval '10 minutes') then raise exception 'Original Master ownership and interrupted-operation review delay required';end if;
 update platform_private.shop_upgrade_jobs set session_id=platform_private.caller_session_id() where request_id=p_request;
 return platform_private.upgrade_fence(p_request);
end$$;
revoke all on function platform_private.upgrade_review_session(uuid) from public,anon,authenticated,service_role;
create function public.platform_upgrade_status(p_client integer) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if not exists(select 1 from public.clients where id=p_client and (platform_private.operator_role()='master_admin' or lifecycle_state<>'Archived')) then raise exception 'Client evidence is outside the permitted scope' using errcode='42501';end if;
 return (select to_jsonb(j)-array['customer_token_hash','session_id','invocation'] from platform_private.shop_upgrade_jobs j where client_id=p_client order by created_at desc limit 1);
end$$;
create function public.platform_upgrade_prepare(p_client integer,p_request uuid,p_source text,p_target text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients;b public.bridge_sources;j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict c from public.clients where id=p_client for update;
 select * into b from public.bridge_sources where client_id=p_client;
 if c.lifecycle_state<>'Active' or c.infrastructure_state<>'present' or c.pairing_mode not in('managed','byo') or b.source_id is null or b.client_binding is null or c.supabase_url !~ '^https://[a-z]{20}\.supabase\.co$' or p_request is null then raise exception 'Exact eligible paired Shop required';end if;
 perform platform_private.upgrade_blockers(p_client,p_request);
 if not exists(select 1 from platform_private.approved_shop_releases where sha256=p_source and supported)
 or not exists(select 1 from platform_private.approved_shop_releases where sha256=p_target and supported and approved_for_new) or p_source=p_target then raise exception 'Distinct approved source and target required';end if;
 select * into j from platform_private.shop_upgrade_jobs where request_id=p_request;
 if found then
  if j.client_id<>p_client or j.source_sha256<>p_source or j.target_sha256<>p_target or j.actor_id<>auth.uid() then raise exception 'Original upgrade identity conflict';end if;
 else
  insert into platform_private.shop_upgrade_jobs(request_id,client_id,mode,project_ref,source_id,client_binding,source_sha256,target_sha256,actor_id,session_id)
  values(p_request,p_client,c.pairing_mode,substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$'),b.source_id,b.client_binding,p_source,p_target,auth.uid(),platform_private.caller_session_id()) returning * into j;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'upgrade_review_started',jsonb_build_object('request_id',p_request,'source',p_source,'target',p_target));
 end if;
 return to_jsonb(j)-array['customer_token_hash','invocation'];
end$$;
create function public.platform_upgrade_store_plan(p_request uuid,p_plan jsonb,p_sha256 text) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs:=platform_private.upgrade_fence(p_request);begin
 if j.state<>'review' or j.plan is not null or p_plan is null or not(p_plan?&array['contract','project_ref','client_id','source_sha256','target_sha256','steps']) or p_plan->>'contract' is distinct from 'retrasell-controlled-upgrade-v1' or p_plan->>'project_ref' is distinct from j.project_ref or (p_plan->>'client_id')::integer is distinct from j.client_id or p_plan->>'source_sha256' is distinct from j.source_sha256 or p_plan->>'target_sha256' is distinct from j.target_sha256 or coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_plan->'steps') is distinct from 'array' or jsonb_array_length(p_plan->'steps')>100 or octet_length(p_plan::text)>64000 then raise exception 'Exact bounded upgrade plan required';end if;
 update platform_private.shop_upgrade_jobs set plan=p_plan,plan_sha256=p_sha256,updated_at=now() where request_id=p_request;
end$$;
create function public.platform_upgrade_approve(p_request uuid,p_plan_sha256 text,p_conditions jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);j:=platform_private.upgrade_review_session(p_request);
 if j.actor_id<>auth.uid() or j.state not in('review','approved','paused') or j.unknown_step is not null or j.plan is null or j.plan_sha256 is distinct from p_plan_sha256 or p_conditions is null
 or p_conditions-array['confirmation','source_review_reference','maintenance_required','window_start','window_end','notification_state','notification_reference','customer_acknowledged']<>'{}'::jsonb
 or p_conditions->>'confirmation' is distinct from 'UPGRADE '||j.project_ref||' '||j.target_sha256
 or coalesce(p_conditions->>'maintenance_required','') not in('true','false')
 or (j.plan->>'source_fully_verified' is distinct from 'true' and coalesce(length(p_conditions->>'source_review_reference'),0) not between 5 and 150) then raise exception 'Exact Master approval and explicit source limitation review required';end if;
 if p_conditions->>'maintenance_required'='true' and ((p_conditions->>'window_start')::timestamptz is null or (p_conditions->>'window_end')::timestamptz is null or (p_conditions->>'window_end')::timestamptz<=(p_conditions->>'window_start')::timestamptz or p_conditions->>'notification_state' is distinct from 'acknowledged' or p_conditions->>'customer_acknowledged' is distinct from 'true' or coalesce(length(p_conditions->>'notification_reference'),0) not between 5 and 150) then raise exception 'Maintenance window and separately acknowledged customer notification required';end if;
 update platform_private.shop_upgrade_jobs set state='approved',conditions=p_conditions,session_id=platform_private.caller_session_id(),customer_token_hash=null,invocation=null,updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,auth.uid(),'upgrade_approved',jsonb_build_object('request_id',p_request,'plan_sha256',j.plan_sha256,'conditions',p_conditions,'source_review_kind','operator-reported'));
end$$;
create function public.platform_upgrade_claim(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;token uuid:=gen_random_uuid();begin
 perform platform_private.require_role(array['master_admin']);j:=platform_private.upgrade_fence(p_request);
 if j.actor_id<>auth.uid() or j.mode<>'managed' or j.state not in('approved','paused') or j.unknown_step is not null then raise exception 'Original approved Managed request is unavailable or already running';end if;
 if j.conditions->>'maintenance_required'='true' and now() not between (j.conditions->>'window_start')::timestamptz and (j.conditions->>'window_end')::timestamptz then raise exception 'Approved maintenance window is not active';end if;
 update platform_private.shop_upgrade_jobs set invocation=token,state='running',updated_at=now() where request_id=p_request;
 return to_jsonb(j)||jsonb_build_object('invocation',token,'state','running');
end$$;
create function public.platform_upgrade_customer_token(p_request uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs:=platform_private.upgrade_fence(p_request);begin
 if j.mode<>'byo' or j.state not in('approved','paused') or j.unknown_step is not null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Original approved BYO request required';end if;
 update platform_private.shop_upgrade_jobs set customer_token_hash=p_hash,customer_expires_at=now()+interval '2 hours',updated_at=now() where request_id=p_request;
end$$;
create function public.platform_upgrade_customer_claim(p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs:=platform_private.upgrade_fence(p_request);token uuid:=gen_random_uuid();begin
 if j.mode<>'byo' or j.customer_token_hash is distinct from p_hash or p_hash is null or j.customer_expires_at<now() or j.state not in('approved','paused') or j.unknown_step is not null then raise exception 'Customer clearance expired, changed or already executing' using errcode='42501';end if;
 if j.conditions->>'maintenance_required'='true' and now() not between (j.conditions->>'window_start')::timestamptz and (j.conditions->>'window_end')::timestamptz then raise exception 'Approved maintenance window is not active';end if;
 update platform_private.shop_upgrade_jobs set invocation=token,state='running',updated_at=now() where request_id=p_request;
 return to_jsonb(j)-array['customer_token_hash','session_id','actor_id']||jsonb_build_object('invocation',token,'state','running');
end$$;
create function public.platform_upgrade_command(p_request uuid,p_invocation uuid,p_kind text,p_args jsonb default '{}',p_customer_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs:=platform_private.upgrade_fence(p_request);step jsonb;v jsonb;begin
 if j.invocation is distinct from p_invocation or p_invocation is null or j.state not in('running','uncertain') then raise exception 'Upgrade execution ownership changed' using errcode='42501';end if;
 if j.mode='managed' and p_customer_hash is not null then raise exception 'Customer clearance cannot execute a Managed job' using errcode='42501';end if;
 if j.mode='byo' and (j.customer_token_hash is distinct from p_customer_hash or p_customer_hash is null or j.customer_expires_at<now()) then raise exception 'Customer clearance changed' using errcode='42501';end if;
 if j.conditions->>'maintenance_required'='true' and now() not between (j.conditions->>'window_start')::timestamptz and (j.conditions->>'window_end')::timestamptz then raise exception 'Approved maintenance window expired';end if;
 if p_kind='check' then return '{}';end if;
 if p_kind='dispatch' then
  if j.unknown_step is not null or j.state<>'running' then raise exception 'Original unknown provider outcome requires reconciliation';end if;
  select x into step from jsonb_array_elements(j.plan->'steps') x where x->>'name'=p_args->>'step';
  if step is null or j.steps->(p_args->>'step')->>'state'='passed' then raise exception 'Original pending approved step required';end if;
  if exists(select 1 from jsonb_array_elements(j.plan->'steps') with ordinality x(value,n) where n<(select n from jsonb_array_elements(j.plan->'steps') with ordinality y(value,n) where value->>'name'=p_args->>'step') and j.steps->(value->>'name')->>'state' is distinct from 'passed') then raise exception 'Earlier approved step is incomplete';end if;
  update platform_private.shop_upgrade_jobs set unknown_step=p_args->>'step',updated_at=now() where request_id=p_request;
 elsif p_kind='passed' then
  select x into step from jsonb_array_elements(j.plan->'steps') x where x->>'name'=j.unknown_step;
  if j.unknown_step is distinct from p_args->>'step' or step->>'sha256' is distinct from p_args->>'sha256' then raise exception 'Original step receipt identity conflict';end if;
  update platform_private.shop_upgrade_jobs set unknown_step=null,steps=steps||jsonb_build_object(j.unknown_step,jsonb_build_object('state','passed','sha256',p_args->>'sha256','origin',case when j.mode='managed' then 'provider-acknowledged' else 'customer-reported' end)),updated_at=now() where request_id=p_request;
 elsif p_kind='uncertain' then update platform_private.shop_upgrade_jobs set state='uncertain',updated_at=now() where request_id=p_request;
 elsif p_kind='pause' then
  if j.unknown_step is not null then raise exception 'Uncertain write cannot pause normally';end if;
  update platform_private.shop_upgrade_jobs set state='paused',invocation=null,updated_at=now() where request_id=p_request;
 elsif p_kind='finish' then
  v:=p_args->'verification';
  if j.unknown_step is not null or exists(select 1 from jsonb_array_elements(j.plan->'steps') x where j.steps->(x->>'name')->>'state' is distinct from 'passed') or v->>'components_verified' is distinct from 'true' or v->>'runtime_ready' is distinct from 'true' or octet_length(v::text)>4000 then raise exception 'All checkpoints and actual runtime verification required';end if;
  -- Customer reports never establish independently verified deployed source.
  update platform_private.shop_upgrade_jobs set state='verification_required',verification=v||jsonb_build_object('full_source_verified',false,'components_verified',j.mode='managed','components_reported',true,'evidence_strength',case when j.mode='managed' then 'provider-acknowledged-and-read-back' else 'customer-reported' end),invocation=null,updated_at=now() where request_id=p_request;
 else raise exception 'Unknown upgrade command';end if;
 return (select to_jsonb(u)-array['customer_token_hash','invocation','session_id','actor_id'] from platform_private.shop_upgrade_jobs u where request_id=p_request);
end$$;
create function public.platform_upgrade_reconcile(p_request uuid,p_step text,p_completed boolean,p_reference text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);j:=platform_private.upgrade_review_session(p_request);
 if j.actor_id<>auth.uid() or j.state not in('running','uncertain') or j.updated_at>now()-interval '10 minutes' or p_step is distinct from j.unknown_step or (p_step is null and p_completed) or coalesce(length(p_reference),0) not between 5 and 150 or coalesce(length(p_reason),0) not between 10 and 500 or p_completed is null then raise exception 'Wait ten minutes, verify the original provider outcome and record an audited reference/reason';end if;
 update platform_private.shop_upgrade_jobs set state='paused',invocation=null,unknown_step=null,steps=case when p_step is not null and p_completed then steps||jsonb_build_object(p_step,jsonb_build_object('state','passed','origin','operator-reported','reference',p_reference)) else steps end,updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,auth.uid(),'upgrade_outcome_reviewed',jsonb_build_object('request_id',p_request,'step',p_step,'completed',p_completed,'reference',p_reference,'reason',p_reason));
end$$;
create function public.platform_upgrade_close(p_request uuid,p_reference text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);j:=platform_private.upgrade_review_session(p_request);
 if j.actor_id<>auth.uid() or j.state not in('review','approved','verification_required') or j.unknown_step is not null or coalesce(length(p_reference),0) not between 5 and 150 or coalesce(length(p_reason),0) not between 10 and 500 then raise exception 'Only an idle review or verified components can be closed with an audited reason';end if;
 update platform_private.shop_upgrade_jobs set state=case when j.state='verification_required' then 'completed_reviewed' else 'cancelled' end,customer_token_hash=null,invocation=null,updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,auth.uid(),'upgrade_review_closed',jsonb_build_object('request_id',p_request,'reference',p_reference,'reason',p_reason,'full_source_verified',false));
end$$;
revoke all on function public.platform_upgrade_status(integer),public.platform_upgrade_prepare(integer,uuid,text,text),public.platform_upgrade_approve(uuid,text,jsonb),public.platform_upgrade_claim(uuid),public.platform_upgrade_reconcile(uuid,text,boolean,text,text),public.platform_upgrade_close(uuid,text,text) from public,anon,service_role;
grant execute on function public.platform_upgrade_status(integer),public.platform_upgrade_prepare(integer,uuid,text,text),public.platform_upgrade_approve(uuid,text,jsonb),public.platform_upgrade_claim(uuid),public.platform_upgrade_reconcile(uuid,text,boolean,text,text),public.platform_upgrade_close(uuid,text,text) to authenticated;
revoke all on function public.platform_upgrade_store_plan(uuid,jsonb,text),public.platform_upgrade_customer_token(uuid,text),public.platform_upgrade_customer_claim(uuid,text),public.platform_upgrade_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.platform_upgrade_store_plan(uuid,jsonb,text),public.platform_upgrade_customer_token(uuid,text),public.platform_upgrade_customer_claim(uuid,text),public.platform_upgrade_command(uuid,uuid,text,jsonb,text) to service_role;
commit;
