// One owned isolated PG17 container; no hosted targets. Reuses existing SQL bootstrap.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {migrationEnvelope} from '../../Orbitoshopv2-v1/scripts/byo-support-release.mjs';
import {makeUpgradePlan,digest} from '../supabase/functions/_shared/upgrade-contract.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const nonce=randomBytes(8).toString('hex'),container='retrasell-upgrades-'+nonce,label='com.retrasell.upgrade-test',id=n=>'99500000-0000-4000-8000-'+String(n).padStart(12,'0');
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:24e6,timeout:180000});if(r.status!==0)throw Error(r.stderr||r.error?.message||'Owned PostgreSQL test failed');return r.stdout.trim();};
const sql=(q,db='upgrade_platform')=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],q);
const master=id(1),other=id(2),sourceId=id(3),request=id(4),ref='abcdefghijklmnopqrst';let session=master,owned=false;
const user=(q,actor=master,sid=session)=>sql(`begin;select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${sid}","role":"authenticated"}',true);set local role authenticated;${q};commit;`).split('\n').at(-1);
const service=q=>sql('set role service_role;'+q).split('\n').at(-1),lit=s=>"'"+String(s).replaceAll("'","''")+"'",json=v=>lit(JSON.stringify(v));
const old=JSON.parse(read('supabase/releases/shop-release-support-v4.json')),target=JSON.parse(read('supabase/releases/shop-release-support-v6.json')),catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
try{
 run(['run','-d','--network','none','--name',container,'--label',label+'='+nonce,'-e','POSTGRES_PASSWORD='+randomBytes(24).toString('hex'),'public.ecr.aws/supabase/postgres:17.6.1.155']);owned=true;
 for(let i=0;i<100;i++){try{run(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,200));}}
 for(const role of ['authenticator','anon','authenticated','service_role'])sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
 sql('create database upgrade_platform','postgres');
 sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;create function vault.create_secret(new_secret text)returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret)values(new_secret)returning id into v;return v;end$$;create function vault.update_secret(secret_id uuid,new_secret text)returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`);
 const batch=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort().map(f=>{const body=read('supabase/migrations/'+f).replace('create extension if not exists supabase_vault with schema vault;','-- synthetic Vault');return /^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;\n'+body+'\ncommit;';}).join('\n');sql(batch);
 sql(`insert into auth.users(id,email)values('${master}','master@example.test'),('${other}','other@example.test');select platform_private.initialize_config('Fixture','Controlled upgrade fixture');select platform_private.bind_master('${master}',null,'Controlled upgrade fixture');insert into public.clients(id,name,status,supabase_url,supabase_anon,onboarding_version,lifecycle_state,infrastructure_state,pairing_mode,plan,owner_name,owner_email,shop_url,currency) values(100,'Fixture','Active','https://${ref}.supabase.co','',2,'Active','present','managed','Basic','Owner','owner@example.test','https://shop.example.test','PKR'),(101,'BYO','Active','https://bcdefghijklmnopqrstu.supabase.co','',2,'Active','present','byo','Basic','Owner','byo@example.test','https://byo.example.test','PKR');insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note)values('${sourceId}',100,'fixture-100',true,1,'Synthetic fixture only'),('${id(10)}',101,'fixture-101',true,1,'Synthetic fixture only');`);
 sql("update public.clients set lifecycle_state='Active',infrastructure_state='present' where id in(100,101)");
 const prepare=(r=request,client=100)=>user(`select public.platform_upgrade_prepare(${client},'${r}','${old.sha256}','${target.sha256}')`);
 assert.throws(()=>user(`select public.platform_upgrade_prepare(100,'${request}','${old.sha256}','${target.sha256}')`,other,other),/Master|role|Operator|authorized/i);
 sql(`insert into public.config_jobs(request_id,client_id,actor_id,changes,state,intent_generation)values('${id(11)}',100,'${master}','{}','uncertain',0)`);assert.throws(()=>prepare(),/Reconcile original/);sql("update public.config_jobs set state='failed'");
 sql(`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state)values('${id(12)}',100,'${master}','verify','{}','retry')`);assert.throws(()=>prepare(),/Reconcile original/);sql("update platform_private.provision_jobs set state='complete'");
 sql(`insert into platform_private.managed_invocations(request_id,token,session_id,unknown_step)values('${id(12)}','${id(13)}','${master}','function:login')`);assert.throws(()=>prepare(),/Reconcile original/);sql('delete from platform_private.managed_invocations');
 sql(`insert into platform_private.managed_release_pins(request_id,release_id,release_sha256)values('${id(12)}','support-v4','${old.sha256}')`);
 prepare();assert.throws(()=>prepare(id(20)),/Reconcile original/);
 const identity={client_id:100,project_ref:ref,source_id:sourceId,client_binding:'fixture-100'},observation={shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:old.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:old.functions.map(({name,verify_jwt})=>({name,verify_jwt,present:true})),origin:'fixture-provider'};
 const plan=makeUpgradePlan(old,target,catalog.find(c=>c.sha256===old.sha256),catalog.find(c=>c.sha256===target.sha256),observation,identity),sha=await digest(plan);
 service(`select public.platform_upgrade_store_plan('${request}',${json(plan)},'${sha}')`);
 assert.throws(()=>sql(`set role authenticated;select public.platform_upgrade_store_plan('${request}','{}','${sha}')`),/permission denied/);
 const conditions={confirmation:`UPGRADE ${ref} ${target.sha256}`,maintenance_required:false,source_review_reference:'fixture-provider-source-review'};
 assert.throws(()=>user(`select public.platform_upgrade_approve('${request}','${sha}','{}')`),/approval|review/i);
 user(`select public.platform_upgrade_approve('${request}','${sha}',${json(conditions)})`);
 assert.throws(()=>sql(`insert into public.config_jobs(request_id,client_id,actor_id,changes)values('${id(21)}',100,'${master}','{}')`),/backend upgrade/);
 assert.throws(()=>sql("update public.clients set lifecycle_state='Suspended' where id=100"),/Settle original/);
 const worker=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','upgrade_platform'],{windowsHide:true});let token,workerError='';
 const ready=new Promise((resolve,reject)=>{worker.stdout.on('data',b=>{const match=String(b).match(/CLAIM:([a-f0-9-]{36})/);if(match){token=match[1];resolve();}});worker.on('error',reject);worker.on('close',()=>{if(!token)reject(Error(workerError||'Original claimant did not start'));});});
 worker.stderr.on('data',b=>workerError+=b);const done=new Promise((resolve,reject)=>worker.on('close',code=>code===0?resolve():reject(Error(workerError))));
 worker.stdin.end(`begin;select set_config('request.jwt.claim.sub','${master}',true);select set_config('request.jwt.claims','{"sub":"${master}","session_id":"${session}","role":"authenticated"}',true);set local role authenticated;select 'CLAIM:'||(public.platform_upgrade_claim('${request}')->>'invocation');select pg_sleep(0.7);commit;`);
 await ready;const waited=Date.now();
 assert.throws(()=>user(`select public.platform_upgrade_claim('${request}')`),/already running/);
 assert.ok(Date.now()-waited>300,'Competing executor waits for the same client/job lock');await done;
 const command=(kind,args={},t=token,hash=null)=>service(`select public.platform_upgrade_command('${request}','${t}','${kind}',${json(args)},${hash?lit(hash):'null'})`);
 assert.throws(()=>command('check',{},token,'c'.repeat(64)),/cannot execute a Managed/);
 assert.throws(()=>command('dispatch',{step:plan.steps[1].name}),/Earlier approved/);
 command('dispatch',{step:plan.steps[0].name});command('uncertain');assert.throws(()=>command('pause'),/Uncertain/);
 assert.throws(()=>user(`select public.platform_upgrade_reconcile('${request}','${plan.steps[0].name}',true,'fixture-provider-proof','Actual fixture review reason')`),/delay|ten minutes/);
 sql(`update platform_private.shop_upgrade_jobs set updated_at=now()-interval '11 minutes' where request_id='${request}'`);
 user(`select public.platform_upgrade_reconcile('${request}','${plan.steps[0].name}',true,'fixture-provider-proof','Actual fixture review reason')`);
 assert.throws(()=>command('check'),/ownership changed/);
 const next=JSON.parse(user(`select public.platform_upgrade_claim('${request}')`)).invocation;
 for(const step of plan.steps.slice(1)){command('dispatch',{step:step.name},next);command('passed',{step:step.name,sha256:step.sha256},next);}
 command('finish',{verification:{components_verified:true,runtime_ready:true,full_source_verified:true,origin:'fixture-provider'}},next);
 assert.equal(sql(`select state||'/'||(verification->>'full_source_verified') from platform_private.shop_upgrade_jobs where request_id='${request}'`),'verification_required/false');
 user(`select public.platform_upgrade_close('${request}','fixture-full-source-review','Reviewed actual component outcome with source limitation')`);
 assert.equal(sql('select count(*) from platform_private.managed_release_pins'),'1');assert.equal(sql('select release_sha256 from platform_private.managed_release_pins'),old.sha256);
 // BYO uses the exact same target/operation fence; reported evidence never becomes provider proof.
 const byo=id(30);prepare(byo,101);const p2={...plan,project_ref:'bcdefghijklmnopqrstu',client_id:101,source_id:id(10),client_binding:'fixture-101'},s2=await digest(p2);
 service(`select public.platform_upgrade_store_plan('${byo}',${json(p2)},'${s2}')`);user(`select public.platform_upgrade_approve('${byo}','${s2}',${json({...conditions,confirmation:`UPGRADE bcdefghijklmnopqrstu ${target.sha256}`})})`);
 service(`select public.platform_upgrade_customer_token('${byo}','${'d'.repeat(64)}')`);
 assert.throws(()=>service(`select public.platform_upgrade_customer_claim('${byo}','${'e'.repeat(64)}')`),/expired|changed/);
 const customerClaim=JSON.parse(service(`select public.platform_upgrade_customer_claim('${byo}','${'d'.repeat(64)}')`));assert.equal(customerClaim.session_id,undefined);assert.equal(customerClaim.customer_token_hash,undefined);const bt=customerClaim.invocation;
 assert.throws(()=>service(`select public.platform_upgrade_customer_claim('${byo}','${'d'.repeat(64)}')`),/already executing/);
 sql(`update platform_private.shop_upgrade_jobs set customer_expires_at=now()-interval '1 second' where request_id='${byo}'`);assert.throws(()=>service(`select public.platform_upgrade_command('${byo}','${bt}','check','{}','${'d'.repeat(64)}')`),/clearance changed/);
 sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${master}'`);assert.throws(()=>service(`select public.platform_upgrade_command('${byo}','${bt}','check','{}','${'d'.repeat(64)}')`),/authority|destination/);
 session=id(90);sql(`insert into auth.sessions(id,user_id)values('${session}','${master}');insert into auth.mfa_amr_claims(session_id,authentication_method)values('${session}','password');update platform_private.shop_upgrade_jobs set updated_at=now()-interval '11 minutes' where request_id='${byo}'`);
 user(`select public.platform_upgrade_reconcile('${byo}',null,false,'fixture-stopped-process','Verified the original customer executor stopped before retry')`);
 user(`select public.platform_upgrade_approve('${byo}','${s2}',${json({...conditions,confirmation:`UPGRADE bcdefghijklmnopqrstu ${target.sha256}`})})`);
 assert.throws(()=>service(`select public.platform_upgrade_command('${byo}','${bt}','check','{}','${'d'.repeat(64)}')`),/ownership changed/);
 service(`select public.platform_upgrade_customer_token('${byo}','${'e'.repeat(64)}')`);const bt2=JSON.parse(service(`select public.platform_upgrade_customer_claim('${byo}','${'e'.repeat(64)}')`)).invocation;
 for(const step of p2.steps){service(`select public.platform_upgrade_command('${byo}','${bt2}','dispatch',${json({step:step.name})},'${'e'.repeat(64)}')`);service(`select public.platform_upgrade_command('${byo}','${bt2}','passed',${json({step:step.name,sha256:step.sha256})},'${'e'.repeat(64)}')`);}
 service(`select public.platform_upgrade_command('${byo}','${bt2}','finish','{"verification":{"components_verified":true,"runtime_ready":true,"full_source_verified":true}}','${'e'.repeat(64)}')`);
 assert.equal(sql(`select (verification->>'components_verified')||'/'||(verification->>'full_source_verified')||'/'||(verification->>'evidence_strength') from platform_private.shop_upgrade_jobs where request_id='${byo}'`),'false/false/customer-reported');
 assert.throws(()=>service('select customer_token_hash from platform_private.shop_upgrade_jobs'),/permission denied/);
 assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'platform_upgrade_%' and has_function_privilege('anon',p.oid,'EXECUTE')"),'0');
 // Populated-target closure refuses missing review, preserves accepted legacy tickets,
 // and revokes the original column grant only under the explicit staged approval.
 sql("insert into public.support_tickets(client_id,client_name,subject,message)values(100,'Fixture','Legacy accepted event','Preserve this accepted record');grant insert(client_id,client_name,subject,message) on public.support_tickets to anon");
 const closure=read('supabase/staged-migrations/close_populated_support_after_target_review.sql');assert.throws(()=>sql(closure),/compatibility|review required/);
 sql(closure.replace('begin;',`begin;set local retrasell.reviewed_platform_target='${ref}';set local retrasell.compatibility_review_reference='fixture-sender-review';set local retrasell.support_sender_compatibility='approved';set local retrasell.reviewed_ticket_count='1';`));
 assert.equal(sql("select subject from public.support_tickets"),'Legacy accepted event');assert.equal(sql("select has_any_column_privilege('anon','public.support_tickets','INSERT')"),'f');
 // Real additive old-v4 → final-v6 SQL and original migration read-back, no reset.
 sql('create database upgrade_shop','postgres');sql(read('tests/local-bootstrap.sql')+'create schema extensions;create extension pgcrypto with schema extensions;','upgrade_shop');
 sql(old.migrations.map(m=>migrationEnvelope(m)).join('\n'),'upgrade_shop');const originalConfig=sql('select to_jsonb(s) from public.shop_config s','upgrade_shop');
 sql(`insert into app_private.config_requests(request_id,changes,result)values('${id(91)}','{}','{}')`,'upgrade_shop');
 const missing=target.migrations.slice(old.migrations.length);for(const m of missing){sql(migrationEnvelope(m),'upgrade_shop');sql(migrationEnvelope(m),'upgrade_shop');}
 assert.equal(sql('select count(*) from supabase_migrations.schema_migrations','upgrade_shop'),'38');assert.equal(sql("select has_table_privilege('anon','app_private.support_submissions','SELECT')",'upgrade_shop'),'f');
 assert.equal(sql('select to_jsonb(s) from public.shop_config s','upgrade_shop'),originalConfig);assert.equal(sql('select count(*) from app_private.config_requests','upgrade_shop'),'1');
 console.log('PASS: Platform forward chain; exact approval, pending/unknown-operation blockers, ordered ownership/ACK recovery, BYO clearance/mode/session isolation and immutable pins; real v4→v6 SQL and idempotent read-back.');
}finally{if(owned){const actual=run(['inspect','--format','{{index .Config.Labels "'+label+'"}}',container]);if(actual!==nonce)throw Error('Owned test label changed; cleanup refused');run(['rm','-f',container]);}}
