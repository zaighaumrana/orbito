-- Disposable local fixture; no hosted credentials or connections.
insert into auth.users(id,email) values('99000000-0000-4000-8000-000000000001','canonical-master@example.test'),('99000000-0000-4000-8000-000000000002','manager@example.test');
create or replace function platform_private.operator_role() returns text language sql stable security definer set search_path='' as $$select case auth.uid() when '99000000-0000-4000-8000-000000000001'::uuid then 'master_admin' when '99000000-0000-4000-8000-000000000002'::uuid then 'portfolio_manager' end$$;
select set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',false);
insert into public.clients(id,name,plan,onboarding_version,owner_name,owner_email,supabase_url,supabase_anon,shop_url,currency,billing_policy,pairing_mode)
values(9900,'Support handoff','Basic',2,'Reserved owner','owner@example.test','https://dexzxxqkbwnpetbsuxxv.supabase.co','','https://shop.example.test','PKR','usage-v1','managed'),
(9901,'BYO unsupported','Basic',2,'BYO owner','byo@example.test','https://abcdefghijklmnopqrst.supabase.co','','https://byo.example.test','PKR','usage-v1','byo');
select public.platform_provision_begin(9900,'99000000-0000-4000-8000-000000000010','managed-setup','{"site_key":"public-site"}');
select public.platform_onboarding_step('99000000-0000-4000-8000-000000000010','prepare','{}');
select public.platform_onboarding_step('99000000-0000-4000-8000-000000000010','registered','{"source_id":"99000000-0000-4000-8000-000000000003","client_binding":"orbito-client-9900"}');
select public.platform_provision_step('99000000-0000-4000-8000-000000000010','complete','{}');
update public.clients set lifecycle_state='Suspended',status='Suspended' where id=9900;
