-- Run against a disposable baseline + modernization database only. No live data.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-4000-8000-000000000001','fixture-master@example.test',now()),('00000000-0000-4000-8000-000000000002','not-an-operator@example.test',now());
select platform_private.initialize_config('Fixture master','Disposable control plane fixture');
select platform_private.bind_master('00000000-0000-4000-8000-000000000001',null,'Disposable control plane fixture');
insert into public.clients(id,name,supabase_url,supabase_anon,currency,billing_policy,event_rate,inventory_rate,inventory_billable)
 values (9001,'Fixture','https://example.invalid','public','PKR','usage-v1',5,2,true);
insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note)
 values('10000000-0000-4000-8000-000000000001',9001,'fixture',true,10,'Fixture verified boundary');
insert into platform_private.source_credentials values('10000000-0000-4000-8000-000000000001',repeat('a',64));
create function pg_temp.envelope(eid integer,seq integer,kind text,operation text,body jsonb) returns jsonb language sql as $$
 select jsonb_build_object('schema_version',1,'source_id','10000000-0000-4000-8000-000000000001','client_binding','fixture','events',jsonb_build_array(
 jsonb_build_object('schema_version',1,'source_id','10000000-0000-4000-8000-000000000001','event_id',('20000000-0000-4000-8000-'||lpad(eid::text,12,'0'))::uuid,
 'source_sequence',seq,'kind',kind,'operation',operation,'operation_id',('30000000-0000-4000-8000-'||lpad(eid::text,12,'0'))::uuid,'occurred_at','2026-09-25T00:00:00Z','body',body)))
$$;
set local role service_role;
do $$ declare e jsonb; r jsonb; begin
 e:=pg_temp.envelope(1,10,'usage','create_retail_sale','{"metric":"BILL","quantity":1,"unit":"event"}');
 r:=public.platform_ingest(repeat('a',64),e);
 assert r->'acknowledgements'->0->>'status'='accepted','accept usage';
 r:=public.platform_ingest(repeat('a',64),e);
 assert r->'acknowledgements'->0->>'status'='duplicate','duplicate ack';
 r:=public.platform_ingest(repeat('a',64),jsonb_set(e,'{events,0,body,quantity}','2'));
 assert jsonb_array_length(r->'acknowledgements')=0,'conflict must not ACK';
 assert (select count(*) from public.usage_logs where client_id=9001)=1,'one canonical event';
 assert (select rate_at_log from public.usage_logs where client_id=9001)=5,'Platform rate';
 begin
  perform public.platform_ingest(repeat('b',64),e); raise exception 'bad secret accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.platform_ingest(repeat('a',64),jsonb_set(e,'{client_binding}','"different"')); raise exception 'bad binding accepted';
 exception when invalid_parameter_value then null; end;
 r:=public.platform_ingest(repeat('a',64),pg_temp.envelope(2,9,'usage','create_retail_sale','{"metric":"BILL","quantity":1,"unit":"event"}'));
 assert (select billing_ownership from public.usage_logs where source_sequence=9 and client_id=9001)='excluded','legacy boundary';
 r:=public.platform_ingest(repeat('a',64),pg_temp.envelope(3,11,'thermal','print_intent',
 '{"document_type":"retail_receipt","document_id":7,"copies":2,"estimated_mm":600,"paper_width_mm":80,"template_version":"thermal-80-v1","measurement_version":"css-height-v1","calibration_version":"feed-6mm-v1","measurement_status":"estimated","is_reprint":true,"original_event_id":null}'));
 assert r->'acknowledgements'->0->>'status'='accepted','thermal with flag false';
 r:=public.platform_ingest(repeat('a',64),pg_temp.envelope(4,12,'usage','create_inventory_item','{"metric":"INVENTORY","quantity":1,"unit":"event"}'));
 assert (r->'billing'->'payload'->>'estimated_current_charges')::numeric=7,'metrics separate';
 assert not (r->'billing'->'payload' ? 'thermal'),'customer safe projection';
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare i public.billing_cycles; pay public.payments; version bigint; j jsonb; begin
 i:=public.platform_generate_invoice(9001,'40000000-0000-4000-8000-000000000001');
 assert i.total_due=7 and i.bill_count=1 and i.inventory_count=1,'exact eligible membership';
 assert (select count(*) from public.usage_logs where billing_cycle_id=i.id)=2,'only BILL/INVENTORY attached';
 assert (select count(*) from public.usage_logs where module_type='THERMAL' and is_invoiced)=0,'thermal never invoiced';
 assert (public.platform_generate_invoice(9001,'40000000-0000-4000-8000-000000000001')).id=i.id,'invoice retry';
 select sync_version into version from public.billing_projections where client_id=9001;
 pay:=public.platform_record_payment(i.id,3,'Cash','2026-09-25','fixture','50000000-0000-4000-8000-000000000001');
 assert (select payment_status from public.billing_cycles where id=i.id)='Partial','partial payment';
 assert (public.platform_record_payment(i.id,3,'Cash','2026-09-25','fixture','50000000-0000-4000-8000-000000000001')).id=pay.id,'payment retry';
 begin
  perform public.platform_record_payment(i.id,2,'Cash','2026-09-25','fixture','50000000-0000-4000-8000-000000000001'); raise exception 'conflicting payment accepted';
 exception when raise_exception then if sqlerrm<>'Payment request conflict' then raise; end if; end;
 perform public.platform_record_payment(i.id,4,'Cash','2026-09-25','fixture','50000000-0000-4000-8000-000000000002');
 assert (select payment_status from public.billing_cycles where id=i.id)='Paid','paid';
 assert (select sync_version from public.billing_projections where client_id=9001)>version,'newer revision';
 assert (select (payload->>'outstanding_total')::numeric from public.billing_projections where client_id=9001)=0,'outstanding cleared';
 assert not has_table_privilege('authenticated','public.payments','INSERT'),'direct financial writes denied';
 assert not has_function_privilege('authenticated','public.platform_ingest(text,jsonb)','EXECUTE'),'direct ingest denied';
 j:=public.platform_begin_config(9001,'60000000-0000-4000-8000-000000000001','{"technician_module_enabled":true}');
 assert (j->>'dispatch')::boolean,'first dispatch';
 assert not (public.platform_begin_config(9001,'60000000-0000-4000-8000-000000000001','{"technician_module_enabled":true}')->>'dispatch')::boolean,'retry cannot dispatch twice';
 begin
  perform public.platform_begin_config(9001,'60000000-0000-4000-8000-000000000002','{"workshop_enabled":true}'); raise exception 'legacy alias accepted';
 exception when raise_exception then if sqlerrm<>'Unsupported config write' then raise; end if; end;
 assert (public.platform_client_operations(9001)->'thermal'->>'estimated_mm')::numeric=600,'copies not multiplied again';
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_begin_config(9001,gen_random_uuid(),'{"ems_enabled":true}'); raise exception 'unauthorized config accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.platform_generate_invoice(9001,gen_random_uuid()); raise exception 'unauthorized billing accepted';
 exception when insufficient_privilege then null; end;
 assert (select count(*) from public.billing_cycles)=0,'nonoperator RLS';
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role service_role;
select public.platform_ingest(repeat('a',64),pg_temp.envelope(8,14,'resupply','request_paper_resupply',
 '{"request_id":"30000000-0000-4000-8000-000000000008","schema_version":1,"requested_at":"2026-09-25T00:00:00Z"}'));
reset role;
set local role authenticated;
do $$ declare delivery jsonb; begin
 delivery:='{"delivery_id":"70000000-0000-4000-8000-000000000001","reference":"fixture delivery","roll_count":2,"usable_length_mm":30000,"paper_width_mm":80,"delivered_at":"2026-09-25T00:00:00Z"}';
 begin
  perform public.platform_paper_action(9001,'30000000-0000-4000-8000-000000000008',2,'fulfilled',delivery); raise exception 'stale update accepted';
 exception when raise_exception then if sqlerrm<>'Stale or invalid lifecycle transition' then raise; end if; end;
 perform public.platform_paper_action(9001,'30000000-0000-4000-8000-000000000008',1,'fulfilled',delivery);
 perform public.platform_paper_action(9001,'30000000-0000-4000-8000-000000000008',1,'fulfilled',delivery);
 assert (public.platform_client_operations(9001)->>'supplied_mm')::numeric=60000,'confirmed delivered capacity once';
 assert (select sync_version from public.paper_requests where client_id=9001)=2,'lifecycle monotonic';
 perform public.platform_set_paper(9001,true);
 perform public.platform_set_paper(9001,false);
 assert (public.platform_client_operations(9001)->'thermal'->>'estimated_mm')::numeric=600,'flag never erases thermal';
end $$;
reset role;
rollback;
\echo Control-plane invariants passed
