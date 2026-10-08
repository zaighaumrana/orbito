\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000009201','fixture-master@example.test',now());
select platform_private.initialize_config('Fixture master','Disposable currency fixture');
select platform_private.bind_master('00000000-0000-4000-8000-000000009201',null,'Disposable currency fixture');
insert into public.clients(id,name,supabase_url,supabase_anon,event_rate) values(9201,'USD fixture','https://example.invalid','public',5),(9202,'EUR fixture','https://example.invalid','public',7);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009201',true);
set local role authenticated;
select public.platform_set_currency(9201,'USD');
select public.platform_set_currency(9202,'EUR');
reset role;
insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note) values('10000000-0000-4000-8000-000000009201',9201,'boundaries',true,10,'verified test cutover');
insert into platform_private.source_credentials values('10000000-0000-4000-8000-000000009201',repeat('d',64));
create function pg_temp.deliver(seq integer) returns jsonb language sql as $$
 select public.platform_ingest(repeat('d',64),jsonb_build_object('schema_version',1,'source_id','10000000-0000-4000-8000-000000009201','client_binding','boundaries','events',jsonb_build_array(
 jsonb_build_object('schema_version',1,'source_id','10000000-0000-4000-8000-000000009201','event_id',('20000000-0000-4000-8000-'||lpad(seq::text,12,'0'))::uuid,
 'source_sequence',seq,'kind','usage','operation','create_retail_sale','operation_id',('30000000-0000-4000-8000-'||lpad(seq::text,12,'0'))::uuid,'occurred_at','2026-09-25T00:00:00Z','body','{"metric":"BILL","quantity":1,"unit":"event"}'::jsonb))))
$$;
do $$ declare r jsonb; i1 public.billing_cycles; i2 public.billing_cycles; begin
 r:=pg_temp.deliver(10); r:=pg_temp.deliver(12);
 assert (r->'billing'->'payload'->>'estimate_through')::bigint=10,'gap must stop receive boundary';
 assert (r->'billing'->'payload'->>'billed_through')::bigint=9,'unbilled first event';
 i1:=public.platform_generate_invoice(9201,'40000000-0000-4000-8000-000000009201');
 assert (select (payload->>'billed_through')::bigint from billing_projections where client_id=9201)=10,'invoice cannot imply missing event delivered';
 r:=pg_temp.deliver(11);
 assert (r->'billing'->'payload'->>'estimate_through')::bigint=12,'gap filled';
 assert (r->'billing'->'payload'->>'billed_through')::bigint=10,'new gap event remains uninvoiced';
 i2:=public.platform_generate_invoice(9201,'40000000-0000-4000-8000-000000009202');
 perform public.platform_record_payment(i2.id,5,'Cash','2026-09-27','second first','50000000-0000-4000-8000-000000009202');
 assert (select (payload->>'settled_through')::bigint from billing_projections where client_id=9201)=9,'later paid invoice cannot settle earlier debt';
 perform public.platform_record_payment(i1.id,10,'Cash','2026-09-27','first later','50000000-0000-4000-8000-000000009201');
 assert (select (payload->>'settled_through')::bigint from billing_projections where client_id=9201)=12,'contiguous fully paid prefix';
 assert (select payload->>'currency' from billing_projections where client_id=9201)='USD','USD preserved';
 assert (select payload->>'currency' from billing_projections where client_id=9202)='EUR','EUR separate';
 begin
  perform public.platform_set_currency(9201,'EUR'); raise exception 'historical currency relabeled';
 exception when raise_exception then if sqlerrm not like 'Currency is locked%' then raise; end if; end;
end $$;
rollback;
\echo Currency and boundary checks passed
