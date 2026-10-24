begin;
alter table public.paper_requests drop constraint paper_requests_status_check;
alter table public.paper_requests add constraint paper_requests_status_check check(status in ('requested','approved','dispatched','fulfilled','rejected','cancelled'));
alter table public.paper_requests add column communication jsonb not null default '[]' check(jsonb_typeof(communication)='array');
drop index public.paper_one_active;
create unique index paper_one_active on public.paper_requests(client_id) where status in ('requested','approved','dispatched');

create function platform_private.paper_decision(p_client integer,p_request uuid,p_version bigint,p_status text,p_message text,p_expectation text,p_delivery jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.paper_requests%rowtype; d public.paper_supplies%rowtype; delivery uuid;
 msg text:=btrim(coalesce(p_message,'')); eta text:=btrim(coalesce(p_expectation,'')); last_update jsonb; stamp timestamptz:=clock_timestamp();
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 perform 1 from public.clients where id=p_client for update;
 if not found then raise exception 'Unknown client';end if;
 if length(msg)>2000 or length(eta)>200 or replace(replace(replace(msg,E'\n',''),E'\r',''),E'\t','') ~ '[[:cntrl:]]' or eta ~ '[[:cntrl:]]' then raise exception 'Invalid customer message';end if;
 if p_status is null or p_status not in ('approved','dispatched','fulfilled','rejected','cancelled') then raise exception 'Invalid status';end if;
 if p_request is null and (msg<>'' or eta<>'') then raise exception 'Customer notes require a linked request';end if;
 if p_status in ('approved','dispatched','rejected','cancelled') and msg='' then raise exception 'Customer message required';end if;
 if p_delivery is not null then
  if p_status<>'fulfilled' then raise exception 'Delivery must be confirmed';end if;
  delivery:=(p_delivery->>'delivery_id')::uuid;
  if delivery is null then raise exception 'Delivery identity required';end if;
  select * into d from public.paper_supplies where delivery_id=delivery;
  if found then
   if d.client_id<>p_client or d.request_id is distinct from p_request or d.reference is distinct from p_delivery->>'reference'
    or d.roll_count is distinct from (p_delivery->>'roll_count')::integer or d.usable_length_mm is distinct from (p_delivery->>'usable_length_mm')::integer
    or d.paper_width_mm is distinct from (p_delivery->>'paper_width_mm')::integer or d.delivered_at is distinct from (p_delivery->>'delivered_at')::timestamptz
    then raise exception 'Delivery conflict';end if;
   if p_request is not null then
    select communication->-1 into last_update from public.paper_requests where request_id=p_request;
    if not(last_update is null and msg='' and eta='') and (last_update->>'message' is distinct from msg or last_update->>'expectation' is distinct from eta) then raise exception 'Delivery communication conflict';end if;
   end if;
   return;
  end if;
 elsif p_status='fulfilled' then raise exception 'Confirmed delivery required';end if;
 if p_request is not null then
  select * into strict r from public.paper_requests where request_id=p_request and client_id=p_client for update;
  last_update:=r.communication->-1;
  if r.status=p_status and r.sync_version=p_version+1 and p_delivery is null
    and last_update->>'message'=msg and last_update->>'expectation'=eta then return;end if;
  if r.sync_version is distinct from p_version or r.status in ('fulfilled','rejected','cancelled')
   or not ((r.status='requested' and p_status in ('approved','rejected','cancelled','fulfilled'))
    or (r.status='approved' and p_status in ('dispatched','cancelled','fulfilled'))
    or (r.status='dispatched' and p_status='fulfilled')) then raise exception 'Stale or invalid lifecycle transition';end if;
 elsif p_delivery is null then raise exception 'Request or delivery required';end if;
 if p_delivery is not null then
  if (p_delivery->>'delivered_at')::timestamptz>stamp then raise exception 'Future supply is not delivered capacity';end if;
  insert into public.paper_supplies(delivery_id,client_id,request_id,reference,roll_count,usable_length_mm,paper_width_mm,delivered_at,recorded_by)
  values(delivery,p_client,p_request,p_delivery->>'reference',(p_delivery->>'roll_count')::integer,(p_delivery->>'usable_length_mm')::integer,
   (p_delivery->>'paper_width_mm')::integer,(p_delivery->>'delivered_at')::timestamptz,auth.uid());
 end if;
 if p_request is not null then
  update public.paper_requests set status=p_status,sync_version=sync_version+1,updated_at=stamp,
   communication=communication||jsonb_build_array(jsonb_build_object('status',p_status,'revision',sync_version+1,'message',msg,'expectation',eta,'at',stamp))
  where request_id=p_request;
 end if;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'paper_'||p_status,
  jsonb_build_object('request_id',p_request,'delivery_id',delivery,'prior_version',p_version));
end $$;
revoke all on function platform_private.paper_decision(integer,uuid,bigint,text,text,text,jsonb) from public,anon,authenticated;
create function public.platform_paper_decision(p_client integer,p_request uuid,p_version bigint,p_status text,p_message text,p_expectation text default '',p_delivery jsonb default null) returns void
language sql set search_path='' as $$ select platform_private.paper_decision(p_client,p_request,p_version,p_status,p_message,p_expectation,p_delivery) $$;
revoke all on function public.platform_paper_decision(integer,uuid,bigint,text,text,text,jsonb) from public,anon;
grant execute on function public.platform_paper_decision(integer,uuid,bigint,text,text,text,jsonb) to authenticated;
grant execute on function platform_private.paper_decision(integer,uuid,bigint,text,text,text,jsonb) to authenticated;
-- Legacy delivery calls retain their quantities and idempotency contract. Decisions now require a message.
create or replace function platform_private.paper_action(p_client integer,p_request uuid,p_version bigint,p_status text,p_delivery jsonb default null) returns void
language sql security definer set search_path='' as $$ select platform_private.paper_decision(p_client,p_request,p_version,p_status,'','',p_delivery) $$;

-- Preserve the existing authenticated ingest and billing semantics; extend only its customer projection.
create or replace function platform_private.ingest_batch(p_secret_hash text,p_envelope jsonb) returns jsonb
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
 select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'sync_version',sync_version,'status',status,'platform_updated_at',updated_at,'communication',communication)),'[]')
 into updates from (select * from public.paper_requests where source_id=s.source_id order by updated_at desc limit 100) r;
 return jsonb_build_object('schema_version',1,'source_id',s.source_id,'acknowledgements',acks,'resupply_updates',updates)
  ||case when billing is null then '{}'::jsonb else jsonb_build_object('billing',billing) end;
end $$;

commit;
