import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {databaseSourceQuery} from '../supabase/functions/_shared/backend-source-verification.ts';
const evidence=process.env.PR6_EVIDENCE;if(!evidence)throw Error('PR6_EVIDENCE directory required');
fs.mkdirSync(evidence,{recursive:true});
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const v4=JSON.parse(read('supabase/releases/shop-release-support-v4.json')),v6=JSON.parse(read('supabase/releases/shop-release-support-v6.json'));
const migration='supabase/migrations/20261026220335_backend_release_reporting_verification.sql';
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const sourceId='99200000-0000-4000-8000-000000000001',managed='99200000-0000-4000-8000-000000000002',byo='99200000-0000-4000-8000-000000000003',later='99200000-0000-4000-8000-000000000004';
const ref='abcdefghijklmnopqrst',byoRef='bcdefghijklmnopqrstu';
let container;const result={started:new Date().toISOString(),scope:'One small isolated reporting-contract fixture, synthetic authorization helper; no hosted Auth/provider proof',checks:[]};
function docker(args,input){const p=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:4e6});if(p.status!==0)throw Error((p.stderr||p.error?.message||'Docker command failed').slice(0,1800));return p.stdout.trim()}
function sql(query){return docker(['exec','-i',container,'psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],query)}
function report(id){return JSON.parse(sql('select public.platform_backend_inventory_status('+id+');'))}
function job(id,client,mode,project){
 const plan={client_id:client,project_ref:project,source_id:sourceId,client_binding:'fixture-'+client,source_sha256:v4.sha256,target_sha256:v6.sha256,target_release:'support-v6',
  steps:[{name:'migration:20261023012311',sha256:v6.migrations.at(-1).sha256},...v6.functions.filter(f=>['platform-bridge','support-tickets'].includes(f.name)).map(f=>({name:'function:'+f.name,sha256:f.sha256}))]};
 const steps=Object.fromEntries(plan.steps.map(s=>[s.name,{state:'passed',sha256:s.sha256,origin:mode==='managed'?'provider-acknowledged':'customer-reported'}]));
 const verification={runtime_ready:true,components_verified:mode==='managed',components_reported:true,full_source_verified:false,origin:mode==='managed'?'managed-provider-read-only':'customer-local-cli',evidence_strength:mode==='managed'?'provider-acknowledged-and-read-back':'customer-reported'};
 return `insert into platform_private.shop_upgrade_jobs values(${literal(id)},${client},${literal(mode)},${literal(project)},${literal(sourceId)},${literal('fixture-'+client)},${literal(v4.sha256)},${literal(v6.sha256)},'completed_reviewed',${literal(JSON.stringify(plan))}::jsonb,${literal('a'.repeat(64))},${literal(JSON.stringify(steps))}::jsonb,${literal(JSON.stringify(verification))}::jsonb,null,'2026-10-23T10:00:00Z','2026-10-24T18:45:00Z');`;
}
try{
 container=docker(['run','-d','--pull','never','--network','none','--name','retrasell-pr6-'+randomUUID().slice(0,8),'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_PASSWORD='+randomUUID(),'public.ecr.aws/supabase/postgres:17.6.1.155','postgres']);
 result.container=container;
 for(let i=0;i<40;i++){const ready=spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{encoding:'utf8',windowsHide:true});if(ready.status===0)break;if(i===39)throw Error('Postgres startup timeout');await new Promise(r=>setTimeout(r,250))}
 sql(`
 do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role;end if;end$$;
 create schema platform_private;create schema app_private;
 create function platform_private.operator_role()returns text language sql stable as $$select coalesce(current_setting('fixture.operator_role',true),'master_admin')$$;
 create function platform_private.require_role(roles text[])returns void language plpgsql as $$begin if not(platform_private.operator_role()=any(roles))then raise exception 'denied' using errcode='42501';end if;end$$;
 create table public.clients(id integer primary key,pairing_mode text,lifecycle_state text,infrastructure_state text,supabase_url text);
 create table public.bridge_sources(client_id integer,source_id uuid,client_binding text);
 create table platform_private.shop_backend_inventory(client_id integer,project_ref text,source_id uuid,client_binding text,checked_at timestamptz,report jsonb,last_verified jsonb);
 create table platform_private.approved_shop_releases(release_id text,sha256 text,supported boolean,approved_for_new boolean,successor text,upgrade_policy text,compatibility jsonb);
 create table platform_private.provision_jobs(request_id uuid,client_id integer,created_at timestamptz);
 create table platform_private.managed_release_pins(request_id uuid,release_id text,release_sha256 text);
 create table platform_private.shop_upgrade_jobs(request_id uuid,client_id integer,mode text,project_ref text,source_id uuid,client_binding text,source_sha256 text,target_sha256 text,state text,plan jsonb,plan_sha256 text,steps jsonb,verification jsonb,unknown_step text,created_at timestamptz,updated_at timestamptz);
 create table public.operator_audit(marker text);insert into public.operator_audit values('preserve-original-audit');
 insert into public.clients values(9002,'managed','Active','present','https://${ref}.supabase.co'),(9003,'byo','Active','present','https://${byoRef}.supabase.co');
 insert into public.bridge_sources values(9002,'${sourceId}','fixture-9002'),(9003,'${sourceId}','fixture-9003');
 insert into platform_private.approved_shop_releases values('support-v4','${v4.sha256}',true,false,'support-v6','optional','{}'),('support-v6','${v6.sha256}',true,true,null,'optional','{}');
 insert into platform_private.provision_jobs values('${managed}',9002,'2026-10-22');
 insert into platform_private.managed_release_pins values('${managed}','support-v4','${v4.sha256}');
 insert into platform_private.shop_backend_inventory values(9002,'${ref}','${sourceId}','fixture-9002',now(),'{"verified_release":null,"runtime_health":"healthy","compliance":"unable_to_verify","evidence":{"origin":"managed-provider-and-restricted-bridge"},"missing":[],"limitations":["Full source pending"]}',null),(9003,'${byoRef}','${sourceId}','fixture-9003',now(),'{"verified_release":null,"runtime_health":"healthy","compliance":"unable_to_verify","evidence":{"origin":"restricted-bridge-attestation"},"missing":[],"limitations":["Customer-reported"]}',null);
 ${job(managed,9002,'managed',ref)}${job(byo,9003,'byo',byoRef)}
 `);
 sql(read(migration));
 const m=report(9002),b=report(9003);
 assert.equal(m.recorded_upgrade.release_id,'support-v6');assert.equal(m.recorded_upgrade.completed_at,'2026-10-24T18:45:00+00:00');
 assert.equal(m.recorded_upgrade.evidence_strength,'provider-acknowledged-and-read-back');assert.equal(m.historical[0].release_id,'support-v4');assert.equal(m.report.verified_release,null);assert.equal(m.last_verified,null);
 assert.equal(b.recorded_upgrade.release_id,'support-v6');assert.equal(b.recorded_upgrade.evidence_strength,'customer-reported');assert.equal(b.recorded_upgrade.components_verified,false);assert.deepEqual(b.historical,[]);
 result.checks.push('Managed/BYO v6 receipt, timestamp and distinct evidence strength; v4 pin preserved; no acknowledgment promoted to independent verification');
 const before=sql('select count(*) from public.operator_audit');
 const changed=[
  ['project_ref',literal('zyxwvutsrqponmlkjihg')],['mode',literal('byo')],['source_id',literal('99200000-0000-4000-8000-000000000099')],['client_binding',literal('other-binding')],['client_id','9003']
 ];
 for(const [column,value]of changed){const r=JSON.parse(sql(`begin;update platform_private.shop_upgrade_jobs set ${column}=${value} where request_id='${managed}';select public.platform_backend_inventory_status(9002);rollback;`));assert.equal(r.recorded_upgrade,null,column)}
 assert.equal(JSON.parse(sql(`begin;update platform_private.shop_upgrade_jobs set plan=jsonb_set(plan,'{source_id}','"changed"') where request_id='${managed}';select public.platform_backend_inventory_status(9002);rollback;`)).recorded_upgrade,null);
 const modeChanged=JSON.parse(sql("begin;update public.clients set pairing_mode='byo' where id=9002;select public.platform_backend_inventory_status(9002);rollback;"));assert.equal(modeChanged.recorded_upgrade,null);assert.equal(modeChanged.report,null);assert.equal(modeChanged.last_verified,null);
 result.checks.push('Exact client/project/mode/source/binding and plan identity reject mismatches');
 for(const update of ["steps='{}'","unknown_step='function:support-tickets'","steps=jsonb_set(steps,'{function:support-tickets,sha256}','\"wrong\"')","plan_sha256=null"]){
  const r=JSON.parse(sql(`begin;update platform_private.shop_upgrade_jobs set ${update} where request_id='${managed}';select public.platform_backend_inventory_status(9002);rollback;`));assert.equal(r.recorded_upgrade,null,update)
 }
 result.checks.push('Incomplete/hash-mismatched/unknown/unapproved-plan evidence is not a completed receipt');
 sql(`insert into platform_private.shop_upgrade_jobs select '${later}',client_id,mode,project_ref,source_id,client_binding,source_sha256,target_sha256,'paused',plan,plan_sha256,'{"function:support-tickets":{"state":"failed"}}',null,'function:support-tickets','2026-10-25','2026-10-25' from platform_private.shop_upgrade_jobs where request_id='${managed}';`);
 const pending=report(9002);assert.equal(pending.recorded_upgrade.request_id,managed);assert.equal(pending.latest_upgrade_operation.request_id,later);assert.equal(pending.latest_upgrade_operation.state,'paused');assert.equal(pending.latest_upgrade_operation.has_failed_steps,true);assert.equal(pending.latest_upgrade_operation.has_unknown_step,true);
 result.checks.push('Later paused/failed/uncertain operation remains separate from old completion');
 const historic=JSON.parse(sql(`begin;update platform_private.approved_shop_releases set approved_for_new=false;select public.platform_backend_inventory_status(9002);rollback;`));assert.equal(historic.recorded_upgrade.release_id,'support-v6');
 assert.equal(sql("select has_function_privilege('anon','public.platform_backend_inventory_status(integer)','EXECUTE'),has_function_privilege('authenticated','public.platform_backend_inventory_status(integer)','EXECUTE'),has_function_privilege('service_role','public.platform_backend_inventory_status(integer)','EXECUTE')"),'f|t|f');
 assert.equal(sql('select count(*) from public.operator_audit'),before);
 result.checks.push('Receipt survives fresh-target changes; RPC ACL preserved; original audit untouched');
 // Validate the new read-only catalog query without installing a Shop or running upgrades.
 sql(`create table public.shop_config(id integer,platform_client_id integer);insert into public.shop_config values(1,9002);create table app_private.bridge_config(singleton boolean,source_id uuid,client_binding text);insert into app_private.bridge_config values(true,'${sourceId}','fixture-9002');`);
 const metadata=JSON.parse(sql(databaseSourceQuery(v6)));assert.equal(metadata.identity.client_id,9002);assert.equal(metadata.routines.length,8);assert.equal(metadata.tables.length,5);
 result.checks.push('Actual catalog SELECT executes with absent objects returning missing evidence rather than fake matches');
 // The actual frontend consumes the actual RPC JSON returned above.
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),pState={selectedClient:null};
 const context={pState,pb:{rpc:async()=>({data:pState.fixture,error:null})},captureView:()=>({page:'client-detail',role:'master_admin'}),viewCurrent:()=>true,esc,releaseName:s=>String(s||'Not established').replace(/^support-v/,'Support v'),technicalRows:rows=>rows.map(([k,v])=>esc(k)+': '+esc(v)).join(';'),evidenceDetails:(label,value)=>esc(label)+esc(JSON.stringify(value))};
 vm.createContext(context);vm.runInContext(read('src/backend-inventory.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),context);
 for(const [data,project]of [[pending,ref],[b,byoRef]]){
  const client={id:data.client_id,pairing_mode:data.mode,supabase_url:`https://${project}.supabase.co`};pState.selectedClient=client;pState.fixture=data;
  await context.loadBackendInventory();const html=context.backendInventoryPanel(client,true);assert.match(html,/Support v6/);assert.match(html,/2026-10-24/);assert.match(html,/Independently verified installed release/);assert.match(html,/Pending/);assert.match(html,/Healthy/);
  if(data.mode==='byo')assert.match(html,/customer-reported upgrade reviewed/);else assert.match(html,/Latest separate upgrade operation/);
 }
 result.checks.push('Actual frontend load/render consumes real Managed/BYO RPC responses, showing receipts/current-pending/runtime/later operation separately');
 result.responses={managed:pending,byo:b};
 result.status='PASS';console.log('PASS one small PostgreSQL contract integration: '+result.checks.length+' focused assertions/groups');
}catch(error){result.status='FAIL';result.error=error.message;process.exitCode=1;console.error(error)}
finally{if(container){try{try{fs.writeFileSync(evidence+'/container.log',docker(['logs',container]))}catch{}result.isolation=docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}} {{json .NetworkSettings.Ports}}']);docker(['rm','-f',container]);result.owned_container_stopped=true}catch(error){result.cleanup_error=error.message;process.exitCode=1}}result.finished=new Date().toISOString();fs.writeFileSync(evidence+'/sql-reporting-contract.json',JSON.stringify(result,null,2))}
