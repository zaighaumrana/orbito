-- Forward-only employee read isolation. No authored transaction boundaries:
-- CLI 2.120.0 commits this batch together with its genuine history INSERT.
-- Canonical operator_role/session/cutoff logic from migration 13 is unchanged.

-- The API SQL role is shared by all employees: row policies cannot hide columns.
-- Raw source rows are Master-only; employee reads use fixed projections below.
do $$ declare t text; begin
 foreach t in array array['clients','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log',
  'platform_config','platform_users','support_tickets','bridge_sources','bridge_events','bridge_failures',
  'billing_projections','paper_requests','paper_supplies','operator_audit','config_jobs'] loop
  execute format('alter policy operator_read on public.%I using ((select platform_private.operator_role()) = ''master_admin'')',t);
  -- A second permissive policy cannot OR its way around this read ceiling.
  execute format('create policy platform_master_read_ceiling on public.%I as restrictive for select to public using ((select platform_private.operator_role()) = ''master_admin'')',t);
 end loop;
end $$;
-- Preserve existing Master direct writes. Manager writes move to the bounded RPC.
alter policy client_create on public.clients with check ((select platform_private.operator_role())='master_admin');
alter policy client_edit on public.clients using ((select platform_private.operator_role())='master_admin') with check ((select platform_private.operator_role())='master_admin');
-- Manager support resolution uses the bounded RPC below; no raw-table exception.

-- This frontend has no Postgres-change subscriptions. Remove application tables
-- from the publication: DELETE events cannot be made private by SELECT RLS alone.
do $$ declare t record;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables)
  or exists(select 1 from pg_publication_namespace pn join pg_publication p on p.oid=pn.pnpubid join pg_namespace n on n.oid=pn.pnnspid where p.pubname='supabase_realtime' and n.nspname in ('public','platform_private')) then
  raise exception 'Realtime publication requires reviewed explicit table membership';
 end if;
 for t in select n.nspname,c.relname from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid
  join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
  where p.pubname='supabase_realtime' and (n.nspname='platform_private' or n.nspname='public' and c.relname in
   ('clients','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log','platform_config','platform_users',
    'support_tickets','bridge_sources','bridge_events','bridge_failures','billing_projections','paper_requests','paper_supplies','operator_audit','config_jobs','platform_team_archive')) loop
  execute format('alter publication supabase_realtime drop table %I.%I',t.nspname,t.relname);
 end loop;
end $$;

create function platform_private.read_fields(p_row jsonb,p_fields text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb) from unnest(p_fields) k
$$;
revoke all on function platform_private.read_fields(jsonb,text[]) from public,anon,authenticated,service_role;

create function platform_private.client_read(p_client public.clients,p_role text) returns jsonb
language sql immutable set search_path='' as $$
 select case when p_role='master_admin' then to_jsonb(p_client) else platform_private.read_fields(to_jsonb(p_client),
  case when p_role='portfolio_manager' then array['id','name','industry','plan','status','lifecycle_state','infrastructure_state',
   'shop_url','created_at','onboarding_version','pairing_mode','currency','currency_symbol','billing_policy','accounting_review_required',
   'event_rate','inventory_rate','bill_billable','inventory_billable','grace_period_ends_at','repair_module_enabled',
   'inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','paper_resupply_enabled','config_synced_at']
  else array['id','name','plan','status','lifecycle_state','currency','currency_symbol','billing_policy','accounting_review_required',
   'event_rate','inventory_rate','bill_billable','inventory_billable','grace_period_ends_at'] end) end
$$;
revoke all on function platform_private.client_read(public.clients,text) from public,anon,authenticated,service_role;

create function platform_private.invoice_read(p_invoice public.billing_cycles,p_role text) returns jsonb
language sql immutable set search_path='' as $$
 select case when p_role='master_admin' then to_jsonb(p_invoice) else platform_private.read_fields(to_jsonb(p_invoice),
  case when p_role='portfolio_manager' then array['id','client_id','period_start','period_end','created_at','total_due','status','payment_status']
  else array['id','client_id','period_start','period_end','created_at','fixed_fee','receipt_count','per_receipt_rate','total_due','status','paid_at',
   'ticket_count','per_ticket_rate','item_count','per_item_rate','invoice_date','due_date','carried_forward_balance','current_charges',
   'remaining_balance','payment_status','bill_count','event_rate','inventory_count','inventory_rate','bill_charges','inventory_charges'] end) end
$$;
revoke all on function platform_private.invoice_read(public.billing_cycles,text) from public,anon,authenticated,service_role;

create function platform_private.payment_read(p_payment public.payments) returns jsonb
language sql immutable set search_path='' as $$
 select platform_private.read_fields(to_jsonb(p_payment),array['id','invoice_id','client_id','amount','payment_method','payment_date','notes','created_at'])
$$;
revoke all on function platform_private.payment_read(public.payments) from public,anon,authenticated,service_role;

-- Paginated, explicit datasets. Role comes only from the live canonical authority,
-- never a requested role, JWT user metadata or an editable frontend value.
create function public.platform_read_page(p_dataset text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text=platform_private.operator_role(); result jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 if p_offset is null or p_offset<0 or p_dataset is null then raise exception 'Invalid read request' using errcode='22023'; end if;
 if r='portfolio_manager' and p_dataset not in ('clients','support','invoices','account')
  or r='billing_person' and p_dataset not in ('clients','usage','invoices','payments','credits','rateLog','account')
  or p_dataset not in ('clients','support','usage','invoices','payments','credits','rateLog','account') then
  raise exception 'Dataset not authorized' using errcode='42501';
 end if;
 case p_dataset
 when 'clients' then select coalesce(jsonb_agg(platform_private.client_read(c,r) order by c.id desc),'[]') into result
  from (select * from public.clients where r<>'portfolio_manager' or lifecycle_state<>'Archived' order by id desc limit 1000 offset p_offset) c;
 when 'support' then select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(s),array['id','client_id','client_name','subject','message','status','created_at','resolved_at']) order by s.id desc),'[]') into result
  from (select * from public.support_tickets order by id desc limit 1000 offset p_offset) s;
 when 'invoices' then select coalesce(jsonb_agg(platform_private.invoice_read(i,r) order by i.id desc),'[]') into result
  from (select i.* from public.billing_cycles i where r<>'portfolio_manager' or exists(select 1 from public.clients c where c.id=i.client_id and c.lifecycle_state<>'Archived') order by i.id desc limit 1000 offset p_offset) i;
 when 'usage' then select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(u),array['id','recorded_at','client_id','module_type','token_count','rate_at_log','is_invoiced','billing_cycle_id']) order by u.id desc),'[]') into result
  from (select * from public.usage_logs where module_type in ('BILL','INVENTORY') and billing_ownership<>'excluded' order by id desc limit 1000 offset p_offset) u;
 when 'payments' then select coalesce(jsonb_agg(platform_private.payment_read(p) order by p.id desc),'[]') into result
  from (select * from public.payments order by id desc limit 1000 offset p_offset) p;
 when 'credits' then select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(c),array['id','client_id','source_invoice_id','amount_outstanding','is_cleared','cleared_at','created_at']) order by c.id desc),'[]') into result
  from (select * from public.client_credit order by id desc limit 1000 offset p_offset) c;
 when 'rateLog' then select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(l),array['id','client_id','module_type','old_rate','new_rate','changed_at']) order by l.id desc),'[]') into result
  from (select * from public.pricing_rate_log order by id desc limit 1000 offset p_offset) l;
 when 'account' then select coalesce(jsonb_agg(platform_private.read_fields(to_jsonb(u),array['id','auth_user_id','name','email','role','status','created_at'])),'[]') into result
  from public.platform_users u where u.auth_user_id=auth.uid() and p_offset=0;
 end case;
 return jsonb_build_object('role',r,'auth_user_id',auth.uid(),'session_id',platform_private.caller_session_id(),'rows',result);
end $$;
revoke all on function public.platform_read_page(text,integer) from public,anon;
grant execute on function public.platform_read_page(text,integer) to authenticated;

create function public.platform_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 return jsonb_build_object('open_tickets',(select count(*) from public.support_tickets where status='Open'));
end $$;
revoke all on function public.platform_dashboard_summary() from public,anon;
grant execute on function public.platform_dashboard_summary() to authenticated;

-- Summary-only access is deliberate. Archived operational records are Master-only;
-- Billing retains minimal identifiers necessary for retained financial ledgers.
create or replace function public.platform_usage_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text=platform_private.operator_role(); result jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 select coalesce(jsonb_agg(s),'[]') into result from jsonb_array_elements(platform_private.usage_summary()) s
 where r<>'portfolio_manager' or exists(select 1 from public.clients c where c.id=(s->>'client_id')::integer and c.lifecycle_state<>'Archived');
 return result;
end $$;

-- Master gets the prior complete response. Manager gets operational facts only:
-- no source bindings, error payloads, config/audit history or provider credentials.
alter function platform_private.client_operations(integer) rename to client_operations_full;
create function platform_private.client_operations(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text=platform_private.operator_role(); full_result jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if r='master_admin' then return platform_private.client_operations_full(p_client); end if;
 perform 1 from public.clients where id=p_client and lifecycle_state<>'Archived';
 if not found then raise exception 'Operational client unavailable' using errcode='42501'; end if;
 full_result=platform_private.client_operations_full(p_client);
 return jsonb_build_object('client',p_client,
  'source',platform_private.read_fields(full_result->'source',array['enabled','last_received_at']),
  'projection',jsonb_build_object('payload',platform_private.read_fields(full_result->'projection'->'payload',array['outstanding_total'])),
  'requests',(select coalesce(jsonb_agg(platform_private.read_fields(v,array['request_id','client_id','status','requested_at','updated_at','sync_version'])),'[]') from jsonb_array_elements(full_result->'requests') v),
  'supplies',(select coalesce(jsonb_agg(platform_private.read_fields(v,array['delivery_id','client_id','request_id','reference','roll_count','usable_length_mm','paper_width_mm','delivered_at','status'])),'[]') from jsonb_array_elements(full_result->'supplies') v),
  'supplied_mm',full_result->'supplied_mm','thermal',full_result->'thermal','thermal_periods',full_result->'thermal_periods');
end $$;
create or replace function public.platform_client_operations(p_client integer) returns jsonb
language sql stable security definer set search_path='' as $$ select platform_private.client_operations(p_client) $$;
grant execute on function platform_private.client_operations(integer) to service_role;

-- Keep prior complete provisioning/recovery reads for Master only. A separate
-- Manager status contains the minimum unresolved-request facts needed to block
-- overlapping legitimate config writes; it is not an audit/history endpoint.
create or replace function public.platform_provision_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin perform platform_private.require_role(array['master_admin']);return platform_private.provision_status(p_client);end $$;
create or replace function public.platform_overhaul_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text=platform_private.operator_role();
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if r='portfolio_manager' then
  if not exists(select 1 from public.clients where id=p_client and lifecycle_state<>'Archived') then raise exception 'Operational client unavailable' using errcode='42501'; end if;
  return jsonb_build_object('config_jobs',(select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'state',state)),'[]') from public.config_jobs where client_id=p_client and state in ('sending','uncertain')));
 end if;
 return jsonb_build_object('config_jobs',(select coalesce(jsonb_agg(to_jsonb(j) order by created_at desc),'[]') from public.config_jobs j where client_id=p_client and state in ('sending','uncertain')),
 'stages',(select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at),'[]') from platform_private.provision_stages s where request_id=(select request_id from platform_private.provision_jobs where client_id=p_client order by created_at desc limit 1)),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select actor_id,action,detail,created_at from public.operator_audit where client_id=p_client order by id desc limit 30) a));
end $$;

-- Each public invoker wrapper becomes an explicit definer boundary before private
-- helper EXECUTE is closed. Its existing internal live role/target checks remain.
alter function public.platform_paper_action(integer,uuid,bigint,text,jsonb) security definer;
alter function public.platform_set_paper(integer,boolean) security definer;
alter function public.platform_set_rates(integer,numeric,numeric,boolean) security definer;
alter function public.platform_set_currency(integer,text) security definer;
alter function public.platform_provision_begin(integer,uuid,text,jsonb) security definer;
alter function public.platform_provision_cancel(integer,uuid) security definer;
create or replace function public.platform_begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j jsonb;
begin
 j=platform_private.begin_config(p_client,p_request,p_changes);
 return platform_private.read_fields(j,array['request_id','client_id','changes','state','dispatch']);
end $$;
create or replace function public.platform_generate_invoice(p_client integer,p_request uuid) returns public.billing_cycles
language plpgsql security definer set search_path='' as $$
declare i public.billing_cycles;
begin
 i=platform_private.generate_invoice(p_client,p_request);
 return jsonb_populate_record(null::public.billing_cycles,platform_private.invoice_read(i,platform_private.operator_role()));
end $$;
create or replace function public.platform_record_payment(p_invoice bigint,p_amount numeric,p_method text,p_date date,p_notes text,p_request uuid) returns public.payments
language plpgsql security definer set search_path='' as $$
declare p public.payments;
begin
 p=platform_private.record_payment(p_invoice,p_amount,p_method,p_date,p_notes,p_request);
 if platform_private.operator_role()='master_admin' then return p;end if;
 return jsonb_populate_record(null::public.payments,platform_private.payment_read(p));
end $$;

-- Bounded replacement for Manager direct client writes/RETURNING. No arbitrary
-- column assignment; existing lifecycle/default/binding triggers still run.
create function public.platform_save_client(p_client integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text=platform_private.operator_role(); c public.clients;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid client fields';end if;
 if p_client is null then
  if p_data-array['owner_name','owner_email','pairing_mode','ems_track_breaks','paper_resupply_enabled','name','industry','plan','currency','currency_symbol','event_rate','inventory_rate','inventory_billable','supabase_url','shop_url']<>'{}'::jsonb then raise exception 'Unsupported client fields' using errcode='42501';end if;
  insert into public.clients(owner_name,owner_email,onboarding_version,pairing_mode,ems_track_breaks,paper_resupply_enabled,name,industry,plan,status,currency,currency_symbol,event_rate,inventory_rate,bill_billable,inventory_billable,supabase_url,supabase_anon,shop_url)
  values(p_data->>'owner_name',p_data->>'owner_email',2,coalesce(p_data->>'pairing_mode','managed'),coalesce((p_data->>'ems_track_breaks')::boolean,false),coalesce((p_data->>'paper_resupply_enabled')::boolean,false),p_data->>'name',coalesce(p_data->>'industry','Retail'),coalesce(p_data->>'plan','Basic'),'Active',p_data->>'currency',p_data->>'currency_symbol',coalesce((p_data->>'event_rate')::numeric,0),coalesce((p_data->>'inventory_rate')::numeric,0),true,coalesce((p_data->>'inventory_billable')::boolean,false),p_data->>'supabase_url','',coalesce(p_data->>'shop_url','')) returning * into c;
 else
  if p_data-array['name','industry','plan','shop_url','pairing_mode']<>'{}'::jsonb then raise exception 'Unsupported client fields' using errcode='42501';end if;
  select * into c from public.clients where id=p_client and (r='master_admin' or lifecycle_state<>'Archived') for update;
  if not found then raise exception 'Operational client unavailable' using errcode='42501';end if;
  update public.clients set name=coalesce(p_data->>'name',name),industry=coalesce(p_data->>'industry',industry),plan=coalesce(p_data->>'plan',plan),shop_url=coalesce(p_data->>'shop_url',shop_url),pairing_mode=coalesce(p_data->>'pairing_mode',pairing_mode) where id=p_client returning * into c;
 end if;
 return platform_private.client_read(c,r);
end $$;
revoke all on function public.platform_save_client(integer,jsonb) from public,anon;
grant execute on function public.platform_save_client(integer,jsonb) to authenticated;

create function public.platform_resolve_ticket(p_ticket integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 update public.support_tickets set status='Resolved',resolved_at=clock_timestamp() where id=p_ticket;
 if not found then raise exception 'Support ticket unavailable';end if;
end $$;
revoke all on function public.platform_resolve_ticket(integer) from public,anon;
grant execute on function public.platform_resolve_ticket(integer) to authenticated;

-- Private helpers are not an alternate RPC/read surface even if a deployment
-- accidentally exposes platform_private. Service/owner calls retain prior rights.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='platform_private' and p.proname not in ('operator_role','require_role') loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;

-- Detection supplies only this caller's live role. Role edits do not revoke their
-- live session; Deactivate/Reactivate cutoffs retain the migration-13 contract.
create or replace function public.platform_session_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('authorized',r is not null,'auth_user_id',auth.uid(),'role',r,'session_id',platform_private.caller_session_id())
 from (select platform_private.operator_role() r) identity
$$;

-- No employee Storage/private-channel workflow exists in this Platform. Apply a
-- restrictive Master-only ceiling alongside provider/user policies, without
-- editing provider grants or policies. Fail if present managed objects lack RLS.
-- Hosted supautils allows postgres CREATE POLICY without managed-owner membership.
-- Run as the migration caller; missing policy permission must abort the migration.
do $$ declare t record;begin
 if to_regclass('storage.objects') is null or to_regclass('realtime.messages') is null then
  raise exception 'Managed Storage/Realtime prerequisites missing; run reviewed preflight';
 end if;
 for t in select c.oid::regclass relation,c.relrowsecurity from pg_class c
  where c.oid in (to_regclass('storage.objects'),to_regclass('realtime.messages')) loop
  if not t.relrowsecurity then raise exception 'Managed Storage/Realtime RLS prerequisite is missing';end if;
  execute format('create policy platform_master_read_ceiling on %s as restrictive for all to authenticated using ((public.platform_session_status()->>''role'')=''master_admin'') with check ((public.platform_session_status()->>''role'')=''master_admin'')',t.relation);
 end loop;
end $$;
