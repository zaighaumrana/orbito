-- After applying only new checkpoint migrations to the pre-existing UUID master.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end $$;
select pg_temp.assert((select identities=(select jsonb_agg(to_jsonb(u) order by u.id) from auth.users u)
 and alias=(select admin_username from public.platform_config where id=1)
 and role_definition=pg_get_functiondef('platform_private.operator_role()'::regprocedure)
 from platform_private.identity_upgrade_before),'checkpoint preserves Auth users, existing alias and deployed UUID authorization');
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert(public.platform_operator_identity()->>'role'='master_admin'
 and public.platform_operator_identity()->>'auth_user_id'='92000000-0000-4000-8000-000000000001'
 and public.platform_operator_identity()->>'email'='existing-master@example.test'
 and public.platform_operator_identity()->>'username'='existing-alias','existing master works without placeholder email or platform_users row');
insert into public.clients(id,name,supabase_url,supabase_anon,shop_url,currency,onboarding_version,owner_name,owner_email)
 values(9600,'Upgrade fixture','https://abcdefghijklmnopqrst.supabase.co','','https://shop.example.test','PKR',2,'Owner','owner@example.test');
update public.platform_config set admin_username='changed-alias' where id=1;
select pg_temp.assert(public.platform_operator_identity()->>'username'='changed-alias'
 and public.platform_operator_identity()->>'email'='existing-master@example.test','alias change cannot change Auth identity');
do $$ declare denied boolean:=false;begin
 begin update public.platform_config set admin_password='never-a-password';exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert(denied,'historical password column cannot become a browser password store');
end $$;
reset role;
update auth.users set email='changed-master-email@example.test' where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert(public.platform_operator_identity()->>'role'='master_admin'
 and public.platform_operator_identity()->>'email'='changed-master-email@example.test','existing UUID remains master after an authorized Auth email change');
reset role;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.platform_operator_identity();exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert(denied,'historical placeholder email does not grant master on the UUID-authorized upgrade');
 perform pg_temp.assert((select count(*)=0 from public.clients),'placeholder cannot read clients');
end $$;
reset role;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.platform_operator_identity();exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert(denied,'unknown user cannot obtain master identity');
end $$;
reset role;
rollback;
