-- Route-owned reads and Managed invocation fencing. No Shop release changes.
create function public.platform_route_resource(p_resource text,p_client integer default null,p_offset integer default 0,p_search text default '',p_view text default 'current') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text:=platform_private.operator_role(); result jsonb:='{}'; cs jsonb; ids integer[]; q text; stats jsonb; usage jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 if p_offset is null or p_offset<0 or p_search is null or length(p_search)>120 or p_view is null or p_view not in ('current','historical','all') then raise exception 'Invalid page';end if;
 if p_resource in ('client-detail','client-finance','invoice','usage') and (p_client is null or p_client<1) then raise exception 'Exact resource identity required';end if;
 if p_resource not in ('overview','clients','client-detail','billing','client-finance','invoice','usage','team','settings') or p_resource in ('clients','client-detail','client-finance') and r='billing_person' or p_resource in ('billing','invoice','usage') and r='portfolio_manager' or p_resource='team' and r<>'master_admin' or p_view<>'current' and r<>'master_admin' then raise exception 'Resource not authorized' using errcode='42501';end if;
 if p_resource in ('overview','clients','client-detail','billing','client-finance') then
  usage:=public.platform_usage_summary();
  select coalesce(jsonb_agg(case when p_resource in ('clients','overview','billing') then platform_private.read_fields(platform_private.client_read(c,r),array['id','name','industry','plan','status','lifecycle_state','currency','currency_symbol','billing_policy','accounting_review_required','event_rate','inventory_rate','bill_billable','inventory_billable','grace_period_ends_at','shop_url','pairing_mode','infrastructure_state','onboarding_version','created_at']) else platform_private.client_read(c,r) end order by c.id desc),'[]'),coalesce(array_agg(c.id),'{}') into cs,ids from
   (select * from public.clients c where (p_client is null or c.id=p_client) and (r<>'portfolio_manager' or c.lifecycle_state<>'Archived') and
    (p_client is not null or p_view='all' or (p_view='historical')=(c.lifecycle_state='Archived')) and
    (p_client is not null or p_search='' or c.name ilike '%'||p_search||'%' or c.industry ilike '%'||p_search||'%') order by id desc limit 50 offset case when p_client is null then p_offset else 0 end)c;
  if p_client is not null and cardinality(ids)<>1 then raise exception 'Client unavailable' using errcode='42501';end if;
  result:=jsonb_build_object('clients',cs,'offset',p_offset,'has_more',cardinality(ids)=50,'usageSummary',
   (select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(usage)v where (v->>'client_id')::integer=any(ids)),
   'invoices',(select coalesce(jsonb_agg(platform_private.invoice_read(i,r)),'[]') from (select distinct on(client_id) * from public.billing_cycles where client_id=any(ids) order by client_id,id desc)i));
  result:=result||jsonb_build_object('latestInvoices',result->'invoices');
 end if;
 if p_resource='overview' then
  select jsonb_build_object('clients',count(*),'active',count(*) filter(where lifecycle_state='Active'),'suspended',count(*) filter(where lifecycle_state='Suspended'),'provisioning',count(*) filter(where lifecycle_state='Provisioning'),'historical',count(*) filter(where lifecycle_state='Archived'),'bill_count',(select coalesce(sum((v->>'billCount')::bigint),0) from jsonb_array_elements(usage)v)) into stats from public.clients where r<>'portfolio_manager' or lifecycle_state<>'Archived';
  if r<>'portfolio_manager' then stats:=stats||jsonb_build_object('revenue',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from (select coalesce(c.currency,'Unconfigured') currency,sum(greatest(i.total_due-coalesce(p.paid,0),0)) amount from public.billing_cycles i join public.clients c on c.id=i.client_id left join (select invoice_id,sum(amount) paid from public.payments group by invoice_id)p on p.invoice_id=i.id group by c.currency)v));end if;
  result:=result||jsonb_build_object('overview',stats,'openTickets',(public.platform_dashboard_summary()->'open_tickets'));
 end if;
 if p_resource in ('billing','client-finance') then
  result:=result||jsonb_build_object('invoices',(select coalesce(jsonb_agg(platform_private.invoice_read(i,r) order by i.id desc),'[]') from (select * from public.billing_cycles where client_id=any(ids) order by id desc limit 25 offset case when p_resource='client-finance' then p_offset else 0 end)i),
   'payments',(select coalesce(jsonb_agg(jsonb_build_object('invoice_id',invoice_id,'client_id',client_id,'amount',amount)),'[]') from (select invoice_id,client_id,sum(amount) amount from public.payments where invoice_id in (select id from public.billing_cycles where client_id=any(ids) order by id desc limit 25 offset case when p_resource='client-finance' then p_offset else 0 end) group by invoice_id,client_id)p));
 end if;
 if p_resource='usage' then
  result:=jsonb_build_object('usage',(select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(u),array['id','recorded_at','client_id','module_type','token_count','rate_at_log','is_invoiced','billing_cycle_id'])),'[]') from (select * from public.usage_logs where client_id=p_client and billing_ownership<>'excluded' and module_type in ('BILL','INVENTORY') order by id desc limit 100 offset p_offset)u),'offset',p_offset);
 end if;
 if p_resource='invoice' then
  if not exists(select 1 from public.billing_cycles where id=p_client) then raise exception 'Invoice unavailable';end if;
  result:=jsonb_build_object('invoice',(select platform_private.invoice_read(i,r) from public.billing_cycles i where id=p_client),
   'payments',(select coalesce(jsonb_agg(platform_private.payment_read(p)),'[]') from public.payments p where invoice_id=p_client),
   'usage',(select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(u),array['id','recorded_at','client_id','module_type','token_count','rate_at_log','is_invoiced','billing_cycle_id'])),'[]') from public.usage_logs u where billing_cycle_id=p_client and billing_ownership<>'excluded' and module_type in ('BILL','INVENTORY')));
 end if;
 if p_resource='team' then
  result:=jsonb_build_object('platformUsers',(select coalesce(jsonb_agg(to_jsonb(u)),'[]') from (select id,auth_user_id,name,email,role,status,created_at,suspended_from from public.platform_users where p_search='' or name ilike '%'||p_search||'%' or email ilike '%'||p_search||'%' or replace(role,'_',' ') ilike '%'||p_search||'%' order by id limit 100 offset p_offset)u),
   'teamArchive',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select * from public.platform_team_archive where p_search='' or name ilike '%'||p_search||'%' or email ilike '%'||p_search||'%' or replace(role,'_',' ') ilike '%'||p_search||'%' order by deleted_at desc,id limit 100 offset p_offset)a),
   'has_more',((select count(*)=100 from (select id from public.platform_users where p_search='' or name ilike '%'||p_search||'%' or email ilike '%'||p_search||'%' or replace(role,'_',' ') ilike '%'||p_search||'%' order by id limit 100 offset p_offset)q) or (select count(*)=100 from (select id from public.platform_team_archive where p_search='' or name ilike '%'||p_search||'%' or email ilike '%'||p_search||'%' or replace(role,'_',' ') ilike '%'||p_search||'%' order by deleted_at desc,id limit 100 offset p_offset)q)),'offset',p_offset,'teamOperations',public.platform_team_history()->'operations');
 end if;
 return jsonb_build_object('auth_user_id',auth.uid(),'session_id',auth.jwt()->>'session_id','role',r,'data',result);
end $$;
revoke all on function public.platform_route_resource(text,integer,integer,text,text) from public,anon,service_role;
grant execute on function public.platform_route_resource(text,integer,integer,text,text) to authenticated;

alter table platform_private.provision_jobs drop constraint provision_jobs_state_check;
alter table platform_private.provision_jobs add constraint provision_jobs_state_check check(state in ('running','paused','retry','complete'));
create table platform_private.managed_invocations(request_id uuid primary key references platform_private.provision_jobs(request_id),token uuid not null,session_id uuid not null,unknown_step text,started_at timestamptz not null default now());
alter table platform_private.managed_invocations enable row level security;
revoke all on platform_private.managed_invocations from public,anon,authenticated,service_role;
-- Old callers cannot bypass ownership for Managed actions.
alter function public.platform_provision_begin(integer,uuid,text,jsonb) rename to platform_provision_begin_unfenced;
alter function public.platform_provision_begin_unfenced(integer,uuid,text,jsonb) set schema platform_private;
revoke all on function platform_private.platform_provision_begin_unfenced(integer,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.platform_provision_begin(p_client integer,p_request uuid,p_action text,p_params jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if p_action in ('managed-setup','rotate-turnstile') then raise exception 'Bounded Managed provisioner required';end if;return platform_private.platform_provision_begin_unfenced(p_client,p_request,p_action,p_params);end $$;
revoke all on function public.platform_provision_begin(integer,uuid,text,jsonb) from public,anon;
grant execute on function public.platform_provision_begin(integer,uuid,text,jsonb) to authenticated;
create function public.platform_managed_begin(p_client integer,p_request uuid,p_action text,p_params jsonb,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform platform_private.require_role(array['master_admin']);
 if p_action not in ('managed-setup','rotate-turnstile') or p_token is null then raise exception 'Managed invocation required';end if;
 perform 1 from public.clients where id=p_client for update;
 result:=platform_private.platform_provision_begin_unfenced(p_client,p_request,p_action,p_params);
 if coalesce((result->>'complete')::boolean,false) then return result;end if;
 insert into platform_private.managed_invocations(request_id,token,session_id) values(p_request,p_token,platform_private.caller_session_id()) on conflict(request_id) do update set token=excluded.token,session_id=excluded.session_id,started_at=now();
 return result;
end $$;
revoke all on function public.platform_managed_begin(integer,uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.platform_managed_begin(integer,uuid,text,jsonb,uuid) to authenticated;
create function platform_private.managed_fence(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from platform_private.provision_jobs where request_id=p_request and action in ('managed-setup','rotate-turnstile')) and not exists(select 1 from platform_private.managed_invocations i join platform_private.provision_jobs j using(request_id) where i.request_id=p_request and j.state='running' and i.token::text=current_setting('retrasell.managed_token',true)) then raise exception 'Managed invocation ownership changed' using errcode='42501';end if;
end $$;
revoke all on function platform_private.managed_fence(uuid) from public,anon,authenticated,service_role;
-- Preserve canonical stage/onboarding/pin logic behind the fence, including all
-- prior checksum, destination, owner, lifecycle and single-operation protections.
do $wrap$ declare name text;args text;call_args text;begin
 for name,args,call_args in values
 ('platform_managed_stage','p_request uuid,p_name text,p_state text,p_checksum text default null','p_request,p_name,p_state,p_checksum'),
 ('platform_managed_stage_v1','p_request uuid,p_name text,p_state text,p_checksum text default null','p_request,p_name,p_state,p_checksum'),
 ('platform_onboarding_step','p_request uuid,p_step text,p_data jsonb default ''{}''','p_request,p_step,p_data'),
 ('platform_onboarding_step_v1','p_request uuid,p_step text,p_data jsonb default ''{}''','p_request,p_step,p_data'),
 ('platform_provision_step','p_request uuid,p_step text,p_data jsonb','p_request,p_step,p_data'),
 ('platform_managed_release_pin','p_request uuid,p_release text,p_sha256 text','p_request,p_release,p_sha256') loop
  execute format('alter function public.%I(%s) rename to %I',name,case when name like 'platform_managed_stage%' then 'uuid,text,text,text' when name='platform_managed_release_pin' then 'uuid,text,text' else 'uuid,text,jsonb' end,name||'_unfenced');
  execute format('alter function public.%I set schema platform_private',name||'_unfenced');
  execute format('revoke all on function platform_private.%I from public,anon,authenticated,service_role',name||'_unfenced');
  execute format('create function public.%I(%s) returns jsonb language plpgsql security definer set search_path='''' as $body$ begin perform platform_private.managed_fence(p_request);return platform_private.%I(%s);end $body$',name,args,name||'_unfenced',call_args);
  execute format('revoke all on function public.%I from public,anon,authenticated',name);
  execute format('grant execute on function public.%I to service_role',name);
 end loop;
end $wrap$;
create function public.platform_managed_command(p_request uuid,p_token uuid,p_kind text,p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare i platform_private.managed_invocations;j platform_private.provision_jobs; result jsonb;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned') for update;
 if not found then raise exception 'Retired target';end if;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 select * into strict i from platform_private.managed_invocations where request_id=p_request for update;
 if i.token is distinct from p_token or p_token is null or j.state<>'running' then raise exception 'Managed invocation ownership changed' using errcode='42501';end if;
 perform platform_private.team_master(j.actor_id);
 if not platform_private.session_live(j.actor_id,i.session_id) then raise exception 'Master session revoked' using errcode='42501';end if;
 perform set_config('retrasell.managed_token',p_token::text,true);
 if p_kind='check' then return jsonb_build_object('unknown_step',i.unknown_step);end if;
 if p_kind='dispatch' then
  if i.unknown_step is not null then raise exception 'Previous write is uncertain';end if;
  update platform_private.managed_invocations set unknown_step=p_args->>'step' where request_id=p_request;return '{}';
 end if;
 if p_kind='verified-stage' then
  if i.unknown_step is distinct from p_args->>'p_name' then raise exception 'Dispatch identity changed';end if;
  update platform_private.managed_invocations set unknown_step=null where request_id=p_request;
  return public.platform_managed_stage(p_request,p_args->>'p_name','passed',p_args->>'p_checksum');
 end if;
 if p_kind='reconciled' then
  if i.unknown_step not like 'migration:%' then raise exception 'Authoritative provider review required';end if;
  update platform_private.managed_invocations set unknown_step=null where request_id=p_request;return '{}';
 end if;
 if p_kind='pause' then
  if i.unknown_step is not null then raise exception 'Unknown provider write cannot pause';end if;
  update platform_private.provision_jobs set state='paused',error=null,updated_at=now() where request_id=p_request;return jsonb_build_object('state','paused','request_id',p_request);
 end if;
 if p_kind='stage' then
  if i.unknown_step is not null then raise exception 'Unknown write requires reconciliation';end if;
  return public.platform_managed_stage(p_request,p_args->>'p_name',p_args->>'p_state',p_args->>'p_checksum');
 elsif p_kind='onboarding' then return public.platform_onboarding_step(p_request,p_args->>'p_step',coalesce(p_args->'p_data','{}'));
 elsif p_kind='pin' then return public.platform_managed_release_pin(p_request,p_args->>'p_release',p_args->>'p_sha256');
 elsif p_kind='provision' then
  if p_args->>'p_step'='complete' and (i.unknown_step is not null or not exists(select 1 from platform_private.provision_stages where request_id=p_request and name=case when j.action='managed-setup' then 'preflight' else 'turnstile' end and state='passed')) then raise exception 'Verified final stage required';end if;
  return public.platform_provision_step(p_request,p_args->>'p_step',coalesce(p_args->'p_data','{}'));
 end if;
 raise exception 'Unknown Managed command';
end $$;
revoke all on function public.platform_managed_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_managed_command(uuid,uuid,text,jsonb) to service_role;

-- Exceptional provider acknowledgments require an explicit authenticated owner
-- attestation after the existing interruption safety delay; never automatic replay.
create function public.platform_managed_confirm(p_request uuid,p_stage text,p_reference text,p_reason text,p_completed boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs;i platform_private.managed_invocations;
begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 perform 1 from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 select * into strict i from platform_private.managed_invocations where request_id=p_request for update;
 if (j.state='running' or i.unknown_step is not null) and j.updated_at>now()-interval '10 minutes' then raise exception 'Provisioner may still be running; wait ten minutes';end if;
 if j.state not in ('running','retry') or i.unknown_step is distinct from p_stage or p_stage is null or p_completed is null or coalesce(length(p_reference),0) not between 5 and 150 or coalesce(length(p_reason),0) not between 10 and 500 then raise exception 'Original unknown stage, authoritative provider reference and audited reason required';end if;
 update platform_private.provision_stages set state=case when p_completed then 'passed' else 'failed' end,updated_at=now() where request_id=p_request and name=p_stage;
 if not found then raise exception 'Original stage unavailable';end if;
 update platform_private.managed_invocations set unknown_step=null where request_id=p_request;
 update platform_private.provision_jobs set state='paused',error=null,updated_at=now() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail)values(j.client_id,auth.uid(),'managed_provider_completion_attested',jsonb_build_object('request_id',p_request,'stage',p_stage,'reference',p_reference,'reason',p_reason,'kind','operator-reported','completed',p_completed));
end $$;
revoke all on function public.platform_managed_confirm(uuid,text,text,text,boolean) from public,anon,service_role;
grant execute on function public.platform_managed_confirm(uuid,text,text,text,boolean) to authenticated;

-- Existing explicit close must not discard an unresolved provider-write fence.
alter function public.platform_provision_reconcile(integer,uuid,text,text) rename to platform_provision_reconcile_unfenced;
alter function public.platform_provision_reconcile_unfenced(integer,uuid,text,text) set schema platform_private;
revoke all on function platform_private.platform_provision_reconcile_unfenced(integer,uuid,text,text) from public,anon,authenticated,service_role;
create function public.platform_provision_reconcile(p_client integer,p_request uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin']);
 perform 1 from public.clients where id=p_client for update;
 if p_action='close' and exists(select 1 from platform_private.managed_invocations where request_id=p_request and unknown_step is not null) then raise exception 'Resolve original provider outcome before closing';end if;
 perform platform_private.platform_provision_reconcile_unfenced(p_client,p_request,p_action,p_reason);
end $$;
revoke all on function public.platform_provision_reconcile(integer,uuid,text,text) from public,anon,service_role;
grant execute on function public.platform_provision_reconcile(integer,uuid,text,text) to authenticated;
