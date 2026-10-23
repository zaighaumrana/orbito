// Two small, owned PG17 databases. No hosted targets or caller-supplied container.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
const nonce=randomBytes(8).toString('hex'),container='retrasell-continuity-'+nonce,label='com.retrasell.continuity-test';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16e6,timeout:180000});if(r.status!==0)throw Error(r.stderr||r.error?.message||'Local Docker failed');return r.stdout.trim()};
const sql=(q,db)=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],q);
const id=n=>'99100000-0000-4000-8000-'+String(n).padStart(12,'0');
const claims=(actor,sid=actor)=>`select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${sid}","role":"authenticated"}',true);set local role authenticated;`;
let owned=false;try{
 run(['run','-d','--network','none','--name',container,'--label',label+'='+nonce,'-e','POSTGRES_PASSWORD='+randomBytes(24).toString('hex'),'public.ecr.aws/supabase/postgres:17.6.1.155']);owned=true;
 for(let i=0;i<100;i++){try{run(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);break}catch{await new Promise(r=>setTimeout(r,200))}}
 sql("do $$begin create role authenticator;exception when duplicate_object then null;end$$;",'postgres');
 for(const role of ['anon','authenticated','service_role'])sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
 const db='continuity_platform';sql('create database continuity_platform','postgres');sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;create function vault.create_secret(new_secret text)returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret)values(new_secret)returning id into v;return v;end$$;create function vault.update_secret(secret_id uuid,new_secret text)returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`,db);

 const chain=(repo,target)=>{const batch=readdirSync(new URL('../'+repo+'supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort().map(f=>{const body=read(repo+'supabase/migrations/'+f).replace('create extension if not exists supabase_vault with schema vault;','-- fixture Vault');return /^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;\n'+body+'\ncommit;';}).join('\n');sql(batch,target);};
 chain('',db);const shop='continuity_shop';sql('create database '+shop,'postgres');sql(read('tests/local-bootstrap.sql')+'create schema extensions;create extension pgcrypto with schema extensions;',shop);chain('../Orbitoshopv2-v1/',shop);
 const master=id(1),owner=id(2),other=id(3),source=id(4),request=id(5);let ticket=id(6);
 sql(`insert into auth.users(id,email)values('${master}','master@example.test');select platform_private.initialize_config('Fixture','Continuity fixture only');select platform_private.bind_master('${master}',null,'Continuity fixture only');insert into public.clients(id,name,status,supabase_url,supabase_anon,onboarding_version,lifecycle_state,infrastructure_state,pairing_mode,plan,owner_name,owner_email,shop_url,currency) values(100,'Fixture','Active','https://abcdefghijklmnopqrst.supabase.co','',2,'Active','present','managed','Basic','Owner','owner@example.test','https://shop.example.test','PKR');`,db);
 sql(`insert into auth.users(id,email)values('${owner}','owner@example.test'),('${other}','other@example.test');insert into public.employees(id,name,email,role,status) values(1,'Manager','other@example.test','Manager','Active');insert into public.app_users(auth_user_id,email,display_name,role,status,employee_id)values('${owner}','owner@example.test','Owner','Business Owner','Active',null),('${other}','other@example.test','Manager','Manager','Active',1);update public.shop_config set suspended=false,onboarding_version=2,platform_client_id=100 where id=1;update app_private.bridge_config set source_id='${source}',client_binding='fixture-100' where singleton;`,shop);
 const user=(actor,q,target=shop)=>sql(`begin;${claims(actor)}${q};commit;`,target).split('\n').at(-1),service=q=>sql('set role service_role;'+q,shop).split('\n').at(-1);
 const fields={subject:'Fixture request',category:'technical',message:'Receiver outage fixture'};
 sql(`update public.clients set lifecycle_state='Active',billing_policy='usage-v1',accounting_review_required=false,event_rate=50,bill_billable=true where id=100;insert into platform_private.shop_credentials(client_id,project_ref,client_binding) values(100,'abcdefghijklmnopqrst','fixture-100');insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note) values('${source}',100,'fixture-100',true,1,'Synthetic fresh fixture');insert into platform_private.source_credentials values('${source}','${'b'.repeat(64)}');insert into platform_private.support_ticket_credentials(enrollment_id,source_id,project_ref,client_binding,secret_sha256,shop_public_api_key,created_by,enabled) values('${id(10)}','${source}','abcdefghijklmnopqrst','fixture-100','${'a'.repeat(64)}','synthetic-public-key','${master}',true);`,db);
 const actor={auth_user_id:owner,session_id:owner,role:'Business Owner',employee_id:null,source_id:source,client_binding:'fixture-100',platform_client_id:100};
 const intakeSql=`set role service_role;select public.platform_support_ticket_create('${'a'.repeat(64)}','${JSON.stringify({project_ref:'abcdefghijklmnopqrst',source_id:source,client_binding:'fixture-100'})}','${request}','${JSON.stringify(fields)}','${JSON.stringify(actor)}',now())`;const intake=()=>JSON.parse(sql(intakeSql,db).split('\n').at(-1));
 const worker=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{windowsHide:true});
 let locked=false,workerError='';worker.stderr.on('data',b=>workerError+=b);
 const workerDone=new Promise((resolve,reject)=>worker.on('close',code=>code===0?resolve():reject(Error(workerError))));
 const lockReady=new Promise((resolve,reject)=>{worker.stdout.on('data',b=>{if(String(b).includes('SUPPORT_LOCKED')){locked=true;resolve();}});worker.on('close',()=>{if(!locked)reject(Error(workerError||'Fixture worker ended before lock'));});worker.on('error',reject);});
 worker.stdin.end(`begin;${intakeSql.replace('set role','set local role')};select 'SUPPORT_LOCKED';select pg_sleep(1);commit;`);
 await lockReady;const race=Date.now();ticket=intake().ticket_id;assert.ok(Date.now()-race>400,'competing intake waits for the original transaction');await workerDone;assert.equal(intake().ticket_id,ticket);assert.equal(sql('select count(*) from public.support_tickets',db),'1');
 // Existing transactional outbox + receiver dedupe survive a lost acknowledgment.
 sql("update app_private.bridge_config set delivery_enabled=true,usage_mode='bridge'",shop);
 const event=sql(`select app_private.append_bridge_event('usage','create_retail_sale','${id(11)}','{"metric":"BILL","quantity":1,"unit":"event"}',now())`,shop);
 assert.equal(sql(`select app_private.append_bridge_event('usage','create_retail_sale','${id(11)}','{"metric":"BILL","quantity":1,"unit":"event"}',now())`,shop),event);
 const batch=JSON.parse(service('select public.bridge_claim_outbox(10)'));const envelope={schema_version:1,source_id:source,client_binding:'fixture-100',events:batch.events};
 const ingest=()=>JSON.parse(sql(`set role service_role;select public.platform_ingest('${'b'.repeat(64)}','${JSON.stringify(envelope)}')`,db).split('\n').at(-1));
 assert.throws(()=>sql(`set role service_role;select public.platform_ingest('${'b'.repeat(64)}','${JSON.stringify({...envelope,schema_version:2})}')`,db),/mismatch|unsupported/i);assert.equal(ingest().acknowledgements[0].status,'accepted');assert.equal(ingest().acknowledgements[0].status,'duplicate');assert.equal(sql("select count(*) from public.usage_logs where module_type='BILL'",db),'1');
 const billReq=id(12),payReq=id(13);const invoice=JSON.parse(user(master,`select row_to_json(public.platform_generate_invoice(100,'${billReq}'))`,db));assert.equal(invoice.total_due,50);
 assert.equal(JSON.parse(user(master,`select row_to_json(public.platform_generate_invoice(100,'${billReq}'))`,db)).id,invoice.id);
 const pay=()=>JSON.parse(user(master,`select row_to_json(public.platform_record_payment(${invoice.id},20,'Cash','2026-10-23','fixture','${payReq}'))`,db));assert.equal(pay().id,pay().id);
 const receipt=JSON.parse(user(master,`select public.platform_financial_outcome('payment','${payReq}',${invoice.id})`,db));assert.equal(receipt.applied,true);assert.equal(Number(receipt.record.amount),20);assert.equal(sql('select count(*) from public.payments',db),'1');assert.equal(JSON.parse(user(master,`select public.platform_financial_outcome('payment','${id(14)}',${invoice.id})`,db)).state,'not_observed');

 const accept=()=>JSON.parse(user(owner,`select public.support_submission('${request}','${JSON.stringify(fields)}')`));
 assert.equal(accept().state,'pending');assert.equal(accept().request_id,request);assert.equal(sql('select count(*) from app_private.support_submissions',shop),'1');
 assert.throws(()=>user(other,`select public.support_submission('${request}','${JSON.stringify(fields)}')`),/conflict/);
 assert.throws(()=>user(owner,`select public.support_submission('${request}','${JSON.stringify({...fields,message:'Changed'})}')`),/conflict/);
 const first=JSON.parse(user(owner,`select public.support_delivery_claim('${request}')`));assert.equal(first.dispatch,true);assert.equal(JSON.parse(user(owner,`select public.support_delivery_claim('${request}')`)).dispatch,false);
 assert.throws(()=>user(owner,`select public.support_delivery_finish('${request}','${first.lease_id}','acknowledged','${ticket}','Open')`),/permission denied/);
 // Lost worker/reply: state survives a new process; only original ID is replayed.
 sql(`update app_private.support_submissions set lease_until=now()-interval '1 second' where request_id='${request}'`,shop);
 const second=JSON.parse(user(owner,`select public.support_delivery_claim('${request}')`));assert.equal(second.dispatch,true);assert.notEqual(second.lease_id,first.lease_id);
 assert.equal(service(`select public.support_delivery_finish('${request}','${first.lease_id}','acknowledged','${ticket}','Open')`),'f');
 assert.equal(service(`select public.support_delivery_finish('${request}','${second.lease_id}','uncertain')`),'t');assert.equal(accept().state,'uncertain');assert.equal(JSON.parse(user(owner,'select public.support_pending_submissions()')).length,1);
 sql(`update app_private.support_submissions set next_attempt_at=now()-interval '1 second' where request_id='${request}'`,shop);
 const third=JSON.parse(user(owner,`select public.support_delivery_claim('${request}')`));assert.equal(service(`select public.support_delivery_finish('${request}','${third.lease_id}','acknowledged','${ticket}','Open')`),'t');assert.equal(accept().ticket_id,ticket);assert.equal(JSON.parse(user(owner,'select public.support_pending_submissions()')).length,0);
 assert.throws(()=>user(other,'select public.shop_backend_capabilities()'),/permission denied/);const caps=JSON.parse(service('select public.shop_backend_capabilities()'));assert.equal(caps.capabilities['support-durable-submissions'],true);assert.equal(caps.capabilities['usage-outbox'],true);
 sql(`delete from auth.sessions where id='${owner}'`,shop);assert.throws(()=>accept(),/denied/);
 // Platform diagnostics are authenticated and independent of Shop lifecycle writes.
 const inv=JSON.parse(user(master,'select public.platform_backend_inventory_begin(100)',db));assert.ok(inv.invocation);assert.throws(()=>user(master,'select public.platform_backend_inventory_begin(100)',db),/Wait before/);
 const report={compliance:'unable_to_verify',runtime_health:'healthy',verified_release:null,evidence:{origin:'fixture'},missing:[],limitations:['source unknown'],upgrade:{available:false},compatibility:null,observed_migration_release:null};
 assert.throws(()=>sql(`set role service_role;select public.platform_backend_inventory_finish(100,'${id(8)}','${JSON.stringify(report)}')`,db),/ownership/);
 sql(`set role service_role;select public.platform_backend_inventory_finish(100,'${inv.invocation}','${JSON.stringify(report)}')`,db);
 assert.equal(JSON.parse(user(master,'select public.platform_backend_inventory_status(100)',db)).report.compliance,'unable_to_verify');
 const finalManifest=JSON.parse(read('../Orbitoshopv2-v1/scripts/byo-release-manifest.json'));
 assert.equal(sql(`select sha256 from platform_private.approved_shop_releases where release_id='${finalManifest.release_id}' and approved_for_new`,db),finalManifest.sha256);assert.equal(sql('select count(*) from platform_private.approved_shop_releases where approved_for_new',db),'1');
 assert.equal(sql("select supported::text||'/'||approved_for_new::text||'/'||successor from platform_private.approved_shop_releases where release_id='support-v5'",db),'false/false/support-v6');
 console.log('PASS: final forward chains/catalog; concurrent Support receiver dedupe, usage replay, invoice/payment idempotency/read-back; durable queue/actor/ACL/restart/lease/ack recovery and restricted inventory persistence.');
}finally{if(owned){assert.equal(run(['inspect','-f','{{index .Config.Labels "'+label+'"}}',container]),nonce);run(['rm','-f',container]);}}
