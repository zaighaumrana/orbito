// Opt-in disposable Docker PostgreSQL 17 + real Supabase Auth migrations/Vault.
// No URLs, passwords, hosted project connection or Shop checkout are accepted.
// Missing prerequisites FAIL; nothing is silently skipped or mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,execFile} from 'node:child_process';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container || '',/^orbito-bootstrap-[a-z0-9-]+$/,'Set ORBITO_BOOTSTRAP_TEST_CONTAINER to the isolated test container');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration='20261008191709_production_bootstrap_hardening.sql';
const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
function sql(query,database='postgres',variables=[],user='postgres'){
 const result=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',database,...variables,'-f','-'],{input:query,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 if(result.error || result.status!==0)throw Error(result.error?.message || result.stderr.trim());
 return result.stdout.trim();
}
const assertSql=`create function pg_temp.check_test(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end$$;`;
const template='orbito_bootstrap_template_'+process.pid;
test.before(()=>{
 // Provider background workers keep postgres busy. Copy only REAL infrastructure
 // schemas into an idle template; no customer/Auth/audit data is copied.
 const dump=spawnSync('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 assert.equal(dump.status,0,dump.stderr);
 sql('create database '+template+' template template0');
 sql(dump.stdout,template,[],'supabase_admin');
 sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;',template);
 if(sql("select count(*) from pg_publication where pubname='supabase_realtime'",template)==='0')sql('create publication supabase_realtime',template);
});
test.after(()=>sql('drop database if exists '+template+' with (force)'));
const check=(database,expression)=>assert.equal(sql('select '+expression,database),'t');
function chain(database,selected=files){
 for(const file of selected){
  const body=read('supabase/migrations/'+file);
  // Match one transaction per migration; historical BEGIN/COMMIT stay unchanged.
  const explicit=/^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim());
  try{sql(explicit?body:'begin;\n'+body+'\ncommit;',database);}catch(error){throw Error(file+': '+error.message);}
 }
}
async function fixture(label,work){
 const database='orbito_bootstrap_'+label+'_'+process.pid;
 sql('create database '+database+' template '+template);
 try{return await work(database);}finally{sql('drop database '+database+' with (force)');}
}
const admin='93000000-0000-4000-8000-000000000001',placeholder='93000000-0000-4000-8000-000000000002',manager='93000000-0000-4000-8000-000000000003',replacement='93000000-0000-4000-8000-000000000004';
const identities=`insert into auth.users(id,email,email_confirmed_at) values('${admin}','intended@example.test',now()),('${placeholder}','platformadmin@retailos.internal',now()),('${manager}','manager@example.test',now()),('${replacement}','replacement@example.test',now());`;
const asUser=(id,body)=>`begin; select set_config('request.jwt.claim.sub','${id}',true); set local role authenticated; ${body}; commit;`;
const approval=(database,id)=>sql(read('supabase/bootstrap/approve-staging-master.sql'),database,['-v','master_uuid='+id,'-v','reason=Reviewed disposable staging continuity']);

test('real PostgreSQL 17/Supabase prerequisites and fresh full chain fail closed until initialization/binding',()=>fixture('fresh',db=>{
 assert.match(sql('show server_version',db),/^17\./);
 sql(read('supabase/bootstrap/preflight.sql')+read('supabase/bootstrap/fresh-preflight.sql'),db);
 chain(db);check(db,'(select count(*)=0 from public.clients) and (select count(*)=0 from public.platform_config) and (select count(*)=0 from platform_private.master_identity)');
 sql(identities,db);
 assert.throws(()=>sql(asUser(placeholder,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 assert.throws(()=>sql(`select platform_private.bind_master('${admin}',null,'Reviewed bootstrap attempt')`,db),/Initialize platform_config/);
 sql("select platform_private.initialize_config('Production test','Reviewed disposable bootstrap')",db);
 sql(`select platform_private.bind_master('${admin}',null,'Reviewed disposable bootstrap')`,db);
 check(db,`(select admin_password is null from public.platform_config where id=1)`);
 assert.equal(sql(asUser(admin,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
 sql(read('supabase/bootstrap/validate.sql'),db);
 assert.throws(()=>sql(`begin;delete from public.platform_config;select set_config('request.jwt.claim.sub','${admin}',true);set local role authenticated;select public.platform_operator_identity()`,db),/Operator not authorized/);
 assert.throws(()=>sql(asUser(placeholder,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 check(db,"not exists(select 1 from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) like '%platformadmin@%')");
 check(db,"not has_column_privilege('authenticated','public.platform_config','admin_password','SELECT')");
}));

test('bootstrap retries, verified UUIDs, governed rebinding and API privilege denials',()=>fixture('binding',db=>{
 chain(db);sql(identities,db);
 sql("select platform_private.initialize_config('Alias','Reviewed disposable bootstrap'); select platform_private.initialize_config('Alias','Reviewed disposable retry')",db);
 sql(`select platform_private.bind_master('${admin}',null,'Reviewed disposable bootstrap'); select platform_private.bind_master('${admin}',null,'Reviewed disposable retry')`,db);
 check(db,"(select count(*)=1 from public.operator_audit where action='master_identity_bound') and (select count(*)=1 from public.operator_audit where action='platform_configuration_initialized')");
 assert.throws(()=>sql("select platform_private.initialize_config('Different','Reviewed disposable retry')",db),/already initialized/);
 assert.throws(()=>sql(`select platform_private.bind_master('${replacement}',null,'Unauthorized rebinding attempt')`,db),/expected previous UUID/);
 sql(`update auth.users set email_confirmed_at=null where id='${replacement}'`,db);
 assert.throws(()=>sql(`select platform_private.bind_master('${replacement}','${admin}','Reviewed replacement attempt')`,db),/confirmed/);
 sql(`update auth.users set email_confirmed_at=now(),is_anonymous=true where id='${replacement}'`,db);
 assert.throws(()=>sql(`select platform_private.bind_master('${replacement}','${admin}','Reviewed replacement attempt')`,db),/non-anonymous/);
 sql(`update auth.users set is_anonymous=false where id='${replacement}'`,db);
 sql(`update auth.users set deleted_at=now() where id='${replacement}'`,db);
 assert.throws(()=>sql(`select platform_private.bind_master('${replacement}','${admin}','Reviewed deleted replacement denial')`,db),/enabled Auth UUID/);
 sql(`update auth.users set deleted_at=null where id='${replacement}'`,db);
 assert.throws(()=>sql(`delete from auth.users where id='${admin}'`,db),/master_identity_auth_user_id_fkey/);
 sql(read('supabase/bootstrap/validate.sql'),db);
 // Each SQL privilege has different behavior; verify the validator rejects
 // actual grants that its former SELECT/INSERT/UPDATE/DELETE check missed.
 for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
  assert.throws(()=>sql('begin;grant '+privilege+' on platform_private.master_identity to service_role;'+read('supabase/bootstrap/validate.sql'),db),/Unexpected bootstrap privilege/);
 assert.throws(()=>sql('begin;grant references(auth_user_id) on platform_private.master_identity to service_role;'+read('supabase/bootstrap/validate.sql'),db),/Unexpected bootstrap column privilege/);
 assert.throws(()=>sql('begin;alter table platform_private.master_identity owner to supabase_admin;set local role postgres;'+read('supabase/bootstrap/validate.sql'),db,[],'supabase_admin'),/protected table ownership/);
 assert.throws(()=>sql('begin;alter function platform_private.bind_master(uuid,uuid,text) owner to supabase_admin;set local role postgres;'+read('supabase/bootstrap/validate.sql'),db,[],'supabase_admin'),/bootstrap function ownership/);
 assert.throws(()=>sql('begin;alter function platform_private.bind_master(uuid,uuid,text) security definer;'+read('supabase/bootstrap/validate.sql'),db),/bootstrap function ownership\/security/);
 assert.throws(()=>sql('begin;grant execute on function platform_private.initialize_config(text,text) to public;'+read('supabase/bootstrap/validate.sql'),db),/Unexpected bootstrap privilege/);
 for(const role of ['anon','authenticated','service_role']){
  check(db,`not has_function_privilege('${role}','platform_private.bind_master(uuid,uuid,text)','EXECUTE') and not has_function_privilege('${role}','platform_private.initialize_config(text,text)','EXECUTE') and not has_table_privilege('${role}','platform_private.master_identity','INSERT,UPDATE,DELETE')`);
  assert.throws(()=>sql(`set role ${role};select platform_private.bind_master('${replacement}','${admin}','Unauthorized assignment attempt')`,db),/permission denied/);
  assert.throws(()=>sql(`set role ${role};select platform_private.initialize_config('Unauthorized','Unauthorized config assignment')`,db),/permission denied/);
  assert.throws(()=>sql(`set role ${role};truncate platform_private.master_identity`,db),/permission denied/);
 }
 // The existing role constraint rejects a fake master row even from a trusted
 // fixture writer; email and platform_users do not assign the private binding.
 assert.throws(()=>sql(`insert into public.platform_users(auth_user_id,name,email,role,status) values('${placeholder}','Spoofed master','platformadmin@retailos.internal','master_admin','Active')`,db),/platform_users_role_check/);
 sql(`insert into public.platform_users(auth_user_id,name,email,role,status) values('${manager}','Manager','manager@example.test','portfolio_manager','Active')`,db);
 assert.equal(sql(asUser(manager,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'portfolio_manager');
 sql(`update auth.users set deleted_at=now() where id='${manager}'`,db);
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 sql(`update auth.users set deleted_at=null where id='${manager}';update auth.users set deleted_at=now() where id='${admin}'`,db);
 for(const id of [admin,manager])assert.throws(()=>sql(asUser(id,'select public.platform_client_operations(123)'),db),/Operator not authorized/);
 sql(`update auth.users set deleted_at=null where id='${admin}'`,db);
 assert.equal(sql(asUser(manager,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'portfolio_manager');
 assert.throws(()=>sql(asUser(placeholder,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 for(const id of [placeholder,manager]){
  for(const command of ["select public.platform_client_lifecycle(123,'archive','Unauthorized archived test',null)","select public.platform_provision_begin(123,gen_random_uuid(),'managed-setup','{}')","select public.platform_config_recovery(123,gen_random_uuid(),'close','Unauthorized recovery test')"])
   assert.throws(()=>sql(asUser(id,command),db),/Operator not authorized/);
 }
 assert.throws(()=>sql("set role authenticated;select public.platform_client_lifecycle(123,'archive','Unauthenticated denial',null)",db),/Operator not authorized/);
 assert.throws(()=>sql(asUser(manager,"update public.platform_config set admin_username='takeover';insert into platform_private.master_identity(auth_user_id,bound_by_database_role) values(gen_random_uuid(),'authenticated')"),db),/permission denied/);
 sql(`select platform_private.bind_master('${replacement}','${admin}','Reviewed governed replacement'); select platform_private.bind_master('${replacement}','${admin}','Reviewed replacement retry')`,db);
 assert.throws(()=>sql(asUser(admin,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 check(db,"(select revision=2 from platform_private.master_identity) and (select count(*)=1 from public.operator_audit where action='master_identity_rebound')");
 sql(`update auth.users set banned_until=now()+interval '1 day' where id='${replacement}'`,db);
 assert.throws(()=>sql(asUser(replacement,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 assert.throws(()=>sql(asUser(manager,'select public.platform_client_operations(123)'),db),/Operator not authorized/);
 sql(`update auth.users set banned_until=null where id='${replacement}'`,db);
 assert.equal(sql(asUser(manager,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'portfolio_manager');
}));

test('staging-style UUID upgrade requires explicit approval and preserves identity/data atomically',()=>fixture('upgrade',db=>{
 chain(db,files.filter(f=>f<migration));
 sql(read('tests/platform-master-upgrade-before.sql'),db);
 // This is a synthetic existing staging UUID, never the real production master.
 const old='92000000-0000-4000-8000-000000000001';
 sql("insert into public.clients(id,name,supabase_url,supabase_anon) values(9650,'Retained staging record','https://abcdefghijklmnopqrst.supabase.co','')",db);
 const before=sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),'clients',(select jsonb_agg(to_jsonb(c) order by id) from public.clients c),'alias',(select admin_username from public.platform_config where id=1))",db);
 assert.throws(()=>chain(db,[migration]),/reviewed staging master approval/);
 check(db,"to_regclass('platform_private.master_identity') is null");
 assert.equal(sql(asUser(old,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
 assert.throws(()=>approval(db,'92000000-0000-4000-8000-000000000002'),/not the existing master/);
 approval(db,old);approval(db,old);
 assert.throws(()=>sql('begin;'+read('supabase/migrations/'+migration)+'\nselect 1/0;commit;',db),/division by zero/);
 check(db,"to_regclass('platform_private.master_identity') is null and exists(select 1 from platform_private.master_bootstrap_approval)");
 chain(db,[migration]);
 assert.equal(sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),'clients',(select jsonb_agg(to_jsonb(c) order by id) from public.clients c),'alias',(select admin_username from public.platform_config where id=1))",db),before);
 check(db,`(select auth_user_id='${old}' from platform_private.master_identity) and not exists(select 1 from platform_private.master_bootstrap_approval)`);
 assert.equal(sql(asUser(old,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
 assert.throws(()=>sql(asUser('92000000-0000-4000-8000-000000000002','select public.platform_operator_identity()'),db),/Operator not authorized/);
 sql(read('tests/platform-master-upgrade.sql'),db);
 sql(`update auth.users set email='updated@example.test' where id='${old}'`,db);
 assert.equal(sql(asUser(old,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
 check(db,"(select admin_password is null from public.platform_config where id=1)");
}));

test('preflight rejects missing real prerequisites and baseline trigger collisions',()=>fixture('preflight',db=>{
 for(const [change,message] of [["drop extension pgcrypto cascade",/pgcrypto/],["drop extension supabase_vault cascade",/Vault/],["drop publication supabase_realtime",/publication/],["alter table auth.users rename column email_confirmed_at to unavailable",/Auth prerequisite/],["alter role service_role nobypassrls",/BYPASSRLS/],["alter role service_role rename to unavailable_service_role",/Missing Supabase role/]]){
  assert.throws(()=>sql('begin;'+change+';set local role postgres;'+read('supabase/bootstrap/preflight.sql'),db,[],'supabase_admin'),message);
 }
 sql('begin;create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();commit;',db);
 assert.throws(()=>sql(read('supabase/bootstrap/fresh-preflight.sql'),db),/collision/);
}));

test('concurrent trusted initial binding has one winner and one immutable binding audit',()=>fixture('race',async db=>{
 chain(db);sql(identities,db);sql("select platform_private.initialize_config('Alias','Reviewed race fixture')",db);
 const attempt=id=>new Promise((resolve,reject)=>{
  const child=execFile('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],{windowsHide:true},(error,stdout,stderr)=>error?reject(Error(stderr)):resolve());
  child.stdin.end(`begin;select pg_advisory_xact_lock(713901,1);select pg_sleep(0.2);select platform_private.bind_master('${id}',null,'Reviewed concurrent binding');commit;`);
 });
 const outcomes=await Promise.allSettled([attempt(admin),attempt(replacement)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/expected previous UUID/);
 check(db,"(select count(*)=1 from platform_private.master_identity) and (select count(*)=1 from public.operator_audit where action='master_identity_bound')");
}));

test('actual lifecycle/provisioning/support SQL continues through the new UUID binding',()=>fixture('behavior',db=>{
 chain(db);
 for(const fixture of ['onboarding-v2.sql','manual-owner-activation.sql','onboarding-stabilization.sql','control-plane.sql','currencies-boundaries.sql','platform-overhaul.sql','support-access.sql'])sql(read('tests/'+fixture),db);
 sql('begin;'+read('tests/support-handoff.sql')+assertSql+`
 set local role service_role;
 select public.platform_support_issue(9900,'99000000-0000-4000-8000-000000000001',repeat('a',64),'abcdefghijklmnopqrst');
 do $$begin
  begin perform public.platform_support_issue(9900,'99000000-0000-4000-8000-000000000002',repeat('b',64),'abcdefghijklmnopqrst');raise exception 'Manager accepted';exception when insufficient_privilege then null;end;
 end $$;
 select pg_temp.check_test((public.platform_support_consume(repeat('a',64),sc.secret_sha256,9900,s.project_ref,s.client_binding,b.source_id)->>'ok')::boolean,'bound master support exchange') from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900;
 select pg_temp.check_test(not (public.platform_support_consume(repeat('a',64),sc.secret_sha256,9900,s.project_ref,s.client_binding,b.source_id)->>'ok')::boolean,'grant replay denied') from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900;
 select public.platform_support_issue(9900,'99000000-0000-4000-8000-000000000001',repeat('c',64),'abcdefghijklmnopqrst');
 reset role;
 insert into auth.users(id,email,email_confirmed_at) values('99000000-0000-4000-8000-000000000004','replacement-master@example.test',now());
 select platform_private.bind_master('99000000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000001','Reviewed outstanding support grant revocation');
 set local role service_role;
 select pg_temp.check_test(not (public.platform_support_consume(repeat('c',64),sc.secret_sha256,9900,s.project_ref,s.client_binding,b.source_id)->>'ok')::boolean,'outstanding former-master grant denied') from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900;
 do $$begin
  begin perform public.platform_support_issue(9900,'99000000-0000-4000-8000-000000000001',repeat('d',64),'abcdefghijklmnopqrst');raise exception 'Former master accepted';exception when insufficient_privilege then null;end;
 end $$;
 select public.platform_support_issue(9900,'99000000-0000-4000-8000-000000000004',repeat('e',64),'abcdefghijklmnopqrst');
 select pg_temp.check_test((public.platform_support_consume(repeat('e',64),sc.secret_sha256,9900,s.project_ref,s.client_binding,b.source_id)->>'ok')::boolean,'replacement-master grant remains usable') from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900;
 reset role;
 select pg_temp.check_test((select consumed_at is null from platform_private.support_grants where token_hash=repeat('c',64)),'denied old grant not consumed');
 select pg_temp.check_test(exists(select 1 from public.operator_audit where action='support_grant_failed' and detail->>'reason'='actor_revoked'),'canonical actor revocation recorded');
 rollback;`,db);
}));
