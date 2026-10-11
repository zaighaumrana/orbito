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
const asUser=(who,body)=>`begin;select set_config('request.jwt.claim.sub','${who}',true);set local role authenticated;${body};commit;`;
const service=body=>`begin;set local role service_role;${body};commit;`;
const command=(request,action,target=manager,data={})=>`select public.platform_team_command('${master}','${id(request)}','${action}','${target}','${JSON.stringify(data)}'::jsonb)`;
const password=(request,step,proof="repeat('a',64)",who=manager)=>`select public.platform_team_password_step('${who}','${id(request)}','${step}',${proof})`;
function chain(db,selected){for(const f of selected){const body=read('supabase/migrations/'+f);sql(/^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;'+body+'commit;',db);}}
test.before(()=>{
 const dump=spawnSync('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(dump.status,0,dump.stderr);
 sql('create database '+template+' template template0');sql(dump.stdout,template,'supabase_admin');
 sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;create schema storage;create table storage.objects(id uuid primary key,owner uuid);',template);
});
test.after(()=>sql('drop database if exists '+template+' with (force)'));
function fixture(label,work){const db='orbito_team_v2_'+label+'_'+process.pid;sql('create database '+db+' template '+template);try{return work(db);}finally{sql('drop database '+db+' with (force)');}}
function seed(db){sql(`begin;select set_config('platform.team_transition','trusted',true);
 insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${manager}','manager@example.test',now(),'synthetic-hash'),('${billing}','billing@example.test',now(),'synthetic-hash'),('${pending}','pending@example.test',now(),null);
 insert into public.platform_users(id,auth_user_id,name,email,role,status) values('${manager}','${manager}','Manager','manager@example.test','portfolio_manager','Active'),('${billing}','${billing}','Billing','billing@example.test','billing_person','Active'),('${pending}','${pending}','Pending','pending@example.test','portfolio_manager','Pending'),('${legacy}',null,'Legacy','legacy@example.test','billing_person','Inactive');commit;`,db);}
function fresh(db){assert.match(sql('show server_version',db),/^17\./);chain(db,files);sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());select platform_private.initialize_config('Synthetic Platform','Reviewed fixture');select platform_private.bind_master('${master}',null,'Reviewed fixture');`,db);seed(db);}

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
 assert.throws(()=>sql(service(command(12,'issue_recovery')),db),/Recovery issue not allowed/);
 assert.throws(()=>sql(service(command(13,'begin_reactivate',legacy)),db),/Linked Auth identity unavailable/);
 assert.throws(()=>sql(service(command(14,'begin_delete').replace(master,billing)),db),/Master administrator required/);
}));

test('staging-style upgrade preserves identities, config and audit; late failure is atomic',()=>fixture('upgrade',db=>{
 chain(db,files.filter(f=>f<'20261008191709'));
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());insert into public.platform_config(id,admin_username) values(1,'existing');create or replace function platform_private.operator_role() returns text language sql stable security definer set search_path='' as $$select case when auth.uid()='${master}'::uuid then 'master_admin' end$$;`,db);
 sql(read('supabase/bootstrap/approve-staging-master.sql'),db,'postgres',['-v','master_uuid='+master,'-v','reason=Reviewed disposable upgrade']);chain(db,['20261008191709_production_bootstrap_hardening.sql']);seed(db);
 const before=sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from public.platform_users u),'config',(select jsonb_agg(to_jsonb(c)) from public.platform_config c),'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.operator_audit a))",db);
 assert.throws(()=>sql('begin;'+read('supabase/migrations/'+migration)+'select 1/0;commit;',db),/division by zero/);
 assert.equal(sql("select to_regclass('public.platform_team_archive') is null",db),'t');
 chain(db,[migration]);
 assert.equal(sql("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u)-'suspended_from' order by id) from public.platform_users u),'config',(select jsonb_agg(to_jsonb(c)) from public.platform_config c),'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.operator_audit a))",db),before);
 assert.equal(sql(asUser(master,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'master_admin');
}));

test('recovery proof and successful password evidence required before Active; old JWT loses authority',()=>fixture('recover',db=>{
 fresh(db);
 // Both assigned roles complete Pending onboarding only after checked password evidence.
 sql(`begin;select set_config('platform.team_transition','trusted',true);update public.platform_users set status='Pending' where id='${billing}';commit;`,db);
 assert.throws(()=>sql(service(password(18,'finish',null,billing)),db),/not authorized/);
 sql(service(password(18,'begin',null,billing)),db);sql(service(password(18,'saved',null,billing)),db);sql(service(password(18,'finish',null,billing)),db);
 assert.equal(sql(asUser(billing,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'billing_person');
 sql(service(command(20,'deactivate')),db);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Inactive');
 assert.equal(sql(`select encrypted_password from auth.users where id='${manager}'`,db),'synthetic-hash');
 assert.throws(()=>sql(asUser(manager,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 sql(service(command(21,'begin_reactivate')),db);sql(service(command(21,'issue_recovery',manager,{proof_digest:'a'.repeat(64)})),db);
 assert.equal(sql(`select status from public.platform_users where id='${manager}'`,db),'Inactive');
 assert.match(sql(asUser(manager,'select public.platform_team_setup_context()'),db),/reactivation_pending.*true/);
 assert.throws(()=>sql(service(password(21,'begin',"repeat('b',64)")),db),/not authorized/);
 assert.throws(()=>sql(service(password(21,'finish')),db),/not authorized/);
 sql(service(password(21,'begin')),db);
 assert.throws(()=>sql(service(password(21,'begin')),db),/not authorized/); // In-flight write cannot be duplicated.
 sql(service(password(21,'saved')),db);sql(service(`select public.platform_accept_invite('${manager}','${id(21)}',repeat('a',64))`),db);
 assert.equal(sql(asUser(manager,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'portfolio_manager');
 assert.throws(()=>sql(service(password(21,'finish')),db),/not authorized/);
 // A formerly Pending user stays restricted until this same verified setup.
 sql(service(command(22,'deactivate',pending)),db);sql(service(command(23,'begin_reactivate',pending)),db);sql(service(command(23,'issue_recovery',pending,{proof_digest:'a'.repeat(64)})),db);
 assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 sql(service(password(23,'begin',"repeat('a',64)",pending)),db);sql(service(password(23,'saved',"repeat('a',64)",pending)),db);sql(service(password(23,'finish',"repeat('a',64)",pending)),db);
 assert.equal(sql(asUser(pending,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'portfolio_manager');
}));

test('expired/revoked setup, legacy identity and provider bans cannot reactivate',()=>fixture('expiry',db=>{
 fresh(db);sql(service(command(30,'deactivate')),db);sql(service(command(31,'begin_reactivate')),db);sql(service(command(31,'issue_recovery',manager,{proof_digest:'a'.repeat(64)})),db);
 sql(`update platform_private.team_operations set expires_at=now()-interval '1 second' where request_id='${id(31)}'`,db);
 assert.throws(()=>sql(service(password(31,'begin')),db),/expired/);
 sql(service(command(32,'deactivate')),db);assert.throws(()=>sql(service(password(31,'begin')),db),/not authorized/);
 sql(`update auth.users set banned_until=now()+interval '1 day' where id='${manager}'`,db);
 assert.throws(()=>sql(service(command(33,'begin_reactivate')),db),/blocked/);
 assert.throws(()=>sql(service(command(34,'begin_reactivate',legacy)),db),/unavailable/);
 assert.equal(sql(`select count(*) from auth.users where id='${legacy}'`,db),'0');
 assert.throws(()=>sql(service(command(35,'begin_edit',billing,{email:'master@example.test'})),db),/unavailable/);
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
 assert.throws(()=>sql(service(command(42,'begin_create',id(42),{name:'New',email:'manager@example.test',role:'billing_person'})),db),/unavailable/);
 assert.throws(()=>sql(service(command(43,'begin_reactivate')),db),/live team/);
 assert.throws(()=>sql(asUser(manager,'select public.platform_team_setup_context()'),db),/Verified Auth/);
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
  if(race[0].status==='rejected')assert.match(race[0].reason.stderr,/not authorized/);
  assert.equal(sql(`select status from public.platform_users where id='${pending}'`,db),'Inactive');
  assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
 }finally{sql('drop database '+db+' with (force)');}
});
