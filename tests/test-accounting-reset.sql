\set ON_ERROR_STOP on
-- Disposable database only; deliberately committed so maintenance transaction is tested.
insert into public.clients(id,name,supabase_url,supabase_anon) values(1,'Legacy test','https://example.invalid','public'),(3,'Legacy test 2','https://example.invalid','public');
insert into public.billing_cycles(client_id,period_start,period_end,total_due,carried_forward_balance) values(1,'2026-07-01','2026-07-31',155,136);
insert into public.usage_logs(client_id,module_type,rate_at_log) values(1,'BILL',8);
insert into public.payments(client_id,invoice_id,amount,payment_method,payment_date) select 1,id,155,'Cash','2026-07-31' from public.billing_cycles where client_id=1;
insert into public.client_credit(client_id,source_invoice_id,amount_outstanding) select 1,id,136 from public.billing_cycles where client_id=1;
\ir ../supabase/maintenance/reset_legacy_test_accounting.sql
\ir ../supabase/maintenance/reset_legacy_test_accounting.sql
do $$ begin
 assert not exists(select 1 from public.billing_cycles where client_id in (1,3)),'test invoices cleared';
 assert not exists(select 1 from public.payments where client_id in (1,3)),'test payments cleared';
 assert not exists(select 1 from public.client_credit where client_id in (1,3)),'test credits cleared';
 assert not exists(select 1 from public.usage_logs where client_id in (1,3)),'test usage cleared';
 assert (select count(*) from public.clients where id in (1,3) and currency='PKR' and not accounting_review_required)=2,'registry retained and policy ready';
 assert (select count(*) from public.operator_audit where action='reset_legacy_test_accounting')=1,'reset idempotent and audited';
end $$;
\echo Test-accounting reset checks passed
