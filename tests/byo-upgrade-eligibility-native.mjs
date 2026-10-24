// Focused Platform-only SQL regression. One owned, network-isolated PG17 fixture.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {makeUpgradePlan,digest} from '../supabase/functions/_shared/upgrade-contract.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const migration='20261024014319_byo_upgrade_unknown_infrastructure.sql',original=read('supabase/migrations/20261023141809_controlled_shop_upgrades.sql'),patch=read('supabase/migrations/'+migration);
const predicate="not coalesce(\n   (c.pairing_mode='managed' and c.infrastructure_state='present')\n   or (c.pairing_mode='byo' and c.infrastructure_state in('unknown','present')), false)";
// Prove that the ONLY function-body change is the mode-specific predicate.
for(const name of ['platform_private.upgrade_fence','public.platform_upgrade_prepare']){
 const start=original.indexOf('create function '+name+'('),end=original.indexOf('end$$;',start)+6;
 const previous=original.slice(start,end).replace('create function ','create or replace function ');
 const revised=patch.slice(patch.indexOf('create or replace function '+name+'('),patch.indexOf('end$$;',patch.indexOf('create or replace function '+name+'('))+6);
 assert.equal(revised.replace(predicate,"c.infrastructure_state<>'present'"),previous);
}
const nonce=randomBytes(8).toString('hex'),container='retrasell-byo-eligibility-'+nonce,label='com.retrasell.byo-eligibility-test';let owned=false;
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:24e6,timeout:180000});if(r.status!==0)throw Error(r.stderr||r.error?.message||'Owned SQL fixture failed');return r.stdout.trim();};
const sql=(q,db='eligibility')=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],q);
const id=n=>'99600000-0000-4000-8000-'+String(n).padStart(12,'0'),master=id(1),other=id(2),request=id(20),ref='bcdefghijklmnopqrstu';
const lit=s=>"'"+String(s).replaceAll("'","''")+"'",json=v=>lit(JSON.stringify(v));
const claims=(actor=master,session=master)=>`select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${session}","role":"authenticated"}',true);set local role authenticated;`;
const user=(q,actor=master,session=master)=>sql(`begin;${claims(actor,session)}${q};commit;`).split('\n').at(-1);
const service=q=>sql('set role service_role;'+q).split('\n').at(-1);
const source=JSON.parse(read('supabase/releases/shop-release-support-v4.json')),target=JSON.parse(read('supabase/releases/shop-release-support-v6.json')),catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
const seedClient=(client,mode,infra='unknown',life='Active')=>`insert into public.clients(id,name,status,supabase_url,supabase_anon,onboarding_version,lifecycle_state,infrastructure_state,pairing_mode,plan,owner_name,owner_email,shop_url,currency) values(${client},'Fixture','Active','https://${ref}.supabase.co','',2,'Active','present','${mode}','Basic','Owner','owner@example.test','https://shop.example.test','PKR');update public.clients set lifecycle_state='${life}',infrastructure_state='${infra}' where id=${client};insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note)values('${id(client)}',${client},'fixture-${client}',true,1,'Synthetic fixture');`;
const seedJob=(client,mode,req)=>`insert into platform_private.shop_upgrade_jobs(request_id,client_id,mode,project_ref,source_id,client_binding,source_sha256,target_sha256,actor_id,session_id)values('${req}',${client},'${mode}','${ref}','${id(client)}','fixture-${client}','${source.sha256}','${target.sha256}','${master}','${master}');`;
const prepare=(client=101,req=request)=>`select public.platform_upgrade_prepare(${client},'${req}','${source.sha256}','${target.sha256}')`;
const metadata=`select jsonb_agg(jsonb_build_object('id',p.oid,'owner',p.proowner,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile)order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'platform_upgrade_%')or(n.nspname='platform_private' and p.proname like 'upgrade_%')`;
const dataSnapshot=`select jsonb_build_object('clients',(select jsonb_agg(to_jsonb(c)order by id)from public.clients c),'jobs',(select jsonb_agg(to_jsonb(j)order by request_id)from platform_private.shop_upgrade_jobs j),'pins',(select jsonb_agg(to_jsonb(p)order by request_id)from platform_private.managed_release_pins p),'vault_checksum',(select md5(coalesce(jsonb_agg(to_jsonb(v)order by id)::text,''))from vault.secrets v),'audit',(select jsonb_agg(to_jsonb(a)order by id)from public.operator_audit a))`;
try{
 run(['run','-d','--network','none','--name',container,'--label',label+'='+nonce,'-e','POSTGRES_PASSWORD='+randomBytes(24).toString('hex'),'public.ecr.aws/supabase/postgres:17.6.1.155']);owned=true;
 let ready=false;for(let i=0;i<100;i++){try{run(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,'Owned local Postgres is ready');
 for(const role of ['authenticator','anon','authenticated','service_role'])sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
 sql('create database eligibility','postgres');
 sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;create function vault.create_secret(new_secret text)returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret)values(new_secret)returning id into v;return v;end$$;create function vault.update_secret(secret_id uuid,new_secret text)returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`);
 const before=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<migration).sort().map(f=>{const body=read('supabase/migrations/'+f).replace('create extension if not exists supabase_vault with schema vault;','-- synthetic Vault');return /^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;\n'+body+'\ncommit;';}).join('\n');sql(before);
 sql(`insert into auth.users(id,email)values('${master}','master@example.test'),('${other}','other@example.test');select platform_private.initialize_config('Fixture','BYO eligibility fixture');select platform_private.bind_master('${master}',null,'BYO eligibility fixture');${seedClient(100,'managed','present')}${seedClient(101,'byo')}`);
 assert.throws(()=>user(prepare()),/Exact eligible paired Shop/);assert.equal(sql('select count(*)from platform_private.shop_upgrade_jobs'),'0');
 assert.throws(()=>sql(`begin;${seedJob(101,'byo',request)}select platform_private.upgrade_fence('${request}');rollback;`),/original destination changed/);
 sql(`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state)values('${id(10)}',100,'${master}','verify','{}','complete');insert into platform_private.managed_release_pins(request_id,release_id,release_sha256)values('${id(10)}','support-v4','${source.sha256}');${seedJob(100,'managed',id(11))}update platform_private.shop_upgrade_jobs set state='completed_reviewed',verification='{"full_source_verified":false}' where request_id='${id(11)}';`);
 const permissions=sql(metadata),data=sql(dataSnapshot);sql(patch);assert.equal(sql(metadata),permissions);assert.equal(sql(dataSnapshot),data,'Migration must not update clients/jobs/pins/Vault/audit');
 sql("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);insert into supabase_migrations.schema_migrations values('20261024014319');");
 const verification=JSON.parse(sql(read('scripts/verify-byo-upgrade-eligibility.sql')));assert.equal(verification.migration_applied,true);assert.equal(verification.functions.length,2);
 for(const fn of verification.functions){assert.ok(fn.managed_requires_present&&fn.byo_allows_unknown_or_present&&fn.null_policy_fails_closed&&fn.security_definer);assert.equal(fn.anonymous_execute,false);assert.equal(fn.authenticated_execute,fn.function==='public.platform_upgrade_prepare');}
 assert.equal(sql("select has_function_privilege('anon','public.platform_upgrade_prepare(integer,uuid,text,text)','EXECUTE')or has_function_privilege('authenticated','platform_private.upgrade_fence(uuid)','EXECUTE')or has_function_privilege('service_role','platform_private.upgrade_fence(uuid)','EXECUTE')"),'f');
 console.log('PASS migration: reproduces both old guards; transaction applies; unchanged function ACL/owner/search-path and client/job/pin/Vault/audit data');
 // Three allowed combinations; both functions must accept the same policy.
 for(const [mode,infra]of[['managed','present'],['byo','present'],['byo','unknown']]){
  sql(`begin;${seedClient(110,mode,infra)}${claims()}${prepare(110,id(110))};reset role;select platform_private.upgrade_fence('${id(110)}');rollback;`);
 }
 const unsafe=[['managed','unknown','Active'],['managed','unreachable','Active'],['byo','unreachable','Active'],['byo','destroyed','Active'],['byo','decommissioned','Active'],['byo','unknown','Suspended'],['byo','present','Archived'],['byo','unknown','Provisioning']];
 for(const[mode,infra,life]of unsafe){
  assert.throws(()=>sql(`begin;${seedClient(110,mode,infra,life)}${claims()}${prepare(110,id(110))};rollback;`),/Exact eligible paired Shop/);
  assert.throws(()=>sql(`begin;${seedClient(110,mode,infra,life)}${seedJob(110,mode,id(110))}select platform_private.upgrade_fence('${id(110)}');rollback;`),/original destination changed/);
 }
 console.log('PASS eligibility: Managed present; BYO present/unknown; both guards reject Managed unknown and unsafe/unreachable/retired/inactive BYO targets');
 assert.throws(()=>user(prepare(),other,other),/Master|role|Operator|authorized/i);
 assert.throws(()=>user(prepare(),master,id(999)),/session|role|authorized/i);
 assert.throws(()=>sql(`begin;${seedClient(110,'byo')}delete from public.bridge_sources where client_id=110;${claims()}${prepare(110,id(110))};rollback;`),/Exact eligible paired Shop/);
 for(const kind of ['config','provision']){
  const pending=kind==='config'?`insert into public.config_jobs(request_id,client_id,actor_id,changes,state,intent_generation)values('${id(112)}',110,'${master}','{}','uncertain',0);`:`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state)values('${id(112)}',110,'${master}','verify','{}','retry');`;
  assert.throws(()=>sql(`begin;${seedClient(110,'byo')}${pending}${claims()}${prepare(110,id(110))};rollback;`),/Reconcile original/);
 }
 const draft=JSON.parse(user(prepare()));assert.equal(draft.request_id,request);assert.equal(draft.plan,null);
 assert.throws(()=>user(prepare(100,request)),/Original upgrade identity conflict/);
 const identity={client_id:101,project_ref:ref,source_id:id(101),client_binding:'fixture-101'};
 const observation={shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:source.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:source.functions.map(({name,verify_jwt})=>({name,verify_jwt,present:true})),origin:'customer-reported-read-only-assessment'};
 const policy=r=>catalog.find(c=>c.sha256===r.sha256),plan=makeUpgradePlan(source,target,policy(source),policy(target),observation,identity),sha=await digest(plan);
 assert.throws(()=>makeUpgradePlan(source,target,policy(source),policy(target),{...observation,migrations:[]},identity),/Exact source migration provenance/);
 const conditions={confirmation:`UPGRADE ${ref} ${target.sha256}`,maintenance_required:false,source_review_reference:'Customer assessment reviewed; full source remains unverified'};
 assert.throws(()=>user(`select public.platform_upgrade_approve('${request}','${sha}',${json(conditions)})`),/approval|review/i);
 assert.throws(()=>service(`select public.platform_upgrade_store_plan('${request}','{}','${sha}')`),/Exact bounded upgrade plan/);
 service(`select public.platform_upgrade_store_plan('${request}',${json(plan)},'${sha}')`);
 assert.throws(()=>user(`select public.platform_upgrade_approve('${request}','${'0'.repeat(64)}',${json(conditions)})`),/approval|review/i);
 assert.throws(()=>service(`select public.platform_upgrade_customer_token('${request}','${'a'.repeat(64)}')`),/approved|clearance/i);
 user(`select public.platform_upgrade_approve('${request}','${sha}',${json(conditions)})`);
 service(`select public.platform_upgrade_customer_token('${request}','${'a'.repeat(64)}')`);
 assert.throws(()=>service(`select public.platform_upgrade_customer_claim('${request}','${'b'.repeat(64)}')`),/clearance/i);
 assert.throws(()=>sql(`begin;update auth.sessions set not_after=now()-interval '1 minute' where id='${master}';set local role service_role;select public.platform_upgrade_customer_claim('${request}','${'a'.repeat(64)}');rollback;`),/authority|session|authorized/i);
 const claimed=JSON.parse(service(`select public.platform_upgrade_customer_claim('${request}','${'a'.repeat(64)}')`));assert.equal(claimed.session_id,undefined);assert.equal(claimed.customer_token_hash,undefined);
 const command=(kind,args={})=>service(`select public.platform_upgrade_command('${request}','${claimed.invocation}','${kind}',${json(args)},'${'a'.repeat(64)}')`);
 assert.throws(()=>command('dispatch',{step:plan.steps[1].name}),/Earlier approved/);
 for(const step of plan.steps){command('check');command('dispatch',{step:step.name});command('passed',{step:step.name,sha256:step.sha256});}
 command('finish',{verification:{components_verified:true,runtime_ready:true,full_source_verified:true}});
 user(`select public.platform_upgrade_close('${request}','customer-assessment-and-checkpoints','Reviewed customer report with the full installed-source limitation retained')`);
 const final=JSON.parse(user(`select public.platform_upgrade_status(101)`));assert.equal(final.request_id,request);assert.equal(final.state,'completed_reviewed');assert.equal(Object.keys(final.steps).length,3);assert.equal(final.verification.full_source_verified,false);assert.equal(final.verification.components_verified,false);assert.equal(final.verification.evidence_strength,'customer-reported');
 assert.equal(sql('select infrastructure_state from public.clients where id=101'),'unknown');assert.equal(sql("select release_id from platform_private.managed_release_pins"),'support-v4');assert.equal(sql(`select state from platform_private.shop_upgrade_jobs where request_id='${id(11)}'`),'completed_reviewed');
 console.log('PASS safeguards and full BYO unknown path: source validation, plan/approval, original identity, pending jobs, canonical role/session, clearance, ordered checkpoints, final review and source limitations');
}finally{if(owned){assert.equal(run(['inspect','--format','{{index .Config.Labels "'+label+'"}}',container]),nonce);run(['rm','-f',container]);}}
