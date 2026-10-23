// One small, owned PG17 database. No hosted targets or caller-supplied container.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const nonce=randomBytes(8).toString('hex'),container='retrasell-final-'+nonce,label='com.retrasell.final-test';
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
 const db='route_managed';sql('create database route_managed','postgres');sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;create function vault.create_secret(new_secret text)returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret)values(new_secret)returning id into v;return v;end$$;create function vault.update_secret(secret_id uuid,new_secret text)returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`,db);
 const migration='20261022235702_route_resources_and_managed_continuations.sql';
 for(const f of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f!==migration).sort())sql(read('supabase/migrations/'+f).replace('create extension if not exists supabase_vault with schema vault;','-- fixture Vault'),db);
 sql(read('tests/support-handoff.sql'),db);sql(read('supabase/migrations/'+migration),db);
 const actor='99000000-0000-4000-8000-000000000001',manager='99000000-0000-4000-8000-000000000002',request=id(80),token=id(81),next=id(82);
 const owner=q=>sql(`begin;${claims(actor)}${q};commit;`,db).split('\n').at(-1);
 const begin=t=>owner(`select public.platform_managed_begin(9900,'${request}','managed-setup','{"site_key":"public-site"}','${t}')`);
 const command=(t,k,a={})=>sql(`set role service_role;select public.platform_managed_command('${request}','${t}','${k}','${JSON.stringify(a)}')`,db);
 begin(token);assert.throws(()=>begin(next),/Running operation/);
 command(token,'stage',{p_name:'project-access',p_state:'passed',p_checksum:'exact'});
 assert.throws(()=>command(token,'provision',{p_step:'complete'}),/Verified final stage/);
 for(const name of ['platform_managed_stage_v1','platform_onboarding_step_v1'])assert.throws(()=>sql(`set role service_role;select public.${name}('${request}','prepare',${name.includes('managed')?"'running',null":"'{}'"});`,db),/ownership changed/);
 command(token,'dispatch',{step:'function:login'});assert.throws(()=>command(token,'pause'),/Unknown provider/);
 assert.throws(()=>owner(`select public.platform_provision_reconcile(9900,'${request}','close','Synthetic closure request')`),/Resolve original/);
 sql(`update platform_private.provision_jobs set state='retry' where request_id='${request}'`,db);assert.throws(()=>owner(`select public.platform_managed_confirm('${request}','function:login','provider-proof','Synthetic authoritative provider review')`),/wait ten minutes/);sql(`update platform_private.provision_jobs set state='running' where request_id='${request}'`,db);
 command(token,'verified-stage',{p_name:'function:login',p_checksum:'frozen'});
 const health=sql('select health from platform_private.shop_credentials where client_id=9900',db);
 command(token,'pause');assert.equal(sql('select health from platform_private.shop_credentials where client_id=9900',db),health);
 begin(next);assert.throws(()=>command(token,'check'),/ownership changed/);
 assert.throws(()=>sql(`set role service_role;select public.platform_managed_stage('${request}','project-access','passed','exact');`,db),/ownership changed/);
 assert.throws(()=>owner(`select public.platform_provision_reconcile(9900,'${request}','resume','Synthetic recovery request')`),/wait ten minutes/);
 const page=JSON.parse(owner("select public.platform_route_resource('clients',null,0,'Managed','current')"));assert.ok(page.data.clients.length<=50);assert.ok(!('payments' in page.data));for(const resource of ['overview','billing','team','settings'])JSON.parse(owner(`select public.platform_route_resource('${resource}')`));
 assert.throws(()=>sql(`begin;${claims(manager)}select public.platform_route_resource('team');rollback;`,db),/not authorized/);
 command(next,'pause');
 const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{windowsHide:true});
 const held=new Promise((resolve,reject)=>{let out='';child.stdout.on('data',b=>{out+=b;if(out.includes('OWNER_LOCKED'))resolve();});child.on('error',reject);});
 child.stdin.end(`begin;${claims(actor)}select public.platform_managed_begin(9900,'${request}','managed-setup','{"site_key":"public-site"}','${token}');select 'OWNER_LOCKED';select pg_sleep(0.7);commit;`);
 await held;const race=Date.now();assert.throws(()=>begin(next),/Running operation/);assert.ok(Date.now()-race>400,'second invocation waits for row ownership lock');
 sql(`delete from auth.sessions where id='${actor}'`,db);assert.throws(()=>command(token,'check'),/session revoked/);
 console.log('PASS: forward SQL; exclusive invocation, durable pause, health preservation, stale-token/unfenced denial, unknown-write fence, unchanged ten-minute recovery and scoped role-authorized reads.');
}finally{if(owned){assert.equal(run(['inspect','-f','{{index .Config.Labels "'+label+'"}}',container]),nonce);run(['rm','-f',container]);}}
