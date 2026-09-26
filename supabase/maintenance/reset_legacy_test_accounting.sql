-- OWNER-CONFIRMED TEST DATA ONLY: current Platform clients 1 and 3.
-- Run manually AFTER the control-plane migration and BEFORE enabling their bridges.
-- Never run on another project. This script is NOT run by the application.
begin;
do $$
declare cid integer; counts jsonb;
begin
 if exists(select 1 from public.operator_audit where action='reset_legacy_test_accounting' and detail->>'batch'='2026-09-27-clients-1-3') then
  raise notice 'Test accounting was already reset; no changes'; return;
 end if;
 perform 1 from public.clients where id in (1,3) order by id for update;
 if exists(select 1 from public.bridge_sources where client_id in (1,3) and enabled)
  or exists(select 1 from public.bridge_events where client_id in (1,3))
  or exists(select 1 from public.billing_cycles where client_id in (1,3) and request_id is not null)
  or exists(select 1 from public.payments where client_id in (1,3) and request_id is not null) then
  raise exception 'Refusing test reset: modern bridge/accounting activity exists';
 end if;
 counts:=jsonb_build_object('batch','2026-09-27-clients-1-3','clients',jsonb_build_array(1,3),
 'invoices',(select count(*) from public.billing_cycles where client_id in (1,3)),
 'payments',(select count(*) from public.payments where client_id in (1,3)),
 'usage',(select count(*) from public.usage_logs where client_id in (1,3)));
 delete from public.client_credit where client_id in (1,3);
 delete from public.usage_logs where client_id in (1,3) and event_id is null;
 delete from public.payments where client_id in (1,3) and request_id is null;
 delete from public.billing_cycles where client_id in (1,3) and request_id is null;
 update public.clients set currency='PKR',currency_symbol='PKR',billing_policy='usage-v1',billing_model='usage',accounting_review_required=false
 where id in (1,3);
 insert into public.operator_audit(actor_id,action,detail) values(auth.uid(),'reset_legacy_test_accounting',counts);
 for cid in select id from public.clients where id in (1,3) loop perform platform_private.publish_billing(cid); end loop;
end $$;
commit;
