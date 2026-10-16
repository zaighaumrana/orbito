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
const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql') && (!process.env.ORBITO_PR4_BASELINE || f<'20261016')).sort();
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
function fixture(label,work){const db='orbito_team_v2_'+label+'_'+process.pid;sql('create database '+db+' template '+template);let result;try{result=work(db);return result?.then?result.finally(()=>sql('drop database '+db+' with (force)')):result;}finally{if(!result?.then)sql('drop database '+db+' with (force)');}}
function seed(db){sql(`begin;select set_config('platform.team_transition','trusted',true);
 insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${manager}','manager@example.test',now(),'synthetic-hash'),('${billing}','billing@example.test',now(),'synthetic-hash'),('${pending}','pending@example.test',now(),null);
 insert into public.platform_users(id,auth_user_id,name,email,role,status) values('${manager}','${manager}','Manager','manager@example.test','portfolio_manager','Active'),('${billing}','${billing}','Billing','billing@example.test','billing_person','Active'),('${pending}','${pending}','Pending','pending@example.test','portfolio_manager','Pending'),('${legacy}',null,'Legacy','legacy@example.test','billing_person','Inactive');
 insert into auth.sessions(id,user_id,created_at,updated_at) select ('95000000-0000-4000-8000-1'||right(id::text,11))::uuid,id,now(),now() from auth.users;
 insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) select gen_random_uuid(),id,'password',now(),now() from auth.sessions;commit;`,db);}
function fresh(db){assert.match(sql('show server_version',db),/^17\./);chain(db,files);sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());select platform_private.initialize_config('Synthetic Platform','Reviewed fixture');select platform_private.bind_master('${master}',null,'Reviewed fixture');select platform_private.configure_password_verification('${master}',true,'Verified isolated multi-session fixture');`,db);seed(db);}

test('F1 real retirement/new identity/activation accepts unchanged successor email without relaxing collisions',()=>fixture('successor17',db=>{
 fresh(db);
 sql(service(command(110,'begin_delete',pending)),db);sql(service(command(110,'dispatch_delete',pending)),db);
 sql(`delete from auth.users where id='${pending}'`,db);sql(service(command(110,'finish_delete',pending)),db);
 const archive=sql('select jsonb_agg(to_jsonb(a)) from public.platform_team_archive a',db);
 const employee=id(120),who=id(121),data={name:'Fresh successor',email:'pending@example.test',role:'billing_person',retired_employee_id:pending};
 const created=JSON.parse(sql(service(command(120,'begin_create',employee,data)),db));
 sql(`insert into auth.users(id,email,email_confirmed_at,created_at,invited_at,raw_user_meta_data) values('${who}','pending@example.test',now(),clock_timestamp(),clock_timestamp(),jsonb_build_object('retrasell_invite_nonce','${created.requested.invite_nonce}'));
 insert into auth.sessions(id,user_id,created_at,updated_at) values('${sid(who)}','${who}',now(),now());
 insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),'${sid(who)}','otp',now(),now());`,db);
 sql(service(command(120,'finish_create',employee,{auth_user_id:who})),db);
 for(const step of ['begin','saved','finish'])sql(service(password(122,step,null,who)),db);
 for(const [request,values] of [[130,{name:'Renamed successor',email:'pending@example.test'}],[131,{role:'portfolio_manager',email:'PENDING@example.test'}]]){
  sql(service(command(request,'begin_edit',employee,values)),db);sql(service(command(request,'finish_edit',employee)),db);
 }
 assert.equal(sql(`select role from public.platform_users where id='${employee}'`,db),'portfolio_manager');
 sql(`update auth.users set email_confirmed_at=null where id='${who}'`,db);
 assert.throws(()=>sql(service(command(139,'begin_edit',employee,{email:'pending@example.test'})),db),/email is unavailable/,'Archive exception requires confirmed current identity');
 sql(`update auth.users set email_confirmed_at=now() where id='${who}'`,db);

 sql(service(command(132,'begin_edit',manager,{name:'Ordinary renamed',email:'manager@example.test'})),db);sql(service(command(132,'finish_edit',manager)),db);
 assert.throws(()=>sql(service(command(133,'begin_edit',manager,{email:'pending@example.test'})),db),/email is unavailable/);
 assert.throws(()=>sql(service(command(134,'begin_edit',manager,{email:'billing@example.test'})),db),/email is unavailable/);
 sql(`insert into public.platform_team_archive(id,auth_user_id,name,email,role,deleted_by,operation_id) values('${id(500)}','${id(501)}','Other retired identity','retired-only@example.test','billing_person','${master}','${id(502)}')`,db);
 assert.throws(()=>sql(service(command(138,'begin_edit',employee,{email:'retired-only@example.test'})),db),/email is unavailable/);

 assert.throws(()=>sql(service(command(135,'begin_edit',pending,{name:'Retired'})),db));
 assert.throws(()=>sql(service(command(136,'begin_edit',master,{name:'Replace Master'})),db));
 assert.throws(()=>sql(asUser(manager,command(137,'begin_edit',employee,{name:'Unauthorized'})),db),/permission denied/);
 assert.equal(sql(`select jsonb_agg(to_jsonb(a)) from public.platform_team_archive a where id='${pending}'`,db),archive);
}));

function client(db,n=91){sql(`insert into public.clients(id,name,supabase_url,supabase_anon,shop_url,currency,billing_policy,owner_name,owner_email,onboarding_version,pairing_mode) values(${n},'Synthetic client','https://abcdefghijklmnopqrst.supabase.co','','https://trusted-shop.example.test','PKR','usage-v1','Synthetic Owner','owner@example.test',2,'managed');update public.clients set lifecycle_state='Active',infrastructure_state='present' where id=${n};
 insert into platform_private.shop_credentials(client_id,project_ref,client_binding,secret_id,bridge_call_secret_id) values(${n},'abcdefghijklmnopqrst','synthetic-binding',vault.create_secret('synthetic-shop-service'),vault.create_secret('synthetic-bridge-call'));
 insert into public.bridge_sources(source_id,client_id,client_binding,enabled) values('${id(n+600)}',${n},'synthetic-binding',true);
 insert into platform_private.source_credentials(source_id,secret_sha256) values('${id(n+600)}',repeat('f',64));`,db);}
const approve=(n=91,origin='https://trusted-shop.example.test',expected=null)=>`select public.platform_approve_support_destination(${n},'${origin}','abcdefghijklmnopqrst','synthetic-binding','${id(n+600)}',${expected?"'"+expected+"'":'null'},'Explicit fixture origin and pairing approval')`;
const issue=(hash='a',n=91)=>`select public.platform_support_issue(${n},'${master}',repeat('${hash}',64),'zyxwvutsrqponmlkjihg','${sid(master)}')`;
const consume=(hash='a',n=91,project='abcdefghijklmnopqrst',binding='synthetic-binding',source=id(n+600))=>`select public.platform_support_consume(repeat('${hash}',64),repeat('f',64),${n},'${project}','${binding}','${source}')`;

test('F2 protected approval, public URL isolation, direct-role denial and one-use/expiry/pair/reapproval fences',()=>fixture('destination17',db=>{
 fresh(db);client(db);
 sql(asUser(manager,`select public.platform_save_client(91,'{"shop_url":"https://attacker.example.test"}')`),db);
 assert.throws(()=>sql(service(issue()),db),/approved support destination/,'Manager URL cannot receive a capability without approval');
 for(const who of [manager,billing])assert.throws(()=>sql(asUser(who,approve()),db),/not authorized/);
 for(const origin of ['https://trusted-shop.example.test/path','https://trusted-shop.example.test:99999','https://trusted-shop.example.test:443','https://user@trusted-shop.example.test'])assert.throws(()=>sql(asUser(master,approve(91,origin)),db));
 assert.throws(()=>sql(asUser(manager,`insert into platform_private.support_destinations(client_id) values(91)`),db),/permission denied/);
 const approval=JSON.parse(sql(asUser(master,approve()),db).split('\n').at(-1));
 const grant=JSON.parse(sql(service(issue()),db));assert.equal(grant.shop_url,'https://trusted-shop.example.test');assert.equal(grant.destination.revision,approval.revision);
 assert.throws(()=>sql(asUser(manager,issue()),db),/permission denied/);
 assert.equal(JSON.parse(sql(service(consume('a',91,'wrongwrongwrongwrongxx')),db)).ok,false);
 assert.equal(JSON.parse(sql(service(consume('a',91,'abcdefghijklmnopqrst','wrong-binding')),db)).ok,false);
 assert.equal(JSON.parse(sql(service(consume('a',92)),db)).ok,false);
 assert.equal(JSON.parse(sql(service(consume()),db)).ok,true);assert.equal(JSON.parse(sql(service(consume()),db)).ok,false);
 sql(asUser(manager,`select public.platform_save_client(91,'{"shop_url":"https://other.example.test/path"}')`),db);
 assert.equal(JSON.parse(sql(service(issue('b')),db)).shop_url,'https://trusted-shop.example.test');
 sql(`update platform_private.support_grants set issued_at=now()-interval '91 seconds',expires_at=now()-interval '1 second' where token_hash=repeat('b',64)`,db);
 assert.equal(JSON.parse(sql(service(consume('b')),db)).ok,false);
 sql(service(issue('c')),db);sql(asUser(master,approve(91,'https://new-approved.example.test',approval.revision)),db);
 assert.equal(JSON.parse(sql(service(consume('c')),db)).ok,false,'Explicit reapproval invalidates outstanding grants');
 assert.throws(()=>sql(asUser(master,approve()),db),/approval changed/);
 sql(`update public.bridge_sources set client_binding='changed-binding' where client_id=91`,db);assert.throws(()=>sql(service(issue('d')),db),/approved support destination/);
 const review=JSON.parse(sql(asUser(master,'select public.platform_support_destination_review(91)'),db).split('\n').at(-1));
 assert.ok(review.approval.revision,'A stale approval remains available for deliberate Master review');
 assert.throws(()=>sql(asUser(manager,'select public.platform_support_destination_review(91)'),db),/not authorized/);
 sql(`update platform_private.shop_credentials set client_binding='changed-binding' where client_id=91`,db);
 sql(asUser(master,approve(91,'https://new-approved.example.test',review.approval.revision).replace("'synthetic-binding'","'changed-binding'")),db);
 assert.equal(JSON.parse(sql(service(issue('f')),db)).shop_url,'https://new-approved.example.test');

 assert.throws(()=>sql(service(issue('e').replace(sid(master),id(999))),db));
}));

const save=(plan,n=92)=>`select public.platform_save_client(${n},'${JSON.stringify({plan})}')`;
const modules=plan=>({repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:plan!=='Basic',live_tracking_enabled:plan!=='Basic',ems_enabled:plan==='Pro Plus',ems_track_breaks:false});
const begin=(request,plan,n=92)=>`select public.platform_begin_config(${n},'${id(request)}','${JSON.stringify(modules(plan))}')`;
const finish=(request,plan,state='applied')=>`select public.platform_finish_config('${id(request)}','${state}','${JSON.stringify({...modules(plan),suspended:false})}')`;
test('F3 serialized plan/addon intent survives delayed/duplicate/uncertain config and rejects stale payloads',()=>fixture('intent17',db=>{
 fresh(db);client(db,92);
 for(const [first,last,request] of [['Pro','Basic',200],['Basic','Pro',210]]){
  sql(asUser(manager,save(first)),db);assert.equal(JSON.parse(sql(asUser(manager,begin(request,first)),db).split('\n').at(-1)).dispatch,true);
  assert.throws(()=>sql(asUser(master,save(last)),db),/operation unresolved/);
  assert.throws(()=>sql(asUser(billing,'select public.platform_set_rates(92,5,3,true)'),db),/operation unresolved/);
  sql(service(finish(request,first)),db);sql(asUser(master,save(last)),db);
  sql(service(finish(request,first)),db);assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'t','Duplicate old ack cannot satisfy newer intent');
  assert.throws(()=>sql(asUser(manager,begin(request+1,first)),db),/Latest commercial/);
  sql(asUser(manager,begin(request+1,last)),db);sql(service(finish(request+1,last,'uncertain')),db);
  assert.throws(()=>sql(asUser(master,save(first)),db),/operation unresolved/);
  assert.equal(JSON.parse(sql(asUser(manager,begin(request+1,last)),db).split('\n').at(-1)).dispatch,false,'No blind duplicate dispatch');
  sql(`update public.config_jobs set updated_at=now()-interval '2 minutes' where request_id='${id(request+1)}'`,db);
  assert.throws(()=>sql(asUser(master,`select public.platform_config_recovery(92,'${id(request+1)}','close','Explicit fixture recovery reason')`),db),/cannot close blindly/);
  const recovery=JSON.parse(sql(asUser(master,`select public.platform_config_recovery(92,'${id(request+1)}','reconcile','Explicit fixture verified read-back')`),db).split('\n').at(-1));
  sql(service(`select public.platform_config_recovery_finish('${id(request+1)}','${recovery.recovery_id}',null,null)`),db);
  assert.equal(sql(`select state from public.config_jobs where request_id='${id(request+1)}'`,db),'uncertain','Interrupted reconciliation preserves uncertainty');
  sql(service(finish(request+1,last)),db);assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'f');
 }
 sql(asUser(manager,save('Basic')),db);sql(asUser(master,save('Pro')),db);
 assert.throws(()=>sql(asUser(manager,begin(220,'Basic')),db),/Latest commercial/,'A delayed pre-reservation payload cannot replace newer accepted plan');
 sql(asUser(manager,begin(221,'Pro')),db);sql(service(finish(221,'Pro','failed')),db);
 assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'t','Rejected writes retain reconciliation intent');
 sql(asUser(manager,begin(222,'Pro')),db);sql(service(finish(222,'Pro')),db);
 sql(asUser(manager,`select public.platform_begin_config(92,'${id(223)}','{"technician_module_enabled":false}')`),db);sql(service(finish(223,'Basic')),db);
 sql(asUser(manager,`select public.platform_save_client(92,'{"name":"Same plan edit","plan":"Pro"}')`),db);
 assert.equal(sql('select technician_module_enabled from public.clients where id=92',db),'f','Same-plan details preserve custom modules');
 assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'f');
 assert.throws(()=>sql(asUser(billing,begin(224,'Pro')),db),/not authorized/);
 sql(asUser(manager,save('Basic')),db);
 sql(asUser(master,`select public.platform_begin_config(92,'${id(225)}','{"suspended":true}')`),db);
 sql(service(`select public.platform_finish_config('${id(225)}','applied','${JSON.stringify({...modules('Pro'),suspended:true})}')`),db);
 assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'t','Urgent suspension must not erase unsynchronized plan intent');
 assert.equal(JSON.parse(sql(service(`select public.platform_config_finish_result('${id(225)}')`),db)).intent_current,true,'Suspension itself can be verified without declaring plan synchronization');

}));

test('forward 17 upgrade preserves retained rows and rolls back every new object on late SQL failure',()=>fixture('upgrade17',db=>{
 const forward=files.find(f=>f.includes('pr4_security_corrections'));assert.ok(forward);
 chain(db,files.filter(f=>f<forward));sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());select platform_private.initialize_config('Upgrade fixture','Explicit fixture initialization');select platform_private.bind_master('${master}',null,'Explicit fixture master binding');`,db);seed(db);
 const before=sql("select pg_get_functiondef('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)'::regprocedure)",db);
 const count=sql('select count(*) from public.platform_users',db);
 assert.throws(()=>sql('begin;'+read('supabase/migrations/'+forward)+'select 1/0;commit;',db),/division by zero/);
 assert.equal(sql("select pg_get_functiondef('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)'::regprocedure)",db),before);
 assert.equal(sql("select to_regclass('platform_private.support_destinations') is null",db),'t');
 chain(db,[forward]);assert.equal(sql('select count(*) from public.platform_users',db),count);
 assert.equal(sql('select enabled from platform_private.password_verification_policy',db),'f');
 assert.equal(sql("select has_function_privilege('authenticated','platform_private.platform_support_issue_pre17(integer,uuid,text,text,uuid)','execute')",db),'f');
}));

test('F3 two actual concurrent editors serialize through the client lock; stale completion remains uncertain',()=>fixture('concurrent17',async db=>{
 fresh(db);client(db,92);sql(asUser(manager,save('Pro')),db);
 const first=asUser(manager,begin(401,'Pro')).replace(';commit;',';select pg_sleep(1);commit;');
 const exec=promisify(execFile),run=body=>exec('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-c',body],{windowsHide:true});
 const results=await Promise.allSettled([run(first),run(asUser(master,save('Basic')))]);
 // Whichever obtains the lock first, an old payload cannot overwrite accepted intent.
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const current=sql('select plan from public.clients where id=92',db);
 if(current==='Pro'){
  sql(`update public.config_jobs set intent_generation=-1 where request_id='${id(401)}'`,db);
  sql(service(finish(401,'Pro')),db);
  assert.equal(sql(`select state from public.config_jobs where request_id='${id(401)}'`,db),'uncertain');
  assert.equal(JSON.parse(sql(service(`select public.platform_config_finish_result('${id(401)}')`),db)).intent_current,false);
 }else{
  assert.equal(current,'Basic');assert.equal(sql('select entitlements_pending from public.clients where id=92',db),'t');
 }
}));

test('F3 exact frozen journal SQL serializes same-ID recovery and never reapplies an old request after a newer write',()=>fixture('journal17',async db=>{
 // Minimal SQL substrate only; execute the shipped journal wrapper unchanged.
 // This proves its journal invariant, not the complete Shop/provider integration.
 const artifact=JSON.parse(read('supabase/functions/_shared/shop-release.json'));
 const journal=artifact.migrations.find(m=>m.version==='20261003121000');assert.ok(journal);
 sql(`create schema app_private;create table app_private.bridge_config(singleton boolean primary key);insert into app_private.bridge_config values(true);
 create table public.journal_fixture(id integer primary key,technician boolean,applied integer);insert into public.journal_fixture values(1,false,0);
 create function public.bridge_onboarding(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 update public.journal_fixture set technician=(p_payload->'changes'->>'technician_module_enabled')::boolean,applied=applied+1 where id=1;
 select jsonb_build_object('config',jsonb_build_object('technician_module_enabled',technician)) into result from public.journal_fixture where id=1;return result;end $$;`,db);
 sql(journal.sql,db);
 const call=(request,flag)=>`select public.bridge_onboarding('config-write','${JSON.stringify({request_id:id(request),changes:{technician_module_enabled:flag}})}')`;
 const exec=promisify(execFile),run=body=>exec('docker',['exec',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-c',body],{windowsHide:true});
 await Promise.all([run(call(801,true)),run(call(801,true))]);assert.equal(sql('select applied from public.journal_fixture',db),'1');
 sql(call(802,false),db);assert.equal(JSON.parse(sql(call(801,true),db)).config.technician_module_enabled,true,'Original receipt is cached');
 assert.equal(sql('select technician from public.journal_fixture',db),'f','Late old request cannot overwrite newer remote state');
 assert.equal(sql('select applied from public.journal_fixture',db),'2');
 assert.throws(()=>sql(call(801,false),db),/identity conflict/);
}));
