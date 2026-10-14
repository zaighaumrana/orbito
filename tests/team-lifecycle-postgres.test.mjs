// Real PG17, real Auth/Vault schemas, synthetic employees only. No hosted URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container || '',/^orbito-bootstrap-[a-z0-9-]+$/);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration='20261010233446_platform_team_lifecycle_v2.sql';
const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
const master='95000000-0000-4000-8000-000000000001',manager='95000000-0000-4000-8000-000000000002',billing='95000000-0000-4000-8000-000000000003',pending='95000000-0000-4000-8000-000000000004',legacy='95000000-0000-4000-8000-000000000005';
const id=n=>'95000000-0000-4000-8000-'+String(n).padStart(12,'0');
const template='orbito_team_v2_template_'+process.pid;
function sql(text,db='postgres',user='postgres',variables=[]){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db,...variables,'-f','-'],{input:text,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(r.error || r.status!==0)throw Error(r.error?.message || r.stderr);return r.stdout.trim();}
const sid=who=>who.slice(0,24)+'1'+who.slice(25);
const asUser=(who,body,session=sid(who))=>`begin;select set_config('request.jwt.claims','${JSON.stringify({sub:who,session_id:session})}',true);select set_config('request.jwt.claim.sub','${who}',true);set local role authenticated;${body};commit;`;
const service=body=>`begin;set local role service_role;${body};commit;`;
const command=(request,action,target=manager,data={})=>`select public.platform_team_command('${master}','${id(request)}','${action}','${target}','${JSON.stringify(data)}'::jsonb,'${sid(master)}')`;
const password=(request,step,proof=null,who=pending)=>`select public.platform_team_password_step('${who}','${id(request)}','${step}','${sid(who)}')`;
function chain(db,selected){for(const f of selected){const body=read('supabase/migrations/'+f);sql(/^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;'+body+'commit;',db);}}
test.before(()=>{
 const dump=spawnSync('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(dump.status,0,dump.stderr);
 sql('create database '+template+' template template0');sql(dump.stdout,template,'supabase_admin');
 sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;create schema storage;create table storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;create policy fixture_existing on storage.objects for select to authenticated using(true);create schema realtime;create table realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;create policy fixture_existing on realtime.messages for select to authenticated using(true);',template);
});
test.after(()=>sql('drop database if exists '+template+' with (force)'));
function fixture(label,work){const db='orbito_team_v2_'+label+'_'+process.pid;sql('create database '+db+' template '+template);try{return work(db);}finally{sql('drop database '+db+' with (force)');}}
function seed(db){sql(`begin;select set_config('platform.team_transition','trusted',true);
 insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${manager}','manager@example.test',now(),'synthetic-hash'),('${billing}','billing@example.test',now(),'synthetic-hash'),('${pending}','pending@example.test',now(),null);
 insert into public.platform_users(id,auth_user_id,name,email,role,status) values('${manager}','${manager}','Manager','manager@example.test','portfolio_manager','Active'),('${billing}','${billing}','Billing','billing@example.test','billing_person','Active'),('${pending}','${pending}','Pending','pending@example.test','portfolio_manager','Pending'),('${legacy}',null,'Legacy','legacy@example.test','billing_person','Inactive');
 insert into auth.sessions(id,user_id,created_at,updated_at) select ('95000000-0000-4000-8000-1'||right(id::text,11))::uuid,id,now(),now() from auth.users;
 insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) select gen_random_uuid(),id,'password',now(),now() from auth.sessions;commit;`,db);}
function fresh(db){assert.match(sql('show server_version',db),/^17\./);chain(db,files);sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());select platform_private.initialize_config('Synthetic Platform','Reviewed fixture');select platform_private.bind_master('${master}',null,'Reviewed fixture');select platform_private.configure_password_verification('${master}',true,'Verified isolated multi-session fixture');`,db);seed(db);}

test('retirement and fresh onboarding preserve UUID tombstones across generations; late migration failure rolls back',()=>fixture('retirement',db=>{
 const forward=files.at(-1);assert.match(forward,/platform_team_retirement_reonboarding/);
 chain(db,files.slice(0,-1));
 const definition=()=>sql("select pg_get_functiondef('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)'::regprocedure)",db);
 const before=definition();assert.throws(()=>sql('begin;'+read('supabase/migrations/'+forward)+'select 1/0;commit;',db),/division by zero/);
 assert.equal(definition(),before);assert.equal(sql("select to_regclass('public.platform_team_archive_email_unique') is not null",db),'t');chain(db,[forward]);
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());select platform_private.initialize_config('Synthetic Platform','Reviewed fixture');select platform_private.bind_master('${master}',null,'Reviewed fixture');select platform_private.configure_password_verification('${master}',true,'Verified isolated multi-session fixture');`,db);seed(db);
 // Retire an unaccepted Pending identity, then retain a dangling legacy UUID.
 sql(service(command(101,'begin_delete',pending)),db);sql(service(command(101,'dispatch_delete',pending)),db);
 assert.throws(()=>sql(service(command(101,'finish_delete',pending)),db),/absence not verified/);
 sql(`delete from auth.users where id='${pending}'`,db);sql(service(command(101,'reconcile_delete',pending)),db);
 assert.throws(()=>sql(asUser(pending,'select public.platform_team_setup_context()'),db),/Verified live Auth/);
 sql(`begin;select set_config('platform.team_transition','trusted',true);update public.platform_users set auth_user_id='${id(999)}' where id='${legacy}';commit;`,db);
 sql(`insert into auth.users(id,email) values('${id(998)}','legacy@example.test')`,db);
 assert.throws(()=>sql(service(command(102,'begin_delete',legacy)),db),/inconsistent Auth identity/);
 sql(`delete from auth.users where id='${id(998)}'`,db);sql(service(command(102,'begin_delete',legacy)),db);sql(service(command(102,'dispatch_delete',legacy)),db);sql(service(command(102,'finish_delete',legacy)),db);
 let predecessor=pending;
 for(const generation of [1,2]){
  const request=110+generation,employee=id(request),authId=id(210+generation),email='pending@example.test';
  const data={name:'Fresh employee',email,role:'billing_person',retired_employee_id:predecessor};
  assert.throws(()=>sql(service(command(request,'begin_create',employee,{...data,retired_employee_id:legacy})),db),/retirement approval/);
  const op=JSON.parse(sql(service(command(request,'begin_create',employee,data)),db));
  assert.equal(sql(service(command(request,'begin_create',employee,data)),db).includes('"new_operation": false'),true);
  assert.throws(()=>sql(service(command(request+30,'begin_create',id(request+30),data)),db),/unique|duplicate/i);
  // A returned existing/unrelated Auth user cannot satisfy the private nonce.
  sql(`insert into auth.users(id,email,email_confirmed_at,created_at,invited_at) values('${authId}','${email}',now(),clock_timestamp(),clock_timestamp())`,db);
  assert.throws(()=>sql(service(command(request,'finish_create',employee,{auth_user_id:authId})),db),/Fresh invitation identity/);
  sql(`update auth.users set raw_user_meta_data=jsonb_build_object('retrasell_invite_nonce','${op.requested.invite_nonce}') where id='${authId}';insert into auth.sessions(id,user_id,created_at,updated_at) values('${sid(authId)}','${authId}',now(),now());insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),'${sid(authId)}','otp',now(),now());`,db);
  sql(service(command(request,'finish_create',employee,{auth_user_id:authId})),db);
  const context=JSON.parse(sql(asUser(authId,'select public.platform_team_setup_context()'),db).split('\n').at(-1));assert.equal(context.kind,'pending');
  for(const step of ['begin','saved','finish'])sql(service(password(310+generation,step,null,authId)),db);
  assert.equal(JSON.parse(sql(asUser(authId,'select public.platform_operator_identity()'),db).split('\n').at(-1)).role,'billing_person');
  assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
  sql(service(command(410+generation,'begin_delete',employee)),db);sql(service(command(410+generation,'dispatch_delete',employee)),db);
  assert.throws(()=>sql(service(command(510+generation,'begin_create',id(510+generation),data)),db),/Auth identity|Invitation identity|unique|duplicate/i);
  sql(`delete from auth.users where id='${authId}'`,db);sql(service(command(410+generation,'reconcile_delete',employee)),db);predecessor=employee;
 }
 assert.equal(sql("select count(*) from public.platform_team_archive where email='pending@example.test'",db),'3');
 assert.throws(()=>sql('update public.platform_team_archive set reason=\'rewritten\'',db),/immutable/);
 assert.equal(sql(`select auth_user_id from platform_private.master_identity`,db),master);
 assert.equal(sql("select count(*) from public.operator_audit where action='platform_team_begin_create' and detail->>'predecessor_employee_id' is not null",db),'2');
}));

test('resend reservation verifies Pending identity, denies employees/inactive targets and blocks competing dispatches',()=>fixture('resend',db=>{
 fresh(db);
 const resend=(step,request=601,target=pending)=>`select public.platform_team_resend_command('${master}','${id(request)}','${target}','${step}','${sid(master)}')`;
 for(const who of [manager,billing])assert.throws(()=>sql(asUser(who,resend('begin')),db),/permission denied/);
 assert.throws(()=>sql(service(resend('begin',602,legacy)),db),/Pending employee/);
 assert.throws(()=>sql(service(resend('begin',603,master)),db),/no rows|Pending employee/);
 sql(service(resend('begin')),db);assert.equal(JSON.parse(sql(service(resend('begin')),db)).new_operation,false);
 assert.throws(()=>sql(service(resend('begin',604)),db),/Outstanding operation/);
 sql(service(resend('dispatch')),db);assert.throws(()=>sql(service(resend('dispatch')),db),/requires reconciliation/);
 assert.equal(JSON.parse(sql(service(resend('finish')),db)).stage,'completed');
 assert.equal(JSON.parse(sql(service(resend('begin')),db)).new_operation,false);
 assert.throws(()=>sql(service(resend('begin',605)),db),/Wait before/);
 // Advance only the fixture's dispatch record to exercise the next legitimate
 // request without sleeping or sending another email.
 sql(`update platform_private.team_operations set created_at=now()-interval '2 minutes' where request_id='${id(601)}'`,db);
 sql(service(resend('begin',606)),db);sql(service(resend('dispatch',606)),db);sql(service(resend('mark_review',606)),db);
 assert.throws(()=>sql(service(resend('begin',607)),db),/Outstanding operation/);
 assert.equal(sql(`select status from public.platform_users where id='${pending}'`,db),'Pending');
 assert.equal(sql(`select auth_user_id from public.platform_users where id='${pending}'`,db),pending);
}));

test('fresh full chain: privilege closure, master/role preservation, missing/null operation fail closed',()=>fixture('fresh',db=>{
 fresh(db);
 sql(`begin;select set_config('platform.team_transition','trusted',true);insert into public.platform_users(id,name,email,role,status) values('${id(9)}','Legacy master alias','master@example.test','billing_person','Inactive');commit;`,db);
 assert.throws(()=>sql(service(command(9,'begin_delete',id(9))),db),/Master account is protected/);
 for(const who of [master,manager,billing])assert.equal(JSON.parse(sql(asUser(who,'select public.platform_operator_identity()'),db).split('\n').at(-1)).auth_user_id,who);
 for(const role of ['anon','authenticated'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal(sql(`select has_table_privilege('${role}','public.platform_users','${privilege}')`,db),'f');
 for(const who of [master,manager,billing]){
  assert.throws(()=>sql(asUser(who,"update public.platform_users set status='Active' where id='"+legacy+"'"),db),/permission denied/);
  assert.throws(()=>sql(asUser(who,'select public.platform_accept_invite()'),db),/permission denied/);
  assert.throws(()=>sql(asUser(who,command(10,'begin_delete')),db),/permission denied/);
  assert.throws(()=>sql(asUser(who,password(10,'saved')),db),/permission denied/);
 }
 assert.throws(()=>sql(service(command(10,'finish_delete')),db),/Auth absence not verified/);
 assert.throws(()=>sql(service(command(11,'finish_create')),db),/Invitation completion not allowed/);
 assert.throws(()=>sql(service(command(12,'issue_recovery')),db),/Unsupported command/);
 assert.throws(()=>sql(asUser(master,'select count(*) from auth.sessions'),db),/permission denied/);
 assert.throws(()=>sql(service(command(15,'begin_delete').replace(sid(master),sid(manager))),db),/Live master session required/);
 assert.throws(()=>sql(service(command(13,'begin_reactivate',legacy)),db),/Linked Auth identity unavailable/);
 assert.throws(()=>sql(service(command(14,'begin_delete').replace(master,billing)),db),/Master administrator required/);
}));

test('role edits use live SQL role on the existing session; employee raw reads obey the forward isolation contract',()=>fixture('role_edit',db=>{
 fresh(db);
 assert.equal(JSON.parse(sql(asUser(manager,'select public.platform_operator_identity()'),db).split('\n').at(-1)).role,'portfolio_manager');
 const before=sql(`select session_not_before from public.platform_users where auth_user_id='${manager}'`,db);
 sql(service(command(81,'begin_edit',manager,{role:'billing_person'})),db);
 sql(service(command(81,'finish_edit',manager)),db);
 assert.equal(sql(`select session_not_before from public.platform_users where auth_user_id='${manager}'`,db),before,'role edits do not introduce a fresh-login contract');
 assert.equal(JSON.parse(sql(asUser(manager,'select public.platform_operator_identity()'),db).split('\n').at(-1)).role,'billing_person','unchanged JWT/session loses the old role immediately');
 assert.throws(()=>sql(asUser(manager,'select public.platform_set_paper(-1,true)'),db),/role|authorized/i,'old Manager mutation must be rejected before target processing');
 for(const who of [manager,billing])for(const table of ['platform_users','billing_cycles','payments','support_tickets'])
  assert.equal(sql(asUser(who,`select count(*) from public.${table}`),db).split('\n').at(-1),'0','employee raw reads are denied at the SQL boundary');
}));

test('staging-style upgrade preserves identities, config and audit; late failure is atomic',()=>fixture('upgrade',db=>{
 chain(db,files.filter(f=>f<'20261008191709'));
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());insert into public.platform_config(id,admin_username) values(1,'existing');create or replace function platform_private.operator_role() returns text language sql stable security definer set search_path='' as $$select case when auth.uid()='${master}'::uuid then 'master_admin' end$$;`,db);
 sql(read('supabase/bootstrap/approve-staging-master.sql'),db,'postgres',['-v','master_uuid='+master,'-v','reason=Reviewed disposable upgrade']);chain(db,['20261008191709_production_bootstrap_hardening.sql']);seed(db);
 const before=sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from public.platform_users u),'config',(select jsonb_agg(to_jsonb(c)) from public.platform_config c),'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.operator_audit a))",db);
 assert.throws(()=>sql('begin;'+read('supabase/migrations/'+migration)+'select 1/0;commit;',db),/division by zero/);
 assert.equal(sql("select to_regclass('public.platform_team_archive') is null",db),'t');
 chain(db,[migration]);
 assert.equal(sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u)-'suspended_from'-'session_not_before' order by id) from public.platform_users u),'config',(select jsonb_agg(to_jsonb(c)) from public.platform_config c),'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.operator_audit a))",db),before);
 assert.equal(sql(asUser(master,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
}));


function suspend(db,request,who=manager){
 sql(service(command(request,'deactivate',who)),db);sql(service(command(request,'dispatch_provider',who)),db);
 sql(`update auth.users set banned_until=now()+interval '100 years' where id='${who}'`,db);
 const receipt=JSON.parse(sql(`select to_json(banned_until) from auth.users where id='${who}'`,db));
 sql(service(command(request,'finish_deactivate',who,{provider_ban:receipt})),db);
}
function restore(db,request,who=manager){
 sql(service(command(request,'begin_reactivate',who)),db);sql(service(command(request,'dispatch_provider',who)),db);
 sql(`update auth.users set banned_until=null where id='${who}'`,db);sql(service(command(request,'finish_reactivate',who)),db);
}
function newSession(db,who){
 const session=id(900);sql(`insert into auth.sessions(id,user_id,created_at,updated_at) values('${session}','${who}',clock_timestamp(),clock_timestamp());insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),'${session}','password',now(),now());`,db);return session;
}
test('retained password/account, permanent old-session denial, fresh password login and Pending-only setup',()=>fixture('sessions',db=>{
 fresh(db);suspend(db,20);
 assert.equal(sql(`select encrypted_password from auth.users where id='${manager}'`,db),'synthetic-hash');
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()'),db),/not authorized/);
 assert.throws(()=>sql(service(password(21,'begin',null,manager)),db),/Pending identity/);
 restore(db,22);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Active');
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()'),db),/not authorized/);
 assert.equal(sql(asUser(manager,"select public.platform_session_status()->>'authorized'"),db).split('\n').at(-1),'false');
 const current=newSession(db,manager);
 assert.equal(sql(asUser(manager,"select public.platform_operator_identity()->>'role'",current),db).split('\n').at(-1),'portfolio_manager');
 assert.equal(sql(asUser(manager,'select count(*) from public.clients',current),db).split('\n').at(-1),'0');
 sql(`delete from auth.sessions where id='${current}'`,db);
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()',current),db),/not authorized/);
 suspend(db,23,pending);restore(db,24,pending);
 assert.equal(sql(`select status from public.platform_users where id='${pending}'`,db),'Pending');
 assert.throws(()=>sql(service(password(25,'begin')),db),/Pending identity/); // old invite session
 const invite=newSession(db,pending);
 const step=x=>password(25,x).replace(sid(pending),invite);
 sql(service(step('begin')),db);assert.throws(()=>sql(service(step('finish')),db),/not authorized/);
 sql(service(step('saved')),db);sql(service(step('finish')),db);
 assert.equal(sql(`select status from public.platform_users where id='${pending}'`,db),'Active');
}));
test('independent bans, provider failures, legacy identities and recovery cannot restore authority',()=>fixture('bans',db=>{
 fresh(db);sql(service(command(30,'deactivate')),db);
 assert.throws(()=>sql(service(command(30,'finish_deactivate')),db),/not verified/);
 sql(service(command(30,'mark_review')),db);assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Inactive');
 assert.throws(()=>sql(service(command(31,'begin_reactivate')),db),/Outstanding operation/);
 suspend(db,32,billing);sql(`update auth.users set banned_until=now()+interval '101 years' where id='${billing}'`,db);
 sql(service(command(33,'begin_reactivate',billing)),db);
 assert.throws(()=>sql(service(command(33,'dispatch_provider',billing)),db),/Independent or changed/);
 assert.equal(sql(`select status from public.platform_users where id='${billing}'`,db),'Inactive');
 assert.throws(()=>sql(service(command(34,'begin_reactivate',legacy)),db),/unavailable/);
 assert.equal(sql(`select count(*) from auth.users where id='${legacy}'`,db),'0');
 assert.throws(()=>sql(service(command(35,'begin_edit',pending,{email:'master@example.test'})),db),/Only Active/);
}));

test('durable delete, partial failure, immutable archive, tombstones and Storage guard',()=>fixture('delete',db=>{
 fresh(db);
 sql(`insert into storage.objects values('${id(90)}','${manager}')`,db);
 assert.throws(()=>sql(service(command(40,'begin_delete')),db),/Storage ownership/);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Active');sql('delete from storage.objects',db);
 sql('alter table storage.objects add column owner_id text',db);
 sql(`insert into storage.objects(id,owner_id) values('${id(90)}','${manager}')`,db);
 assert.throws(()=>sql(service(command(40,'begin_delete')),db),/Storage ownership/);sql('delete from storage.objects',db);
 sql(`create function public.fixture_audit_failure() returns trigger language plpgsql as $$begin if new.action like 'platform_team_%' then raise exception 'Injected audit failure';end if;return new;end$$;create trigger fixture_audit_failure before insert on public.operator_audit for each row execute function public.fixture_audit_failure();`,db);
 assert.throws(()=>sql(service(command(41,'begin_delete')),db),/Injected audit failure/);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Active');
 assert.equal(sql(`select count(*) from platform_private.team_operations where request_id='${id(41)}'`,db),'0');sql('drop trigger fixture_audit_failure on public.operator_audit',db);
 sql(service(command(41,'begin_delete')),db);sql(service(command(41,'dispatch_delete')),db);
 assert.throws(()=>sql(service(command(41,'reconcile_delete',pending)),db),/Conflicting operation identity/);
 assert.throws(()=>sql(service(command(45,'begin_delete')),db),/Outstanding operation/);
 assert.throws(()=>sql(service(command(41,'reconcile_delete').replace(master,billing)),db),/not authorized|required/i);
 assert.equal(sql(`select stage from platform_private.team_operations where request_id='${id(41)}'`,db),'auth_delete_dispatched');
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 assert.throws(()=>sql(service(command(41,'finish_delete')),db),/absence not verified/);
 assert.equal(sql('select count(*) from public.platform_team_archive',db),'0');
 sql(service(command(41,'mark_review')),db);sql(`delete from auth.users where id='${manager}'`,db); // Synthetic stand-in for provider deletion only.
 sql('create trigger fixture_audit_failure before insert on public.operator_audit for each row execute function public.fixture_audit_failure()',db);
 assert.throws(()=>sql(service(command(41,'reconcile_delete')),db),/Injected audit failure/);
 assert.equal(sql('select count(*) from public.platform_team_archive',db),'0');
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Inactive');
 assert.equal(sql(`select stage from platform_private.team_operations where request_id='${id(41)}'`,db),'review_required');
 sql('drop trigger fixture_audit_failure on public.operator_audit',db);
 sql(service(command(41,'reconcile_delete')),db);sql(service(command(41,'reconcile_delete')),db);
 assert.equal(sql(`select count(*) from public.platform_users where id='${manager}'`,db),'0');
 assert.equal(sql('select count(*) from public.platform_team_archive',db),'1');
 assert.equal(sql(asUser(master,'select count(*) from public.platform_team_archive'),db).split('\n').at(-1),'1');
 assert.equal(sql(asUser(billing,'select count(*) from public.platform_team_archive'),db).split('\n').at(-1),'0');
 assert.throws(()=>sql('update public.platform_team_archive set reason=\'changed\'',db),/immutable/);
 assert.throws(()=>sql('delete from public.operator_audit',db),/immutable/i);
 assert.throws(()=>sql(service(command(42,'begin_create',id(42),{name:'New',email:'manager@example.test',role:'billing_person'})),db),/retirement approval required/);
 assert.throws(()=>sql(service(command(43,'begin_reactivate')),db),/live team/);
 assert.throws(()=>sql(asUser(manager,'select public.platform_team_setup_context()'),db),/Verified live Auth/);
 // Null-linked legacy remnants can be archived safely without recreating Auth.
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${id(89)}','legacy@example.test',now())`,db);
 assert.throws(()=>sql(service(command(44,'begin_delete',legacy)),db),/Unlinked Auth identity/);
 sql(`delete from auth.users where id='${id(89)}'`,db);
 sql(service(command(44,'begin_delete',legacy)),db);sql(service(command(44,'dispatch_delete',legacy)),db);sql(service(command(44,'finish_delete',legacy)),db);
 assert.equal(sql('select count(*) from public.platform_team_archive',db),'2');
}));

test('real concurrent same-ID dispatch reservation and conflicting action are serialized',async()=>{
 const db='orbito_team_v2_concurrent_'+process.pid;sql('create database '+db+' template '+template);
 try{
  fresh(db);
  const run=promisify(execFile),args=['exec',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-c'];
  const results=await Promise.all([run('docker',[...args,service(command(50,'begin_delete'))],{windowsHide:true}),run('docker',[...args,service(command(50,'begin_delete'))],{windowsHide:true})]);
  const reserved=results.map(r=>JSON.parse(r.stdout.trim()));assert.equal(reserved.filter(o=>o.new_operation).length,1);
  assert.equal(sql(`select count(*) from platform_private.team_operations where request_id='${id(50)}'`,db),'1');
  assert.throws(()=>sql(service(command(51,'begin_reactivate')),db),/Outstanding operation/);
  assert.throws(()=>sql(service(command(52,'deactivate')),db),/Outstanding operation/);
  // Finish and deactivation share target/advisory locking; either ordering ends Inactive.
  sql(service(password(61,'begin',null,pending)),db);sql(service(password(61,'saved',null,pending)),db);
  const race=await Promise.allSettled([run('docker',[...args,service(password(61,'finish',null,pending))],{windowsHide:true}),run('docker',[...args,service(command(62,'deactivate',pending))],{windowsHide:true})]);
  assert.equal(race[1].status,'fulfilled');
  if(race[0].status==='rejected')assert.match(race[0].reason.stderr,/not authorized|Pending identity/);
  assert.equal(sql(`select status from public.platform_users where id='${pending}'`,db),'Inactive');
  assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 }finally{sql('drop database '+db+' with (force)');}
});

test('runtime custom Auth/team FKs and new Storage ownership block immediately before deletion dispatch',()=>fixture('runtime_fk',db=>{
 fresh(db);sql(`create table public.custom_auth_ref(user_id uuid references auth.users(id) on delete cascade)`,db);
 assert.throws(()=>sql(service(command(70,'begin_delete')),db),/Custom Auth references/);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Active');sql('drop table public.custom_auth_ref',db);
 // Even an extra FK on a real managed Auth table is not an approved native FK.
 sql('alter table auth.identities add column custom_user_ref uuid references auth.users(id) on delete cascade',db,'supabase_admin');
 assert.throws(()=>sql(service(command(70,'begin_delete')),db),/Custom Auth references/);
 sql('alter table auth.identities drop column custom_user_ref',db,'supabase_admin');
 sql(service(command(71,'begin_delete')),db);
 sql('create table public.custom_auth_ref(user_id uuid references auth.users(id) on delete cascade)',db);
 assert.throws(()=>sql(service(command(71,'dispatch_delete')),db),/Custom Auth references/);sql('drop table public.custom_auth_ref',db);
 sql(`insert into storage.objects values('${id(97)}','${manager}')`,db);
 assert.throws(()=>sql(service(command(71,'dispatch_delete')),db),/Storage ownership/);sql('delete from storage.objects',db);
 sql('create table public.custom_team_ref(id uuid references public.platform_users(id))',db);
 assert.throws(()=>sql(service(command(71,'dispatch_delete')),db),/New team references/);sql('drop table public.custom_team_ref',db);
 sql(service(command(71,'dispatch_delete')),db);
 assert.equal(sql(`select stage from platform_private.team_operations where request_id='${id(71)}'`,db),'auth_delete_dispatched');
}));

test('session claims, Storage/Realtime RLS, fresh password AMR and trusted continuity gate fail closed',()=>fixture('boundaries',db=>{
 fresh(db);
 sql("insert into public.clients(name,supabase_url,supabase_anon) values('Synthetic','https://synthetic.invalid','synthetic-public')",db);
 sql(`insert into storage.objects values('${id(99)}',null);insert into realtime.messages values('${id(99)}');`,db);
 for(const relation of ['storage.objects','realtime.messages']){
  assert.equal(sql(asUser(manager,'select count(*) from '+relation),db).split('\n').at(-1),'0');
  assert.equal(sql(asUser(master,'select count(*) from '+relation),db).split('\n').at(-1),'1');
 }
 assert.equal(sql(asUser(manager,'select count(*) from public.clients'),db).split('\n').at(-1),'0');
 assert.equal(JSON.parse(sql(asUser(manager,"select public.platform_read_page('clients')"),db).split('\n').at(-1)).rows.length,1);
 for(const session of ['', 'malformed', sid(billing)])assert.equal(sql(asUser(manager,"select public.platform_session_status()->>'authorized'",session),db).split('\n').at(-1),'false');
 sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${sid(manager)}'`,db);
 assert.equal(sql(asUser(manager,"select public.platform_session_status()->>'authorized'"),db).split('\n').at(-1),'false');
 sql(`update auth.sessions set not_after=null where id='${sid(manager)}'`,db);
 suspend(db,81);restore(db,82);
 for(const relation of ['storage.objects','realtime.messages','public.clients'])assert.equal(sql(asUser(manager,'select count(*) from '+relation),db).split('\n').at(-1),'0');
 const session=newSession(db,manager);sql(`update auth.mfa_amr_claims set authentication_method='otp' where session_id='${session}'`,db);
 assert.equal(sql(asUser(manager,"select public.platform_session_status()->>'authorized'",session),db).split('\n').at(-1),'false');
 assert.equal(sql(asUser(manager,"select public.platform_team_setup_context()->>'kind'",session),db).split('\n').at(-1),'active','New native recovery is setup-only; it grants no ordinary role');
 sql(`update auth.mfa_amr_claims set authentication_method='password' where session_id='${session}'`,db);
 for(const relation of ['storage.objects','realtime.messages'])assert.equal(sql(asUser(manager,'select count(*) from '+relation,session),db).split('\n').at(-1),'0');
 assert.equal(JSON.parse(sql(asUser(manager,"select public.platform_read_page('clients')",session),db).split('\n').at(-1)).rows.length,1);
 sql(`select platform_private.configure_password_verification('${master}',false,'Explicit fixture shutdown')`,db);
 assert.throws(()=>sql(service(command(83,'begin_delete')),db),/continuity is not approved/);
 assert.equal(sql(`select count(*) from platform_private.team_operations where request_id='${id(83)}'`,db),'0');
 for(const role of ['anon','authenticated','service_role'])assert.throws(()=>sql(`begin;set local role ${role};select platform_private.configure_password_verification('${master}',true,'forged');commit;`,db),/permission denied/);
}));
