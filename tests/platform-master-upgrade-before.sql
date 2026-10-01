-- Disposable local upgrade fixture. Synthetic account, never hosted identity.
insert into auth.users(id,email) values
 ('92000000-0000-4000-8000-000000000001','existing-master@example.test'),
 ('92000000-0000-4000-8000-000000000002','platformadmin@retailos.internal'),
 ('92000000-0000-4000-8000-000000000003','unknown@example.test');
insert into public.platform_config(id,admin_username) values(1,'existing-alias');
create or replace function platform_private.operator_role() returns text
language sql stable security definer set search_path='' as $$
 select case when auth.uid()='92000000-0000-4000-8000-000000000001'::uuid then 'master_admin'
 else (select role from public.platform_users where auth_user_id=auth.uid() and status='Active' limit 1) end
$$;
create table platform_private.identity_upgrade_before as select
 (select jsonb_agg(to_jsonb(u) order by u.id) from auth.users u) identities,
 (select admin_username from public.platform_config where id=1) alias,
 pg_get_functiondef('platform_private.operator_role()'::regprocedure) role_definition;
