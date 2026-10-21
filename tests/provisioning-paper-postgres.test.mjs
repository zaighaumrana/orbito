import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {migrationEnvelope,planMigrations,runByoRelease} from '../../Orbitoshopv2-v1/scripts/byo-support-release.mjs';
import {guardedInvoke} from '../../Orbitoshopv2-v1/scripts/setup-byo.mjs';
import {managedMigrationQuery} from '../supabase/functions/_shared/managed-setup.ts';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container||'',/^orbito-bootstrap-team-[a-f0-9]{16}$/);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const release=JSON.parse(read('supabase/releases/shop-release-support-v2.json'));
const prefix='stabilize_'+process.pid,platform=prefix+'_platform',shop=prefix+'_shop',existing=prefix+'_existing',ambiguous=prefix+'_ambiguous',installer=prefix+'_installer';
const master='96000000-0000-4000-8000-000000000001',owner='97000000-0000-4000-8000-000000000001',source='98000000-0000-4000-8000-000000000001';
const request=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16e6,timeout:120000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=(q,db=shop,user='postgres')=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',db,'-f','-'],q);
const json=(q,db=shop)=>JSON.parse(sql(q,db).split('\n').findLast(l=>l.startsWith('{')||l.startsWith('[')));
const lit=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const service=q=>'begin;set local role service_role;'+q+';commit;';
const user=(id,q)=>`begin;select set_config('request.jwt.claim.sub','${id}',true);select set_config('request.jwt.claims','{"sub":"${id}","session_id":"${id}","role":"authenticated"}',true);set local role authenticated;${q};commit;`;
const concurrentSql=q=>new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',platform,'-f','-'],{windowsHide:true});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out.split('\n').findLast(l=>l.startsWith('{')))):reject(Error(err.slice(-500))));child.stdin.end(q)});
const migrations=repo=>readdirSync(new URL('../'+repo+'supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
test.before(()=>{
 const dump=run(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault']);
 for(const db of [platform,shop,existing,ambiguous,installer]){
  sql('create database '+db+' template template0','postgres');sql(dump,db,'supabase_admin');
  sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;create schema storage;create table storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;create schema realtime;create table realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;',db);
 }
 for(const f of migrations(''))sql(read('supabase/migrations/'+f),platform);
});
test.after(()=>{for(const db of [platform,shop,existing,ambiguous,installer])sql('drop database if exists '+db+' with (force)','postgres');});
test('actual frozen 34-migration wrapper, interrupted exact-prefix resume, managed wrapper parity, atomic rollback and duplicate/source conflict',()=>{
 for(const m of release.migrations.slice(0,8))sql(migrationEnvelope(m));
 const history=json('select jsonb_agg(h order by version) from supabase_migrations.schema_migrations h');
 assert.equal(planMigrations(history,release,'fresh',100).length,26);
 for(const m of planMigrations(history,release,'fresh',100))sql(migrationEnvelope(m));
 assert.deepEqual(json('select json_build_object(\'version\',onboarding_version,\'completed\',onboarding_completed_at is not null,\'name\',shop_name) from public.shop_config'),{version:0,completed:false,name:'Your Business'});
 for(const m of release.migrations)sql(managedMigrationQuery(m),existing);
 assert.equal(sql('select onboarding_completed_at is null from public.shop_config',existing),'t');
 sql(migrationEnvelope(release.migrations.at(-1)));assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'),'34');
 assert.throws(()=>sql(migrationEnvelope({...release.migrations.at(-1),name:'conflict'})),/Migration source conflict/);
 const broken={version:'99999999999999',name:'rollback_fixture',sql:"create table public.rollback_fixture(id int);do $$begin raise exception 'fixture interruption';end$$;"};broken.sha256=createHash('sha256').update(broken.sql).digest('hex');
 assert.throws(()=>sql(migrationEnvelope(broken)),/fixture interruption/);
 assert.equal(sql("select to_regclass('public.rollback_fixture') is null and not exists(select 1 from supabase_migrations.schema_migrations where version='99999999999999')"),'t');
});
test('forward guard preserves initialized customer state and rejects timestamp ambiguity; pristine owner reservation, activation and six-step completion remain canonical',()=>{
 const extra=migrations('../Orbitoshopv2-v1/').filter(f=>f.split('_')[0]>release.migrations.at(-1).version);
 sql("update public.shop_config set shop_name='Customer saved brand',onboarding_completed_at='2025-01-01',onboarding_version=2 where id=1",existing);
 sql(`insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${owner}','existing-owner@example.test',now(),'synthetic-existing-password');insert into public.app_users(auth_user_id,email,display_name,role,status) values('${owner}','existing-owner@example.test','Existing Owner','Business Owner','Active');`,existing);
 const before=sql('select row_to_json(sc) from public.shop_config sc',existing);
 const ownerSnapshot=sql('select row_to_json(u) from auth.users u;select row_to_json(a) from public.app_users a',existing);
 for(const f of extra){const q=read('../Orbitoshopv2-v1/supabase/migrations/'+f);sql(q);sql(q,existing);}
 assert.equal(sql('select row_to_json(sc) from public.shop_config sc',existing),before);
 assert.equal(sql('select row_to_json(u) from auth.users u;select row_to_json(a) from public.app_users a',existing),ownerSnapshot);
 assert.equal(json(service('select public.fresh_shop_initialization_context()')).pending,true);
 assert.equal(json(service('select public.fresh_shop_initialization_context()'),existing).pending,false);
 sql("begin;update public.shop_config set onboarding_completed_at=now();do $$begin if (public.fresh_shop_initialization_context()->>'pending')::boolean then raise exception 'unsafe';end if;end$$;rollback;");
 sql(read('../Orbitoshopv2-v1/tests/onboarding-stabilization.sql'));
 const p={request_id:request(1),platform_client_id:42,client_binding:'orbito-client-42',business_name:'Synthetic Shop',owner_name:'Synthetic Owner',owner_email:'owner@example.test',billing_currency:'PKR',shop_url:'https://shop.example.test',modules:{repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:false,live_tracking_enabled:false,ems_enabled:false,ems_track_breaks:false},paper_resupply_enabled:true,onboarding_version:2};
 sql(service(`select public.bridge_onboarding('reserve',${lit(p)})`));sql(service(`select public.bridge_onboarding('reserve',${lit(p)})`));
 assert.throws(()=>sql(service(`select public.bridge_onboarding('reserve',${lit({...p,owner_email:'forged@example.test'})})`)),/Conflicting/);
 sql(`insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${owner}','owner@example.test',now(),'fixture-only');insert into auth.sessions(id,user_id,created_at) values('${owner}','${owner}',now());`);
 sql(user(owner,'select public.activate_reserved_owner()'));
 sql("update public.shop_config set shop_address='Test address',shop_phone='123',shop_email='business@example.test',tax_rate=0 where id=1;");
 sql(service(`select public.set_override_pin('4829');select public.complete_shop_onboarding('${owner}')`));
 assert.equal(json(service('select public.support_ticket_installation_context()')).ready,true);
});
test('real simultaneous migration attempts converge under the advisory lock without duplicate execution',async()=>{
 const m={version:'99999999999998',name:'local_concurrency_fixture',sql:'create table public.local_concurrency_fixture(id integer primary key);insert into public.local_concurrency_fixture values(1);select pg_sleep(0.4);'};m.sha256=createHash('sha256').update(m.sql).digest('hex');
 const execute=()=>new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',existing,'-f','-'],{windowsHide:true});let err='';child.stderr.on('data',b=>err+=b);child.stdout.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(err.slice(-1000))));child.stdin.end(migrationEnvelope(m));});
 await Promise.all([execute(),execute()]);assert.equal(sql('select count(*) from public.local_concurrency_fixture',existing),'1');assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='99999999999998'",existing),'1');
});
test('differential reproduction: a pre-existing Auth identity makes the pristine predicate preserve completion; no automatic repair is safe',()=>{
 for(const m of release.migrations){
  if(m.name==='onboarding_v2')sql(`insert into auth.users(id,email,email_confirmed_at) values('${request(91)}','preexisting@example.test',now());`,ambiguous);
  sql(migrationEnvelope(m),ambiguous);
 }
 assert.equal(sql('select onboarding_completed_at is not null from public.shop_config',ambiguous),'t');
 const p={request_id:request(92),platform_client_id:42,client_binding:'orbito-client-42',business_name:'Synthetic Shop',owner_name:'Synthetic Owner',owner_email:'owner@example.test',billing_currency:'PKR',shop_url:'https://shop.example.test',modules:{repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:false,live_tracking_enabled:false,ems_enabled:false,ems_track_breaks:false},paper_resupply_enabled:true,onboarding_version:2};
 assert.throws(()=>sql(service(`select public.bridge_onboarding('reserve',${lit(p)})`),ambiguous),/Shop is initialized or owner conflicts/);
 const guard=migrations('../Orbitoshopv2-v1/').find(f=>f.endsWith('_fresh_initialization_guard.sql'));sql(read('../Orbitoshopv2-v1/supabase/migrations/'+guard),ambiguous);
 assert.equal(json(service('select public.fresh_shop_initialization_context()'),ambiguous).pending,false);assert.equal(sql('select count(*) from auth.users',ambiguous),'1');
});
test('real BYO core and native SQL: full candidate install, unknown function fence, retained secrets and explicit provider reconciliation',async()=>{
 const candidate=JSON.parse(read('supabase/releases/shop-release-support-v3.json')),dir=mkdtempSync(join(tmpdir(),'retrasell-native-byo-')),pair=join(dir,'pair.env'),runtime=join(dir,'runtime.env'),ref='abcdefghijklmnopqrst',writes=[];
 writeFileSync(pair,`# orbito-project-ref: ${ref}\n# orbito-client-id: 42\nPLATFORM_BRIDGE_CALL_SECRET=${'a'.repeat(64)}\nPLATFORM_BRIDGE_SOURCE_SECRET=${'b'.repeat(64)}\nPLATFORM_BRIDGE_ENDPOINT=https://qrstabcdefghijklmnop.supabase.co/functions/v1/platform-bridge\n`);writeFileSync(runtime,'TURNSTILE_SECRET=synthetic-private\n');
 const journal={state:'Installing',steps:{}};let fail=true;
 const invoke=argv=>{
  if(argv[0]==='--version')return '2.120.0';if(argv.includes('--help'))return '--use-api --env-file';if(argv[0]==='projects')return JSON.stringify([{id:ref}]);
  if(argv[0]==='db'){
   assert.deepEqual(argv.slice(0,5),['db','query','--linked','--project-ref',ref]);assert.deepEqual(argv.slice(-2),['--output-format','json']);
   const q=readFileSync(argv[argv.indexOf('--file')+1],'utf8');
   if(q.startsWith('select'))return sql(`select coalesce(jsonb_agg(result),'[]'::jsonb) from (${q}) result`,installer);
   sql(q,installer);return '[]';
  }
  writes.push(argv.slice(0,3).join(':'));if(argv[0]==='functions'&&argv[2]==='login'&&fail){fail=false;throw Error('unknown local deployment fixture');}return '';
 };
 const guarded=guardedInvoke(journal,()=>{},invoke);
 const args=['--phase','install','--mode','fresh','--project-ref',ref,'--release-sha',candidate.sha256,'--pairing-file',pair,'--runtime-file',runtime,'--cli',join(dir,'supabase.exe'),'--apply'];
 const checks=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'];
 const deps={release:candidate,invoke:guarded,report:()=>{},fetch:async()=>Response.json({contract:'orbito-onboarding-runtime-v1',checks:Object.fromEntries(checks.map(k=>[k,true]))})};
 try{
  await assert.rejects(()=>runByoRelease(args,deps),/Outcome unknown/);assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',installer),'36');
  const before=writes.length;await assert.rejects(()=>runByoRelease(args,deps),/Needs intervention/);assert.equal(writes.length,before);
  journal.steps['functions:login']='passed';await runByoRelease(args,deps);
  assert.equal(writes.filter(s=>s.startsWith('secrets:')).length,2);assert.equal(sql('select onboarding_completed_at is null from public.shop_config',installer),'t');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('paper decisions: live RBAC, exact retries, stale/terminal/cross-client denial, durable approval/rejection/dispatch/delivery and source-bound Shop projection',()=>{
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now());insert into auth.sessions(id,user_id,created_at) values('${master}','${master}',now());select platform_private.initialize_config('Fixture master','Local stabilization');select platform_private.bind_master('${master}',null,'Local stabilization');
 insert into public.clients(id,name,status,lifecycle_state,infrastructure_state,pairing_mode,plan,currency,supabase_url,supabase_anon) values(42,'Synthetic Shop','Active','Active','present','byo','Basic','PKR','https://abcdefghijklmnopqrst.supabase.co',''),(43,'Other Shop','Active','Active','present','byo','Basic','PKR','https://bcdefghijklmnopqrstu.supabase.co','');
 update public.clients set lifecycle_state='Active' where id in (42,43);
 insert into public.bridge_sources(source_id,client_id,client_binding,enabled) values('${source}',42,'orbito-client-42',true);
 insert into platform_private.source_credentials(source_id,secret_sha256) values('${source}','${'a'.repeat(64)}');
 insert into public.paper_requests(request_id,client_id,source_id,requested_at) values('${request(2)}',42,'${source}',now());`,platform);
 sql(`update app_private.bridge_config set source_id='${source}' where singleton;insert into app_private.billing_projection(singleton,source_id,sync_version,payload) values(true,'${source}',1,'{"paper_resupply_enabled":true}') on conflict(singleton) do update set payload='{"paper_resupply_enabled":true}';`);
 assert.equal(json(user(owner,`select public.request_paper_resupply('${request(2)}')`)).accepted,true);
 assert.equal(json(user(owner,`select public.request_paper_resupply('${request(2)}')`)).replayed,true);
 assert.equal(json(user(owner,`select public.request_paper_resupply('${request(20)}')`)).already_active,true);
 assert.equal(sql(`select count(*) from app_private.bridge_events where kind='resupply' and operation_id='${request(2)}'`),'1');
 const local=json(user(owner,'select public.get_platform_billing()')).paper_requests.find(r=>r.request_id===request(2));assert.equal(local.sync_version,0);assert.equal(local.platform_updated_at,null);
 const decide=(status,version,message,eta='',delivery=null,client=42)=>user(master,`select public.platform_paper_decision(${client},'${request(2)}',${version},'${status}','${message.replaceAll("'","''")}','${eta}',${delivery?lit(delivery):'null'})`);
 assert.throws(()=>sql(`begin;set local role anon;select public.platform_paper_decision(42,'${request(2)}',1,'rejected','No','',null);commit;`,platform),/permission denied/);
 assert.throws(()=>sql(decide('rejected',1,''),platform),/message required/);
 assert.throws(()=>sql(decide('approved',1,'Ready','',null,43),platform),/no rows/);
 sql(decide('approved',1,'Approved <script>text only</script>','3–5 working days'),platform);
 sql(decide('approved',1,'Approved <script>text only</script>','3–5 working days'),platform);
 assert.equal(sql(`select sync_version from public.paper_requests where request_id='${request(2)}'`,platform),'2');
 assert.throws(()=>sql(decide('approved',1,'Changed'),platform),/Stale/);
 const envelope={schema_version:1,source_id:source,client_binding:'orbito-client-42',events:[]};
 for(const forged of [{...envelope,client_binding:'orbito-client-43'},{...envelope,source_id:request(93)}])assert.throws(()=>json(service(`select public.platform_ingest('${'a'.repeat(64)}',${lit(forged)})`),platform),/Binding or envelope mismatch/);
 assert.throws(()=>json(service(`select public.platform_ingest('${'b'.repeat(64)}',${lit(envelope)})`),platform),/Source not authorized/);
 const billing='96000000-0000-4000-8000-000000000003';
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${billing}','billing@example.test',now());insert into auth.sessions(id,user_id,created_at) values('${billing}','${billing}',now());begin;select set_config('platform.team_transition','trusted',true);insert into public.platform_users(auth_user_id,name,email,role,status) values('${billing}','Billing','billing@example.test','billing_person','Active');commit;`,platform);
 assert.throws(()=>sql(user(billing,`select public.platform_paper_decision(42,'${request(2)}',2,'dispatched','Forged dispatch','',null)`),platform),/authorized|denied|role|permission/i);
 sql(`delete from auth.sessions where id='${master}'`,platform);assert.throws(()=>sql(decide('dispatched',2,'Revoked session'),platform),/authorized|denied|role|permission/i);sql(`insert into auth.sessions(id,user_id,created_at) values('${master}','${master}',now());`,platform);
 function sync(){const result=json(service(`select public.platform_ingest('${'a'.repeat(64)}',${lit(envelope)})`),platform);const u=result.resupply_updates[0];return sql(service(`select public.bridge_apply_resupply_communication('${source}','${u.request_id}',${u.sync_version},'${u.status}','${u.platform_updated_at}',${lit(u.communication)})`));}
 sync();sync();
 let ownerResult=json(user(owner,'select public.get_platform_billing()'));assert.equal(ownerResult.paper_requests[0].communication[0].expectation,'3–5 working days');
 sql(decide('dispatched',2,'Courier collected','Tomorrow'),platform);sync();
 const delivery={delivery_id:request(3),reference:'LOCAL-DELIVERY',roll_count:2,usable_length_mm:10000,paper_width_mm:80,delivered_at:'2026-10-01T12:00:00Z'};
 sql(decide('fulfilled',3,'Delivered to reception','',delivery),platform);sql(decide('fulfilled',3,'Delivered to reception','',delivery),platform);sync();
 assert.equal(sql('select sum(roll_count*usable_length_mm) from public.paper_supplies',platform),'20000');
 assert.equal(json(user(owner,'select public.get_platform_billing()')).paper_requests[0].communication.length,3);
 assert.throws(()=>sql(decide('approved',4,'Reopen'),platform),/Stale/);
 sql(`insert into public.paper_requests(request_id,client_id,source_id,requested_at) values('${request(4)}',42,'${source}',now());`,platform);
 assert.equal(json(user(owner,`select public.request_paper_resupply('${request(4)}')`)).request_id,request(4));
 sql(user(master,`select public.platform_paper_decision(42,'${request(4)}',1,'rejected','Outside delivery area','',null)`),platform);
 const row=json(`select row_to_json(r) from public.paper_requests r where request_id='${request(4)}'`,platform);
 sql(service(`select public.bridge_apply_resupply_communication('${source}','${row.request_id}',${row.sync_version},'${row.status}','${row.updated_at}',${lit(row.communication)})`));
 assert.equal(json(user(owner,'select public.get_platform_billing()')).paper_requests.find(r=>r.request_id===request(4)).communication[0].message,'Outside delivery area');
 assert.equal(json(user(owner,`select public.request_paper_resupply('${request(21)}')`)).request_id,request(21));
 assert.throws(()=>sql(user(master,'select public.get_platform_billing()')),/Business Owner access required/);
 assert.throws(()=>sql(user(master,`select public.request_paper_resupply('${request(22)}')`)),/Business Owner access required/);
 assert.throws(()=>sql(service(`select public.bridge_apply_resupply_communication('${request(90)}','${row.request_id}',2,'rejected','${row.updated_at}',${lit(row.communication)})`)),/Source mismatch/);
 assert.throws(()=>sql(service(`select public.bridge_apply_resupply_communication('${source}','${row.request_id}',2,'rejected','${row.updated_at}','[]')`)),/Communication revision conflict/);
 assert.throws(()=>sql(user(owner,`select * from app_private.paper_resupply_requests`)),/permission denied/);
 // A pre-upgrade confirmed delivery has no communication history: exact old retries remain safe.
 sql(`insert into public.paper_requests(request_id,client_id,source_id,requested_at,status,sync_version) values('${request(5)}',42,'${source}',now(),'fulfilled',2);insert into public.paper_supplies(delivery_id,client_id,request_id,reference,roll_count,usable_length_mm,paper_width_mm,delivered_at,recorded_by) values('${request(6)}',42,'${request(5)}','LEGACY',1,1000,80,'2026-10-01','${master}');`,platform);
 const legacy={delivery_id:request(6),reference:'LEGACY',roll_count:1,usable_length_mm:1000,paper_width_mm:80,delivered_at:'2026-10-01T00:00:00Z'};
 sql(user(master,`select public.platform_paper_action(42,'${request(5)}',1,'fulfilled',${lit(legacy)})`),platform);
 assert.throws(()=>sql(user(master,`select public.platform_paper_decision(42,null,null,'fulfilled','Would be lost','',${lit({...legacy,delivery_id:request(7)})})`),platform),/notes require a linked request/);
});

test('BYO wizard native progress is Master/session/project/binding scoped, rejects false proof, enforces revisions and preserves separate clients',async()=>{
 sql("update public.clients set onboarding_version=2,owner_name='Synthetic Owner',owner_email='owner@example.test',shop_url=case when id=42 then 'https://shop.example.test' else 'https://other.example.test' end where id in(42,43)",platform);
 const get=(id=42,ref='abcdefghijklmnopqrst')=>user(master,`select public.platform_byo_progress(${id},'${ref}')`);
 let current=json(get(),platform);assert.equal(current.revision,0);assert.equal(current.client_binding,'orbito-client-42');assert.equal(current.observations.support_enabled,false);
 sql("insert into platform_private.shop_credentials(client_id,project_ref,client_binding,health) values(42,'cdefghijklmnopqrstuv','orbito-client-42','{\"owner_account\":\"active\",\"onboarding\":\"onboarding_complete\"}')",platform);assert.throws(()=>json(get(),platform),/credential target mismatch/);
 sql("update platform_private.shop_credentials set project_ref='abcdefghijklmnopqrst' where client_id=42",platform);assert.equal(json(get(),platform).observations.owner_active,false);sql("update platform_private.shop_credentials set verified_at=now(),health=health||'{\"checks\":{\"migrations\":false}}' where client_id=42",platform);assert.equal(json(get(),platform).observations.owner_active,true);assert.equal(json(get(),platform).observations.backend_runtime_failed,true);sql('delete from platform_private.shop_credentials where client_id=42',platform);
 assert.throws(()=>json(get(43),platform),/target mismatch/);
 assert.throws(()=>sql(`begin;set local role anon;select public.platform_byo_progress(42,'abcdefghijklmnopqrst');commit`,platform),/permission denied/);
 const write=(version,mark='acknowledged',category='null')=>user(master,`select public.platform_byo_progress(42,'abcdefghijklmnopqrst','orbito-client-42',${version},5,'${mark}',${category})`);
 current=json(write(0),platform);assert.equal(current.revision,1);assert.equal(current.marks['5'].mark,'acknowledged');assert.equal(current.observations.backend_runtime_verified,false);
 assert.throws(()=>json(write(0),platform),/Progress changed/);
 assert.throws(()=>json(write(1,'verified'),platform),/Invalid operator mark/);
 assert.throws(()=>json(write(1,'not_applicable'),platform),/Step is required/);
 assert.throws(()=>json(write(1,'blocked',"'private secret text'"),platform),/Invalid diagnostic category/);
 current=json(write(1,'blocked',"'unknown_write'"),platform);assert.equal(current.marks['5'].category,'unknown_write');assert.equal(current.history.length,2);
 const other=json(get(43,'bcdefghijklmnopqrstu'),platform);assert.deepEqual(other.marks,{});
 const raced=await Promise.allSettled([concurrentSql(write(2)),concurrentSql(write(2))]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.match(raced.find(r=>r.status==='rejected').reason.message,/Progress changed/);assert.equal(json(get(),platform).revision,3);
 const secondSession=request(77);sql(`insert into auth.sessions(id,user_id,created_at) values('${secondSession}','${master}',now())`,platform);assert.equal(json(get().replace(`\"session_id\":\"${master}\"`,`\"session_id\":\"${secondSession}\"`),platform).revision,3);
 sql("insert into platform_private.shop_credentials(client_id,project_ref,client_binding) values(42,'abcdefghijklmnopqrst','changed-pairing')",platform);assert.throws(()=>json(get(),platform),/Progress pairing changed/);sql('delete from platform_private.shop_credentials where client_id=42',platform);
 const billing='96000000-0000-4000-8000-000000000003';assert.throws(()=>sql(user(billing,"select public.platform_byo_progress(42,'abcdefghijklmnopqrst')"),platform),/not authorized/);
 sql(`delete from auth.sessions where id='${master}'`,platform);assert.throws(()=>sql(get(),platform),/not authorized/);sql(`insert into auth.sessions(id,user_id,created_at) values('${master}','${master}',now())`,platform);
 assert.throws(()=>sql(user(master,'select * from platform_private.byo_setup_progress'),platform),/permission denied/);
});

test('native client creation wrapper preserves canonical validation and reconciles duplicate identical requests while rejecting changed payloads and foreign operators',async()=>{
 const input={name:'Fresh Client One',industry:'Retail',owner_name:'Fresh Owner',owner_email:'fresh@example.test',pairing_mode:'byo',plan:'Basic',currency:'PKR',currency_symbol:'PKR',event_rate:5,inventory_rate:0,inventory_billable:false,supabase_url:'https://cdefghijklmnopqrstuv.supabase.co',shop_url:'https://fresh.example.test'};
 const call=(data=input)=>user(master,`select public.platform_create_client_once('${request(88)}',${lit(data)})`);
 const [a,b]=await Promise.all([concurrentSql(call()),concurrentSql(call())]);assert.equal(a.id,b.id);assert.equal(a.id,1);assert.equal(a.owner_email,'fresh@example.test');assert.equal(json(call(),platform).id,a.id);
 assert.throws(()=>json(call({...input,name:'Substituted'}),platform),/identity conflict/);
 const billing='96000000-0000-4000-8000-000000000003';assert.throws(()=>sql(user(billing,`select public.platform_create_client_once('${request(88)}',${lit(input)})`),platform),/not authorized/);
 assert.equal(sql("select count(*) from public.clients where name='Fresh Client One'",platform),'1');
});
