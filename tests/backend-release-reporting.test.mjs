import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {inventoryHandler} from '../supabase/functions/platform-backend-inventory/handler.ts';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
import {sqlSourceContract,compareDatabaseSource,compareFunctionSource,sourceFiles} from '../supabase/functions/_shared/backend-source-verification.ts';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
const packages=Object.fromEntries(['support-v4','support-v5','support-v6','support-v7'].map(id=>[id,JSON.parse(read('supabase/releases/shop-release-'+id+'.json'))]));
const identity={client_id:9002,project_ref:'abcdefghijklmnopqrst',source_id:'99100000-0000-4000-8000-000000000002',client_binding:'fixture-only-9002'};
const caps=Object.fromEntries(['usage-outbox','billing-projection','config-journal','support-identity','support-consent','support-durable-submissions','owner-bootstrap','private-rls'].map(k=>[k,true]));
const runtime=Object.fromEntries(['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'].map(k=>[k,true]));
function sqlEvidence(release){
 const c=sqlSourceContract(release);
 return {identity:{client_id:identity.client_id,source_id:identity.source_id,client_binding:identity.client_binding},
  routines:c.routines.map(signature=>{const name=signature.split('(')[0],d=c.definitions.get(name),roles=c.privileges.get(name);assert.ok(d&&roles,'immutable source must contain this required routine/ACL');return {signature,...d,settings:['search_path=""'],execute:Object.fromEntries(['anon','authenticated','service_role'].map(role=>[role,roles.has(role)||roles.has('public')]))}}),
  tables:c.tables.map(name=>({name,rls:true,anon_select:false,authenticated_select:false,policies:[]}))};
}
function multipart(manifest,files=manifest.files){
 const boundary='retrasell-source-test-7cc8c4',entry='file:///build/supabase/functions/'+manifest.entrypoint;
 const parts=[`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({entrypoint_path:entry})}\r\n`,
 ...files.map(f=>`--${boundary}\r\nContent-Disposition: form-data; name="file"\r\nsupabase-path: file:///build/supabase/functions/${f.path}\r\n\r\n${f.content}\r\n`),`--${boundary}--\r\n`];
 return new Response(parts.join(''),{headers:{'Content-Type':'multipart/form-data; boundary='+boundary}});
}
async function collect({mode='managed',release=packages['support-v6'],badIdentity=false,omitSource=false,capabilities=caps}={}){
 const calls=[],saved=[],claim={...identity,mode,catalog,invocation:'99100000-0000-4000-8000-000000000009'};
 const caller={auth:{getUser:async()=>({data:{user:{id:'fixture-master'}},error:null})},rpc:async()=>({data:claim,error:null})};
 const admin={rpc:async(name,args)=>{calls.push(name);if(name==='platform_backend_inventory_finish'){saved.push(args.p_report);return {data:null,error:null}}if(name==='platform_bridge_call_context')return {data:{...identity,bridge_call_secret:'fixture-only-call-credential-000000000000'},error:null};throw Error('Unexpected admin RPC '+name)}};
 const transport=async(input,init)=>{
  const url=String(input);calls.push({url,method:init.method});
  if(url.includes('/functions/v1/platform-bridge')){
   const request=JSON.parse(init.body);return Response.json({contract:'retrasell-backend-capabilities-v1',challenge:request.challenge,...identity,capabilities,runtime});
  }
  if(url===`https://api.supabase.com/v1/projects/${identity.project_ref}`)return Response.json({id:identity.project_ref});
  if(url.endsWith('/database/query')){
   const q=JSON.parse(init.body).query;assert.match(q.trim(),/^select /i);
   if(q.includes('as client_id'))return Response.json([{client_id:identity.client_id,source_id:badIdentity?'different':identity.source_id,client_binding:identity.client_binding}]);
   if(q.includes('supabase_migrations.schema_migrations'))return Response.json(release.migrations.map(({version,name,sha256})=>({version,name,sha256})));
   if(q.includes('as evidence'))return Response.json([{evidence:sqlEvidence(release)}]);
   throw Error('Unexpected query');
  }
  if(url.endsWith('/functions'))return Response.json(release.functions.map(f=>({slug:f.name,verify_jwt:f.verify_jwt,version:4,ezbr_sha256:f.sha256})));
  if(url.endsWith('/body')){assert.equal(init.headers.Accept,'multipart/form-data');const name=url.split('/').at(-2),manifest=release.functions.find(f=>f.name===name);return multipart(manifest,omitSource?manifest.files.slice(0,1):manifest.files)}
  throw Error('Unexpected provider operation '+url);
 };
 // Use the actual credential helper's sole RPC name, without forwarding secrets.
 const fixedAdmin={rpc:async(name,args)=>name==='platform_bridge_call_credential'?{data:{...identity,bridge_call_secret:'fixture-only-call-credential-000000000000'},error:null}:admin.rpc(name,args)};
 const handler=inventoryHandler(key=>key==='SUPABASE_URL'?'https://zyxwvutsrqponmlkjihg.supabase.co':key==='PLATFORM_MANAGEMENT_TOKEN'?'fixture-provider':undefined,()=>({caller,admin:fixedAdmin}),transport);
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture', 'Content-Type':'application/json'},body:JSON.stringify({client_id:identity.client_id})}));
 assert.equal(response.status,200,await response.clone().text());assert.equal(saved.length,1);
 return {report:(await response.json()).report,calls};
}
test('Managed v6 collects actual source/SQL components but never upgrades scoped evidence or bundle hashes to full verification',async()=>{
 const {report,calls}=await collect();assert.equal(report.runtime_health,'healthy');assert.equal(report.verified_release,null);
 assert.equal(report.evidence.source_comparison_release.release_id,'support-v6');
 assert.ok(report.evidence.database_verification.matched.length>=8);
 assert.equal(report.evidence.functions.filter(f=>f.source_status==='matched').length,7);
 assert.match(report.limitations.join(' '),/canonical catalog baseline/);
 assert.equal(calls.filter(c=>c.url?.endsWith('/body')).length,7);
 const partial=await collect({omitSource:true});assert.ok(partial.report.evidence.functions.some(f=>f.source_sha256===null));assert.equal(partial.report.verified_release,null);
 assert.ok(!calls.some(c=>c.url?.includes('/deploy')));
});
test('BYO remains customer/restricted evidence; mismatched Managed identity discards provider installation evidence',async()=>{
 const byo=await collect({mode:'byo'});assert.equal(byo.report.evidence.origin,'restricted-bridge-attestation');assert.equal(byo.report.verified_release,null);assert.ok(!byo.calls.some(c=>c.url?.includes('api.supabase.com')));
 const mismatch=await collect({badIdentity:true});assert.equal(mismatch.report.verified_release,null);assert.equal(mismatch.report.observed_migration_release,null);assert.match(mismatch.report.limitations.join(' '),/identity mismatch/);
});
test('v6 does not require the optional v7 capability; v7 preserves and requires its own field',async()=>{
 const v6=await collect();assert.equal('bounded-operational-reads' in v6.report.evidence.capabilities,false);
 const v7=await collect({release:packages['support-v7'],capabilities:{...caps,'bounded-operational-reads':true}});
 assert.equal(v7.report.evidence.capabilities['bounded-operational-reads'],true);
 const exact=release=>({migrations:release.migrations,functions:release.functions.map(f=>({...f,present:true,source_sha256:f.sha256})),database_source_match:true,capabilities:caps,runtime});
 assert.equal(assessBackend(catalog,packages,exact(packages['support-v6'])).verified_release?.release_id,'support-v6');
 assert.equal(assessBackend(catalog,packages,{...exact(packages['support-v6']),capabilities:{...caps,'bounded-operational-reads':false}}).verified_release?.release_id,'support-v6','optional absent v7 capability must not reject historical v6');
 assert.equal(assessBackend(catalog,packages,exact(packages['support-v7'])).verified_release,null);
 assert.equal(assessBackend(catalog,packages,{...exact(packages['support-v7']),capabilities:{...caps,'bounded-operational-reads':true}}).verified_release?.release_id,'support-v7');
});
test('source comparisons detect changed routine, ACL, RLS/policy and Edge bytes without substituting expected source',async()=>{
 const release=packages['support-v6'],evidence=sqlEvidence(release);
 evidence.routines[0].body+=' -- drift';evidence.routines[1].execute.anon=true;evidence.tables[0].rls=false;evidence.tables[1].policies=[{name:'unexpected'}];
 const result=await compareDatabaseSource(release,evidence,identity);assert.equal(result.status,'drift');assert.ok(result.mismatched.length>=4);
 await assert.rejects(compareDatabaseSource(release,{...evidence,identity:{...evidence.identity,source_id:'other'}},identity),/identity/);
 const manifest=release.functions[0],download=await sourceFiles(multipart(manifest));download.files[0].content+='changed';
 assert.equal((await compareFunctionSource(manifest,download,manifest.verify_jwt)).source_status,'drift');
 await assert.rejects(sourceFiles(new Response('ESZIP2.3',{headers:{'content-type':'application/octet-stream'}})),/Decoded multipart/);
 const report=assessBackend(catalog,packages,{migrations:release.migrations,database_verification:result,functions:[],capabilities:caps,runtime});assert.equal(report.compliance,'drift');
});
test('actual frontend loader consumes status RPC and separates Managed/BYO receipts, current verification, later operations and runtime',async()=>{
 const client={id:identity.client_id,pairing_mode:'managed',supabase_url:`https://${identity.project_ref}.supabase.co`};
 const record={request_id:'fixture-upgrade',release_id:'support-v6',mode:'managed',state:'completed_reviewed',completed_at:'2026-10-24T00:35:29Z',evidence_origin:'managed-provider-receipts',evidence_strength:'provider-acknowledged-and-read-back'};
 const response={...identity,mode:'managed',stale:false,recorded_upgrade:record,latest_upgrade_operation:{request_id:'later',state:'paused',release_id:'support-v7',has_unknown_step:true,has_failed_steps:true},historical:[{release_id:'support-v4',origin:'managed-job-pin'}],catalog,report:{runtime_health:'healthy',compliance:'unable_to_verify',verified_release:null,evidence:{},missing:['provider source unavailable'],limitations:['canonical baseline pending']}};
 const state={selectedClient:client,backendInventory:null},esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const context={pState:state,pb:{rpc:async name=>{assert.equal(name,'platform_backend_inventory_status');return {data:response,error:null}}},captureView:()=>({page:'client-detail',role:'master_admin'}),viewCurrent:()=>true,esc,releaseName:s=>String(s||'Not established').replace(/^support-v/,'Support v'),technicalRows:rows=>rows.map(([k,v])=>esc(k)+': '+esc(v)).join(';'),evidenceDetails:(title,value)=>esc(title)+esc(JSON.stringify(value))};
 vm.createContext(context);vm.runInContext(read('src/backend-inventory.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),context);
 assert.equal(await context.loadBackendInventory(),true);
 let html=context.backendInventoryPanel(client,true);
 for(const label of ['Last recorded backend upgrade','Support v6 — upgrade completed','2026-10-24T00:35:29Z','Independently verified installed release','Pending','Latest separate upgrade operation','paused','Healthy','Latest approved fresh release','support-v4','provider source unavailable'])assert.ok(html.includes(label),label);
 response.mode='byo';response.recorded_upgrade={...record,mode:'byo',evidence_origin:'customer-reported',evidence_strength:'customer-reported'};client.pairing_mode='byo';await context.loadBackendInventory();html=context.backendInventoryPanel(client,true);assert.match(html,/customer-reported upgrade reviewed/);
 response.client_id++;assert.equal(await context.loadBackendInventory(),true);assert.ok(state.backendInventory.error);
});
