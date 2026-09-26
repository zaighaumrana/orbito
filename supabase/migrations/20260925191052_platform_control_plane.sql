-- Additive control plane. Apply only after the documented coordinated legacy cutover.
create schema if not exists platform_private;
revoke all on schema platform_private from public, anon;
grant usage on schema platform_private to authenticated, service_role;
create function platform_private.operator_role() returns text
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from auth.users where id=auth.uid() and email='platformadmin@retailos.internal')
 then 'master_admin' else (select role from public.platform_users where auth_user_id=auth.uid() and status='Active' limit 1) end
$$;
create function platform_private.require_role(p_roles text[]) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(platform_private.operator_role()=any(p_roles),false) then
  raise exception 'Operator not authorized' using errcode='42501';
 end if;
end $$;

alter table public.clients
 add column repair_module_enabled boolean,
 add column inventory_module_enabled boolean,
 add column technician_module_enabled boolean,
 add column paper_resupply_enabled boolean not null default false,
 add column currency text check(currency ~ '^[A-Z]{3}$'),
 add column billing_policy text not null default 'usage-v1' check(billing_policy='usage-v1'),
 add column accounting_review_required boolean not null default false,
 add column pricing_version bigint not null default 1,
 add column config_synced_at timestamptz;
alter table public.clients alter column billing_model set default 'usage';
-- Do not guess how double-carried history should be allocated or refunded.
update public.clients c set accounting_review_required=true
 where exists(select 1 from public.billing_cycles i where i.client_id=c.id and i.carried_forward_balance>0)
 or exists(select 1 from public.client_credit cr where cr.client_id=c.id and not cr.is_cleared);
create table public.bridge_sources (
 source_id uuid primary key, client_id integer not null unique references public.clients(id),
 client_binding text not null check(length(client_binding) between 1 and 200),
 enabled boolean not null default false,
 usage_from_sequence bigint check(usage_from_sequence>0), cutover_note text,
 last_received_at timestamptz, last_error text,
 check(usage_from_sequence is null or nullif(btrim(cutover_note),'') is not null)
);
create table platform_private.source_credentials (
 source_id uuid primary key references public.bridge_sources(source_id),
 secret_sha256 text not null unique check(secret_sha256 ~ '^[a-f0-9]{64}$')
);
create table public.bridge_events (
 event_id uuid primary key, source_id uuid not null references public.bridge_sources(source_id),
 source_sequence bigint not null check(source_sequence>0), client_id integer not null references public.clients(id),
 kind text not null check(kind in ('usage','thermal','resupply')), operation text not null, operation_id uuid not null,
 envelope jsonb not null, received_at timestamptz not null default clock_timestamp(),
 unique(source_id,source_sequence), unique(source_id,kind,operation,operation_id)
);
create table public.bridge_failures (
 id bigint generated always as identity primary key, source_id uuid not null references public.bridge_sources(source_id),
 event_id text, reason text not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table public.usage_logs
 add column event_id uuid unique references public.bridge_events(event_id), add column source_sequence bigint,
 add column occurred_at timestamptz, add column schema_version integer, add column metadata jsonb,
 add column billing_ownership text not null default 'legacy' check(billing_ownership in ('legacy','bridge','excluded')),
 add column pricing_version bigint;
create index usage_unbilled_client on public.usage_logs(client_id,id) where not is_invoiced and module_type in ('BILL','INVENTORY');
create index thermal_client_period on public.usage_logs(client_id,recorded_at) where module_type='THERMAL';
create index bridge_events_client on public.bridge_events(client_id,received_at);
create index bridge_failures_source on public.bridge_failures(source_id,recorded_at desc);
create index payments_invoice on public.payments(invoice_id);
create index invoices_client on public.billing_cycles(client_id,id);
alter table public.billing_cycles add column request_id uuid unique, add column policy_snapshot jsonb, add column usage_cutoff bigint;
alter table public.payments add column request_id uuid unique;
create table public.billing_projections (
 client_id integer primary key references public.clients(id), sync_version bigint not null check(sync_version>0),
 payload jsonb not null, updated_at timestamptz not null default clock_timestamp()
);
create table public.paper_requests (
 request_id uuid primary key, client_id integer not null references public.clients(id), source_id uuid not null references public.bridge_sources(source_id),
 requested_at timestamptz not null, status text not null default 'requested' check(status in ('requested','fulfilled','rejected','cancelled')),
 sync_version bigint not null default 1, updated_at timestamptz not null default clock_timestamp()
);
create unique index paper_one_active on public.paper_requests(client_id) where status='requested';
create table public.paper_supplies (
 delivery_id uuid primary key, client_id integer not null references public.clients(id), request_id uuid references public.paper_requests(request_id),
 reference text not null, roll_count integer not null check(roll_count>0), usable_length_mm integer not null check(usable_length_mm>0),
 paper_width_mm integer not null check(paper_width_mm>0), delivered_at timestamptz not null,
 status text not null default 'delivered' check(status='delivered'), recorded_by uuid not null, recorded_at timestamptz not null default clock_timestamp()
);
create index paper_supplies_client on public.paper_supplies(client_id,delivered_at);
create table public.operator_audit (
 id bigint generated always as identity primary key, client_id integer references public.clients(id), actor_id uuid,
 action text not null, detail jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.config_jobs (
 request_id uuid primary key, client_id integer not null references public.clients(id), actor_id uuid not null, changes jsonb not null,
 state text not null default 'sending' check(state in ('sending','applied','uncertain','failed')),
 result jsonb, created_at timestamptz not null default clock_timestamp(), finished_at timestamptz
);
create unique index config_one_inflight on public.config_jobs(client_id) where state in ('sending','uncertain');
create function platform_private.reject_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable audit history' using errcode='55000'; end $$;
create trigger bridge_events_immutable before update or delete on public.bridge_events for each row execute function platform_private.reject_mutation();
create trigger paper_supplies_immutable before update or delete on public.paper_supplies for each row execute function platform_private.reject_mutation();
create trigger operator_audit_immutable before update or delete on public.operator_audit for each row execute function platform_private.reject_mutation();

-- Complete replacement projection under the client lock used by all writers.
create function platform_private.publish_billing(p_client integer) returns void
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; p jsonb; invoices jsonb; outstanding numeric; bc bigint; ic bigint; estimate numeric; ready boolean; source public.bridge_sources%rowtype; received_through bigint; billed bigint; settled bigint;
begin
 select * into strict c from public.clients where id=p_client for update;
 if c.currency is null then return; end if;
 ready:=c.billing_policy='usage-v1' and not c.accounting_review_required;
 select coalesce(sum(u.token_count) filter(where u.module_type='BILL'),0),coalesce(sum(u.token_count) filter(where u.module_type='INVENTORY'),0),coalesce(sum(u.token_count*u.rate_at_log),0)
 into bc,ic,estimate from public.usage_logs u where u.client_id=p_client and not u.is_invoiced and u.module_type in ('BILL','INVENTORY') and u.billing_ownership<>'excluded';
 select coalesce(sum(greatest(i.total_due-coalesce(pa.paid,0),0)),0) into outstanding from public.billing_cycles i
 left join lateral(select sum(amount) paid from public.payments where invoice_id=i.id) pa on true where i.client_id=p_client;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id::text,'reference','INV-'||i.id,'period',i.period_start||' to '||i.period_end,
  'status',case when coalesce(pa.paid,0)>=i.total_due then 'Paid' when coalesce(pa.paid,0)>0 then 'Partial' else 'Unpaid' end,
  'total',i.total_due,'paid',coalesce(pa.paid,0),'outstanding',greatest(i.total_due-coalesce(pa.paid,0),0)) order by i.id desc),'[]'::jsonb)
 into invoices from (select * from public.billing_cycles where client_id=p_client order by id desc limit 25) i
 left join lateral(select sum(amount) paid from public.payments where invoice_id=i.id) pa on true;
 -- The Shop allocates source_sequence under a commit-serialized lock. A verified
 -- cutover starts an all-event stream. Never advance past an unreceived event.
 select * into source from public.bridge_sources where client_id=p_client;
 if source.usage_from_sequence is not null then
  with numbered as (
   select source_sequence,source.usage_from_sequence+row_number() over(order by source_sequence)-1 expected
   from public.bridge_events where source_id=source.source_id and source_sequence>=source.usage_from_sequence
  ) select coalesce(min(expected) filter(where source_sequence<>expected)-1,max(source_sequence),source.usage_from_sequence-1)
  into received_through from numbered;
  if ready then
   select coalesce(min(e.source_sequence)-1,received_through) into billed
   from public.bridge_events e left join public.usage_logs u on u.event_id=e.event_id
   where e.source_id=source.source_id and e.source_sequence between source.usage_from_sequence and received_through
    and e.kind='usage' and (u.id is null or not u.is_invoiced or u.billing_ownership<>'bridge');
   select coalesce(min(e.source_sequence)-1,received_through) into settled
   from public.bridge_events e left join public.usage_logs u on u.event_id=e.event_id
   left join public.billing_cycles i on i.id=u.billing_cycle_id
   left join lateral(select coalesce(sum(amount),0) paid from public.payments where invoice_id=i.id) pay on true
   where e.source_id=source.source_id and e.source_sequence between source.usage_from_sequence and received_through
    and e.kind='usage' and (u.id is null or not u.is_invoiced or i.id is null or pay.paid<i.total_due or u.billing_ownership<>'bridge');
   -- Pre-cutover outstanding debt cannot be described as settled by this stream.
   if exists(select 1 from public.billing_cycles i where i.client_id=p_client and i.request_id is null
    and i.total_due>coalesce((select sum(amount) from public.payments where invoice_id=i.id),0)) then settled:=null; end if;
  end if;
 end if;
 p:=jsonb_build_object('schema_version',1,'currency',c.currency,'platform_updated_at',clock_timestamp(),
  'paper_resupply_enabled',c.paper_resupply_enabled,'usage',jsonb_build_object('BILL',bc,'INVENTORY',ic),'invoices',invoices,
  'outstanding_total',case when ready then outstanding end,'estimated_current_charges',case when ready then estimate end,
  'recent_billing',case when ready then 'Latest 25 invoices; outstanding includes all issued invoices' else 'Accounting review / policy activation required' end,
  'billed_through',billed,'settled_through',settled,'estimate_through',received_through,'pricing_version',c.pricing_version::text);
 insert into public.billing_projections(client_id,sync_version,payload) values(p_client,1,p)
 on conflict(client_id) do update set sync_version=public.billing_projections.sync_version+1,payload=excluded.payload,updated_at=clock_timestamp();
end $$;

create function platform_private.ingest_batch(p_secret_hash text,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.bridge_sources%rowtype; c public.clients%rowtype; e jsonb; old jsonb; body jsonb; eid uuid; seq bigint;
 metric text; ownership text; rate numeric; acks jsonb:='[]'; errors boolean:=false; billing jsonb; updates jsonb; request uuid;
begin
 select bs.* into s from public.bridge_sources bs join platform_private.source_credentials sc using(source_id) where sc.secret_sha256=p_secret_hash and bs.enabled;
 if not found then raise exception 'Source not authorized' using errcode='42501'; end if;
 if p_envelope->>'schema_version' is distinct from '1' or p_envelope->>'source_id' is distinct from s.source_id::text
 or p_envelope->>'client_binding' is distinct from s.client_binding or jsonb_typeof(p_envelope->'events') is distinct from 'array'
 then raise exception 'Binding or envelope mismatch' using errcode='22023'; end if;
 if jsonb_array_length(p_envelope->'events')>100 then raise exception 'Batch too large'; end if;
 select * into strict c from public.clients where id=s.client_id for update;
 select * into strict s from public.bridge_sources where source_id=s.source_id for update;
 if not s.enabled then raise exception 'Source disabled'; end if;
 for e in select value from jsonb_array_elements(p_envelope->'events') loop
  begin
   if not (e ?& array['event_id','source_id','source_sequence','kind','operation','operation_id','body','occurred_at','schema_version'])
    or e->>'source_id' is distinct from s.source_id::text or e->>'schema_version' is distinct from '1'
    or jsonb_typeof(e->'body') is distinct from 'object' or nullif(e->>'operation','') is null then raise exception 'Invalid event'; end if;
   eid:=(e->>'event_id')::uuid; seq:=(e->>'source_sequence')::bigint;
   if eid is null or seq is null or seq<1 or (e->>'operation_id')::uuid is null or (e->>'occurred_at')::timestamptz is null then raise exception 'Invalid identity'; end if;
   select envelope into old from public.bridge_events where event_id=eid;
   if found then
    if old<>e then raise exception 'Conflicting event identity'; end if;
    acks:=acks||jsonb_build_array(jsonb_build_object('event_id',eid,'status','duplicate')); continue;
   end if;
   body:=e->'body'; metric:=null;
   if e->>'kind'='usage' then
    if s.usage_from_sequence is null then raise exception 'Usage cutover not provisioned'; end if;
    metric:=body->>'metric';
    if metric is null or metric not in ('BILL','INVENTORY') or body->'quantity' is distinct from '1'::jsonb or body->>'unit' is distinct from 'event' then raise exception 'Unsupported usage'; end if;
    if (metric='BILL' and e->>'operation' not in ('create_retail_sale','create_repair_ticket','create_repair_subinvoice'))
     or (metric='INVENTORY' and e->>'operation'<>'create_inventory_item') then raise exception 'Unsupported usage operation'; end if;
   elsif e->>'kind'='thermal' then
    metric:='THERMAL';
    if e->>'operation'<>'print_intent' or not (body ?& array['document_type','document_id','copies','estimated_mm','paper_width_mm','template_version','measurement_version','calibration_version','measurement_status','is_reprint','original_event_id'])
     or jsonb_typeof(body->'copies') is distinct from 'number' or jsonb_typeof(body->'paper_width_mm') is distinct from 'number'
     or jsonb_typeof(body->'measurement_status') is distinct from 'string'
     or (body->>'copies')::numeric<>trunc((body->>'copies')::numeric)
     or (body->>'paper_width_mm')::numeric<>trunc((body->>'paper_width_mm')::numeric)
     or (body->>'copies')::integer not between 1 and 20 or (body->>'paper_width_mm')::integer<=0
     or jsonb_typeof(body->'is_reprint') is distinct from 'boolean' or body->>'measurement_status' not in ('estimated','unavailable')
     or (body->>'measurement_status'='estimated' and (jsonb_typeof(body->'estimated_mm') is distinct from 'number' or (body->>'estimated_mm')::numeric<=0 or (body->>'estimated_mm')::numeric<>trunc((body->>'estimated_mm')::numeric)))
     or (body->>'measurement_status'='unavailable' and body->'estimated_mm'<>'null'::jsonb) then raise exception 'Invalid thermal measurement'; end if;
   elsif e->>'kind'<>'resupply' or e->>'kind' is null then raise exception 'Unsupported event kind'; end if;
   insert into public.bridge_events(event_id,source_id,source_sequence,client_id,kind,operation,operation_id,envelope)
    values(eid,s.source_id,seq,s.client_id,e->>'kind',e->>'operation',(e->>'operation_id')::uuid,e);
   if metric is not null then
    ownership:=case when metric='THERMAL' then 'excluded' when s.usage_from_sequence is not null and seq>=s.usage_from_sequence then 'bridge' else 'excluded' end;
    rate:=case when metric='BILL' and c.bill_billable then coalesce(c.event_rate,0) when metric='INVENTORY' and c.inventory_billable then coalesce(c.inventory_rate,0) else 0 end;
    if rate<0 then raise exception 'Invalid Platform pricing'; end if;
    insert into public.usage_logs(client_id,module_type,token_count,rate_at_log,event_id,source_sequence,occurred_at,schema_version,metadata,billing_ownership,pricing_version)
    values(s.client_id,metric,1,rate,eid,seq,(e->>'occurred_at')::timestamptz,1,body,ownership,c.pricing_version);
   else
    if e->>'operation'<>'request_paper_resupply' then raise exception 'Unsupported request operation'; end if;
    request:=(body->>'request_id')::uuid;
    if request is null or request<>(e->>'operation_id')::uuid or body->>'schema_version' is distinct from '1' or (body->>'requested_at')::timestamptz is null then raise exception 'Invalid request'; end if;
    -- Shop authorized at submission. Later disablement must not discard queued requests.
    insert into public.paper_requests(request_id,client_id,source_id,requested_at) values(request,s.client_id,s.source_id,(body->>'requested_at')::timestamptz);
   end if;
   acks:=acks||jsonb_build_array(jsonb_build_object('event_id',eid,'status','accepted'));
  exception when others then
   errors:=true; insert into public.bridge_failures(source_id,event_id,reason) values(s.source_id,left(e->>'event_id',100),left(sqlerrm,200));
  end;
 end loop;
 update public.bridge_sources set last_received_at=clock_timestamp(),last_error=case when errors then 'Events rejected; inspect reconciliation history' else null end where source_id=s.source_id;
 perform platform_private.publish_billing(s.client_id);
 select jsonb_build_object('sync_version',sync_version,'payload',payload) into billing from public.billing_projections where client_id=s.client_id;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'sync_version',sync_version,'status',status,'platform_updated_at',updated_at)),'[]')
 into updates from (select * from public.paper_requests where source_id=s.source_id order by updated_at desc limit 100) r;
 return jsonb_build_object('schema_version',1,'source_id',s.source_id,'acknowledgements',acks,'resupply_updates',updates)
  ||case when billing is null then '{}'::jsonb else jsonb_build_object('billing',billing) end;
end $$;
create function public.platform_ingest(p_secret_hash text,p_envelope jsonb) returns jsonb
language sql set search_path='' as $$ select platform_private.ingest_batch(p_secret_hash,p_envelope) $$;

create function platform_private.generate_invoice(p_client integer,p_request uuid) returns public.billing_cycles
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; inv public.billing_cycles%rowtype; ids bigint[]; bc integer; ic integer; bt numeric; it numeric; start_at date;
begin
 perform platform_private.require_role(array['master_admin','billing_person']);
 if p_request is null then raise exception 'Request ID required'; end if;
 select * into strict c from public.clients where id=p_client for update;
 select * into inv from public.billing_cycles where request_id=p_request;
 if found then
  if inv.client_id<>p_client then raise exception 'Request conflict'; end if;
  return inv;
 end if;
 if c.billing_policy is distinct from 'usage-v1' or c.currency is null or c.accounting_review_required then raise exception 'Accounting review, currency and explicit usage policy required'; end if;
 if exists(select 1 from public.client_credit where client_id=p_client and not is_cleared) then raise exception 'Legacy credit requires reconciliation'; end if;
 select array_agg(id),min((recorded_at at time zone 'UTC')::date) into ids,start_at from
  (select id,recorded_at from public.usage_logs where client_id=p_client and not is_invoiced and billing_ownership<>'excluded'
   and module_type in ('BILL','INVENTORY') order by id for update) chosen;
 if ids is null then raise exception 'No eligible uninvoiced usage'; end if;
 if exists(select 1 from public.usage_logs where id=any(ids) and (token_count is null or token_count<=0 or rate_at_log is null or rate_at_log<0)) then raise exception 'Historical usage requires reconciliation'; end if;
 select coalesce(sum(token_count) filter(where module_type='BILL'),0),coalesce(sum(token_count) filter(where module_type='INVENTORY'),0),
  coalesce(sum(token_count*rate_at_log) filter(where module_type='BILL'),0),coalesce(sum(token_count*rate_at_log) filter(where module_type='INVENTORY'),0)
 into bc,ic,bt,it from public.usage_logs where id=any(ids);
 if bt<0 or it<0 then raise exception 'Historical negative pricing requires review'; end if;
 insert into public.billing_cycles(client_id,period_start,period_end,bill_count,inventory_count,event_rate,inventory_rate,bill_charges,inventory_charges,
 current_charges,total_due,remaining_balance,carried_forward_balance,invoice_date,due_date,status,payment_status,request_id,policy_snapshot,usage_cutoff)
 values(p_client,start_at,(clock_timestamp() at time zone 'UTC')::date,bc,ic,case when bc>0 then bt/bc else c.event_rate end,case when ic>0 then it/ic else c.inventory_rate end,bt,it,bt+it,bt+it,bt+it,0,clock_timestamp(),
 (date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month 2 days')::date,case when bt+it=0 then 'Paid' else 'Unpaid' end,case when bt+it=0 then 'Paid' else 'Unpaid' end,p_request,
 jsonb_build_object('policy',c.billing_policy,'currency',c.currency,'pricing_version',c.pricing_version,'rate_basis','per-event Platform rate snapshot',
 'timezone','UTC','allowance',0,'discount',0,'tax',0,'carry','outstanding stays on original invoice'),(select max(x) from unnest(ids) x)) returning * into inv;
 update public.usage_logs set is_invoiced=true,billing_cycle_id=inv.id where id=any(ids);
 update public.clients set grace_period_ends_at=clock_timestamp()+interval '3 days' where id=p_client;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'invoice',jsonb_build_object('invoice_id',inv.id,'usage_count',cardinality(ids)));
 perform platform_private.publish_billing(p_client);
 return inv;
end $$;
create function public.platform_generate_invoice(p_client integer,p_request uuid) returns public.billing_cycles
language sql set search_path='' as $$ select platform_private.generate_invoice(p_client,p_request) $$;

create function platform_private.record_payment(p_invoice bigint,p_amount numeric,p_method text,p_date date,p_notes text,p_request uuid) returns public.payments
language plpgsql security definer set search_path='' as $$
declare inv public.billing_cycles%rowtype; pay public.payments%rowtype; c public.clients%rowtype; paid numeric; balance numeric; cid integer;
begin
 perform platform_private.require_role(array['master_admin','billing_person']);
 if p_request is null or p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or nullif(btrim(p_method),'') is null or p_date is null then raise exception 'Invalid payment'; end if;
 select client_id into strict cid from public.billing_cycles where id=p_invoice;
 select * into strict c from public.clients where id=cid for update;
 select * into strict inv from public.billing_cycles where id=p_invoice for update;
 select * into pay from public.payments where request_id=p_request;
 if found then
  if pay.invoice_id<>p_invoice or pay.amount<>p_amount or pay.payment_method<>p_method or pay.payment_date<>p_date or pay.notes is distinct from coalesce(p_notes,'') then raise exception 'Payment request conflict'; end if;
  return pay;
 end if;
 if c.currency is null or c.accounting_review_required or c.billing_policy is distinct from 'usage-v1' then raise exception 'Accounting review / policy required'; end if;
 select coalesce(sum(amount),0) into paid from public.payments where invoice_id=p_invoice;
 balance:=inv.total_due-paid;
 if p_amount>balance then raise exception 'Payment exceeds outstanding; overpayment needs an explicit credit policy'; end if;
 insert into public.payments(invoice_id,client_id,amount,payment_method,payment_date,notes,recorded_by,request_id)
 values(p_invoice,cid,p_amount,p_method,p_date,coalesce(p_notes,''),auth.uid()::text,p_request) returning * into pay;
 balance:=balance-p_amount;
 update public.billing_cycles set remaining_balance=balance,payment_status=case when balance=0 then 'Paid' else 'Partial' end,
 status=case when balance=0 then 'Paid' else 'Partial' end,paid_at=case when balance=0 then clock_timestamp() end where id=p_invoice;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(cid,auth.uid(),'payment',jsonb_build_object('payment_id',pay.id,'invoice_id',p_invoice));
 perform platform_private.publish_billing(cid);
 return pay;
end $$;
create function public.platform_record_payment(p_invoice bigint,p_amount numeric,p_method text,p_date date,p_notes text,p_request uuid) returns public.payments
language sql set search_path='' as $$ select platform_private.record_payment(p_invoice,p_amount,p_method,p_date,p_notes,p_request) $$;

create function platform_private.paper_action(p_client integer,p_request uuid,p_version bigint,p_status text,p_delivery jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare r public.paper_requests%rowtype; d public.paper_supplies%rowtype; delivery uuid;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 perform 1 from public.clients where id=p_client for update;
 if not found then raise exception 'Unknown client'; end if;
 if p_delivery is not null then
  delivery:=(p_delivery->>'delivery_id')::uuid;
  if delivery is null then raise exception 'Delivery identity required'; end if;
  select * into d from public.paper_supplies where delivery_id=delivery;
  if found then
   if d.client_id<>p_client or d.request_id is distinct from p_request or d.reference is distinct from p_delivery->>'reference'
    or d.roll_count is distinct from (p_delivery->>'roll_count')::integer or d.usable_length_mm is distinct from (p_delivery->>'usable_length_mm')::integer
    or d.paper_width_mm is distinct from (p_delivery->>'paper_width_mm')::integer or d.delivered_at is distinct from (p_delivery->>'delivered_at')::timestamptz then raise exception 'Delivery conflict'; end if;
   return;
  end if;
  if p_status is distinct from 'fulfilled' then raise exception 'Delivery must be confirmed'; end if;
 end if;
 if p_request is not null then
  select * into strict r from public.paper_requests where request_id=p_request and client_id=p_client for update;
  if r.status=p_status and r.sync_version=p_version+1 and p_delivery is null then return; end if;
  if r.status<>'requested' or r.sync_version is distinct from p_version or p_status not in ('fulfilled','rejected','cancelled') or p_status is null then raise exception 'Stale or invalid lifecycle transition'; end if;
  if p_status='fulfilled' and p_delivery is null then raise exception 'Confirmed delivery required'; end if;
 elsif p_delivery is null then raise exception 'Request or delivery required'; end if;
 if p_delivery is not null then
  if (p_delivery->>'delivered_at')::timestamptz>clock_timestamp() then raise exception 'Future supply is not delivered capacity'; end if;
  insert into public.paper_supplies(delivery_id,client_id,request_id,reference,roll_count,usable_length_mm,paper_width_mm,delivered_at,recorded_by)
  values(delivery,p_client,p_request,p_delivery->>'reference',(p_delivery->>'roll_count')::integer,(p_delivery->>'usable_length_mm')::integer,
  (p_delivery->>'paper_width_mm')::integer,(p_delivery->>'delivered_at')::timestamptz,auth.uid());
 end if;
 if p_request is not null then update public.paper_requests set status=p_status,sync_version=sync_version+1,updated_at=clock_timestamp() where request_id=p_request; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'paper_'||p_status,jsonb_build_object('request_id',p_request,'delivery_id',delivery,'prior_version',p_version));
end $$;
create function public.platform_paper_action(p_client integer,p_request uuid,p_version bigint,p_status text,p_delivery jsonb default null) returns void
language sql set search_path='' as $$ select platform_private.paper_action(p_client,p_request,p_version,p_status,p_delivery) $$;

create function platform_private.set_paper(p_client integer,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if p_enabled is null then raise exception 'Boolean required'; end if;
 update public.clients set paper_resupply_enabled=p_enabled where id=p_client;
 if not found then raise exception 'Unknown client'; end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'paper_entitlement',jsonb_build_object('enabled',p_enabled));
 perform platform_private.publish_billing(p_client);
end $$;
create function public.platform_set_paper(p_client integer,p_enabled boolean) returns void
language sql set search_path='' as $$ select platform_private.set_paper(p_client,p_enabled) $$;

create function platform_private.set_rates(p_client integer,p_bill numeric,p_inventory numeric,p_inventory_billable boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype;
begin
 perform platform_private.require_role(array['master_admin','billing_person']);
 if p_bill is null or p_inventory is null or p_bill<0 or p_inventory<0 or p_bill::text in ('NaN','Infinity') or p_inventory::text in ('NaN','Infinity') or p_inventory_billable is null then raise exception 'Invalid rates'; end if;
 select * into strict c from public.clients where id=p_client for update;
 insert into public.pricing_rate_log(client_id,module_type,old_rate,new_rate) values(p_client,'BILL',coalesce(c.event_rate,0),p_bill),(p_client,'INVENTORY',coalesce(c.inventory_rate,0),p_inventory);
 update public.clients set event_rate=p_bill,inventory_rate=p_inventory,inventory_billable=p_inventory_billable,pricing_version=pricing_version+1 where id=p_client;
 perform platform_private.publish_billing(p_client);
end $$;
create function public.platform_set_rates(p_client integer,p_bill numeric,p_inventory numeric,p_inventory_billable boolean) returns void
language sql set search_path='' as $$ select platform_private.set_rates(p_client,p_bill,p_inventory,p_inventory_billable) $$;

-- Reserve identity and serialize writes before contacting the Shop. No lease reclaim:
-- uncertain network outcomes need read-back reconciliation before another mutation.
create function platform_private.begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs%rowtype; k text;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 if p_request is null or p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb
  or (p_changes-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','suspended'])<>'{}'::jsonb then raise exception 'Unsupported config write'; end if;
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
create function public.platform_begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language sql set search_path='' as $$ select platform_private.begin_config(p_client,p_request,p_changes) $$;
create function platform_private.finish_config(p_request uuid,p_state text,p_result jsonb) returns void
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
  status=case when (p_result->>'suspended')::boolean then 'Suspended' else 'Active' end,config_synced_at=clock_timestamp() where id=j.client_id;
 end if;
 update public.config_jobs set state=p_state,result=p_result,finished_at=clock_timestamp() where request_id=p_request;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(j.client_id,j.actor_id,'config_'||p_state,jsonb_build_object('request_id',p_request,'changes',j.changes));
end $$;
create function public.platform_finish_config(p_request uuid,p_state text,p_result jsonb) returns void
language sql set search_path='' as $$ select platform_private.finish_config(p_request,p_state,p_result) $$;

-- SQL aggregates avoid silently truncated browser ledgers (PostgREST row limits).
create function platform_private.client_operations(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 select jsonb_build_object(
 'source',(select to_jsonb(s) from public.bridge_sources s where client_id=p_client),
 'projection',(select to_jsonb(p) from public.billing_projections p where client_id=p_client),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from public.paper_requests where client_id=p_client order by updated_at desc limit 30) r),
 'supplies',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select * from public.paper_supplies where client_id=p_client order by delivered_at desc limit 30) d),
 'supplied_mm',(select coalesce(sum(roll_count::numeric*usable_length_mm),0) from public.paper_supplies where client_id=p_client and status='delivered'),
 'thermal',(select jsonb_build_object('estimated_mm',coalesce(sum((metadata->>'estimated_mm')::numeric),0),'events',count(*),
  'unavailable',count(*) filter(where metadata->>'measurement_status' is distinct from 'estimated'),
  'reprint_mm',coalesce(sum((metadata->>'estimated_mm')::numeric) filter(where (metadata->>'is_reprint')::boolean),0)) from public.usage_logs where client_id=p_client and module_type='THERMAL'),
 'thermal_periods',(select coalesce(jsonb_agg(to_jsonb(t) order by month desc),'[]') from
  (select date_trunc('month',recorded_at at time zone 'UTC')::date as month,metadata->>'document_type' document_type,metadata->>'paper_width_mm' paper_width_mm,
  sum((metadata->>'estimated_mm')::numeric) estimated_mm,count(*) events,count(*) filter(where metadata->>'measurement_status' is distinct from 'estimated') unavailable,
  coalesce(sum((metadata->>'estimated_mm')::numeric) filter(where (metadata->>'is_reprint')::boolean),0) reprint_mm
  from public.usage_logs where client_id=p_client and module_type='THERMAL' group by 1,2,3 order by 1 desc limit 120) t),
 'failures',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from (select f.* from public.bridge_failures f join public.bridge_sources s using(source_id) where s.client_id=p_client order by f.id desc limit 20) f),
 'config_jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from (select * from public.config_jobs where client_id=p_client order by created_at desc limit 10) j)
 ) into result;
 return result;
end $$;
create function public.platform_client_operations(p_client integer) returns jsonb
language sql set search_path='' as $$ select platform_private.client_operations(p_client) $$;
create function platform_private.usage_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager','billing_person']);
 return (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (
 select client_id,coalesce(sum(token_count) filter(where module_type='BILL'),0) as "billCount",
 coalesce(sum(token_count*rate_at_log) filter(where module_type='BILL'),0) as "billTotal",
 coalesce(sum(token_count) filter(where module_type='INVENTORY'),0) as "inventoryCount",
 coalesce(sum(token_count*rate_at_log) filter(where module_type='INVENTORY'),0) as "inventoryTotal",
 coalesce(sum(token_count*rate_at_log) filter(where recorded_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0) as "todayTotal",
 coalesce(sum(token_count*rate_at_log),0) as "grandTotal"
 from public.usage_logs where not is_invoiced and billing_ownership<>'excluded' and module_type in ('BILL','INVENTORY') group by client_id) s);
end $$;
create function public.platform_usage_summary() returns jsonb language sql set search_path='' as $$ select platform_private.usage_summary() $$;

-- Currency is client-specific. Never relabel an existing monetary ledger.
create function platform_private.set_currency(p_client integer,p_currency text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype;
begin
 perform platform_private.require_role(array['master_admin','billing_person','portfolio_manager']);
 if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'Choose a three-letter ISO currency'; end if;
 select * into strict c from public.clients where id=p_client for update;
 if c.currency is not distinct from p_currency then return; end if;
 if exists(select 1 from public.billing_cycles where client_id=p_client)
  or exists(select 1 from public.usage_logs where client_id=p_client and module_type in ('BILL','INVENTORY') and billing_ownership<>'excluded') then
  raise exception 'Currency is locked once monetary history exists; use a separate account for a new currency';
 end if;
 update public.clients set currency=p_currency,currency_symbol=p_currency where id=p_client;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'currency',jsonb_build_object('old',c.currency,'new',p_currency));
 perform platform_private.publish_billing(p_client);
end $$;
create function public.platform_set_currency(p_client integer,p_currency text) returns void
language sql set search_path='' as $$ select platform_private.set_currency(p_client,p_currency) $$;

-- Replace permissive baseline policies; authenticated alone is not authorization.
do $$ declare p record; t text; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in
 ('clients','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log','platform_config','platform_users','support_tickets') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
 foreach t in array array['clients','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log','platform_config','platform_users','support_tickets',
 'bridge_sources','bridge_events','bridge_failures','billing_projections','paper_requests','paper_supplies','operator_audit','config_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy operator_read on public.%I for select to authenticated using (platform_private.operator_role() is not null)',t);
 end loop;
end $$;
alter table platform_private.source_credentials enable row level security;
revoke all on platform_private.source_credentials from public,anon,authenticated;
grant all on platform_private.source_credentials to service_role;
grant insert(name,industry,plan,status,supabase_url,supabase_anon,shop_url,currency,currency_symbol,event_rate,inventory_rate,bill_billable,inventory_billable) on public.clients to authenticated;
grant update(name,industry,plan,shop_url,currency_symbol) on public.clients to authenticated;
create policy client_create on public.clients for insert to authenticated with check(platform_private.operator_role() in ('master_admin','portfolio_manager'));
create policy client_edit on public.clients for update to authenticated using(platform_private.operator_role() in ('master_admin','portfolio_manager')) with check(platform_private.operator_role() in ('master_admin','portfolio_manager'));
grant usage on sequence public.clients_id_seq to authenticated;
grant update(admin_username) on public.platform_config to authenticated;
create policy config_admin on public.platform_config for update to authenticated using(platform_private.operator_role()='master_admin') with check(platform_private.operator_role()='master_admin');
grant update(name,email,role,status) on public.platform_users to authenticated;
create policy users_admin on public.platform_users for update to authenticated using(platform_private.operator_role()='master_admin') with check(platform_private.operator_role()='master_admin');
create function platform_private.accept_invite() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.platform_users set status='Active' where auth_user_id=auth.uid() and status='Pending';
end $$;
create function public.platform_accept_invite() returns void language sql set search_path='' as $$ select platform_private.accept_invite() $$;
grant update(status,resolved_at) on public.support_tickets to authenticated;
create policy support_operator on public.support_tickets for update to authenticated using(platform_private.operator_role() in ('master_admin','portfolio_manager')) with check(platform_private.operator_role() in ('master_admin','portfolio_manager'));
-- Keep legacy support submission insert-only; no anonymous reads or financial writes.
grant insert(client_id,client_name,subject,message) on public.support_tickets to anon;
grant usage on sequence public.support_tickets_id_seq to anon;
create policy support_submission on public.support_tickets for insert to anon with check(status='Open');
-- Historical plaintext password is never exposed to browsers or updated by the UI.
revoke select on public.platform_config from authenticated;
grant select(id,admin_username) on public.platform_config to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='platform_private' or (n.nspname='public' and p.proname like 'platform_%') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function platform_private.operator_role(),platform_private.require_role(text[]),
 platform_private.generate_invoice(integer,uuid),platform_private.record_payment(bigint,numeric,text,date,text,uuid),
 platform_private.paper_action(integer,uuid,bigint,text,jsonb),platform_private.set_paper(integer,boolean),
 platform_private.set_rates(integer,numeric,numeric,boolean),platform_private.begin_config(integer,uuid,jsonb),
 platform_private.client_operations(integer),platform_private.usage_summary(),platform_private.accept_invite(),platform_private.set_currency(integer,text) to authenticated;
grant execute on function public.platform_generate_invoice(integer,uuid),public.platform_record_payment(bigint,numeric,text,date,text,uuid),
 public.platform_paper_action(integer,uuid,bigint,text,jsonb),public.platform_set_paper(integer,boolean),
 public.platform_set_rates(integer,numeric,numeric,boolean),public.platform_begin_config(integer,uuid,jsonb),
 public.platform_client_operations(integer),public.platform_usage_summary(),public.platform_accept_invite(),public.platform_set_currency(integer,text) to authenticated;

