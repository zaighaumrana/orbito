import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {validateSnapshot} from '../scripts/release-parity.mjs';
import {buildRelease} from '../../Orbitoshopv2-v1/scripts/build-platform-release.mjs';
import {installationPlan} from '../../Orbitoshopv2-v1/scripts/backend-plan.mjs';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
import {ticketHandler as shopTicketHandler} from '../../Orbitoshopv2-v1/supabase/functions/support-tickets/handler.ts';
import {deliverSubmission} from '../../Orbitoshopv2-v1/supabase/functions/support-tickets/delivery.ts';
import {inspectBackend} from '../../Orbitoshopv2-v1/scripts/inspect-backend.mjs';
import {createSupportClient} from '../../Orbitoshopv2-v1/src/platform/support.js';
const hash=x=>createHash('sha256').update(x).digest('hex'),id=n=>'99400000-0000-4000-8000-'+String(n).padStart(12,'0');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');
const packageNow=buildRelease(undefined,{support:true});
function snapshot(){const release=structuredClone(packageNow);return {release,source:{sha256:release.sha256},manifest:{release_id:'fixture-final',review_status:'approved-shared',sha256:release.sha256,migrations:release.migrations.length,functions:release.functions.length},active:{release_id:'fixture-final',sha256:release.sha256},catalog:[{release_id:'fixture-final',sha256:release.sha256,approved_for_new:true}],shopCatalog:{[release.sha256]:{release_id:'fixture-final'}},plan:installationPlan};}
function reseal(s){const {sha256,...body}=s.release;s.release.sha256=hash(JSON.stringify(body));s.source.sha256=s.release.sha256;s.manifest.sha256=s.release.sha256;s.active.sha256=s.release.sha256;s.catalog[0].sha256=s.release.sha256;s.shopCatalog={[s.release.sha256]:{release_id:'fixture-final'}};}
test('canonical release gate accepts complete executable Managed/BYO plans',()=>{const result=validateSnapshot(snapshot());assert.equal(result.requirements,10);assert.equal(result.functions,7);});
test('gate rejects content/source, gateway/dependency, installer omission and stale manifests without modifying immutable packages',()=>{
 for(const [label,change,expected] of [
 ['SQL drift',s=>{s.release.migrations[0].sql+='\n-- drift';reseal(s)},/Migration content/],
 ['source drift',s=>s.source.sha256='0'.repeat(64),/Committed backend/],
 ['gateway drift',s=>{const f=s.release.functions[0];f.verify_jwt=!f.verify_jwt;const {sha256,stage_sha256,...body}=f;f.sha256=hash(JSON.stringify(body));reseal(s)},/Gateway drift/],
 ['missing dependency',s=>{s.release.requirements.runtime.external_dependencies=[];reseal(s)},/runtime dependency/],
 ['missing function',s=>{s.release.functions.pop();s.manifest.functions--;reseal(s)},/Unmapped function/],
 ['installer omission',s=>{s.release.requirements.installers.byo.migrations.pop();reseal(s)},/installer requirements/],
 ['stale manifest',s=>s.manifest.sha256='0'.repeat(64),/Stale BYO manifest/]
 ]){const s=snapshot();change(s);assert.throws(()=>validateSnapshot(s),expected,label);console.log('REJECTED '+label);}
});
const migrations=[{version:'00000000000000',name:'fixture',sha256:'a'.repeat(64)}],fn={name:'login',verify_jwt:true,sha256:'b'.repeat(64)},runtime={database_reachable:true,edge_functions:true,authentication:true};
function observed(){return {origin:'fixture-only',database_source_match:true,migrations,functions:[{name:'login',present:true,verify_jwt:true,source_sha256:fn.sha256}],capabilities:{'support-identity':true},runtime};}
const packages={fixture_old:{migrations,functions:[fn]},fixture_current:{migrations:[...migrations,{version:'00000000000001',name:'second',sha256:'c'.repeat(64)}],functions:[fn]}};
const catalog=[{release_id:'fixture_old',sha256:'1'.repeat(64),supported:true,upgrade_policy:'optional'},{release_id:'fixture_current',sha256:'2'.repeat(64),supported:true,approved_for_new:true}];
test('release evidence, optional/required policy and runtime health are independent; unknown source never becomes verified',()=>{
 assert.equal(assessBackend(catalog,packages,observed()).compliance,'upgrade_available');assert.equal(assessBackend(catalog,packages,observed()).runtime_health,'healthy');
 assert.equal(assessBackend([{...catalog[0],upgrade_policy:'required'},catalog[1]],packages,observed()).compliance,'upgrade_required');
 const current={...observed(),migrations:packages.fixture_current.migrations,runtime:{...runtime,database_reachable:false}};const r=assessBackend(catalog,packages,current);assert.equal(r.compliance,'up_to_date');assert.equal(r.runtime_health,'unhealthy');
 assert.equal(assessBackend(catalog,packages,{...observed(),functions:[{name:'login',present:true,verify_jwt:true,source_sha256:null}]}).compliance,'unable_to_verify');
 assert.equal(assessBackend(catalog,packages,{...observed(),functions:[{name:'login',present:true,verify_jwt:false}]}).compliance,'drift');
 assert.equal(assessBackend(catalog,packages,{origin:'byo',capabilities:{'support-identity':true}}).verified_release,null);
});
test('real Support delivery helper persists before dispatch, retains original identity across receiver outage and lost acknowledgment',async()=>{
 const order=[],remote=new Map();let uncertain=true,queueState='pending';const request=id(1),ticket=id(2),body={action:'create',request_id:request,subject:'Scanner',category:'technical',message:'Disconnects'};
 const transport=async(input,init)=>{const p=JSON.parse(init.body);if(String(input).includes('/rest/v1/rpc/')){const name=String(input).split('/').at(-1);order.push(name);if(name==='support_submission')return Response.json({state:queueState});if(name==='support_delivery_claim')return Response.json({dispatch:true,lease_id:id(3),fields:p});if(name==='support_delivery_finish'){queueState=p.p_outcome;return Response.json(true);}throw Error('Unexpected RPC');}
  order.push('platform');if(!remote.has(p.request_id))remote.set(p.request_id,ticket);if(uncertain)throw Error('reply lost after receiver commit');return Response.json({accepted:true,ticket_id:remote.get(p.request_id),status:'Open'});
 };
 const args=[transport,'https://abcdefghijklmnopqrst.supabase.co','public','server-fixture','user-fixture','https://qrstabcdefghijklmnop.supabase.co/functions/v1/platform-support-tickets','a'.repeat(64),body,{source_id:id(4),client_binding:'fixture'}];
 const first=await deliverSubmission(...args);assert.equal(first.persisted,true);assert.equal(first.accepted,false);assert.equal(first.request_id,request);assert.ok(order.indexOf('support_submission')<order.indexOf('platform'));
 uncertain=false;const next=await deliverSubmission(...args);assert.equal(next.accepted,true);assert.equal(next.ticket_id,ticket);assert.equal(remote.size,1);
});
test('Shop browser keeps durable pending state and can restore it after tab/session loss without storage',async()=>{
 const actor={auth_user_id:id(1),session_id:id(2),role:'Business Owner',employee_id:null,source_id:id(3),client_binding:'fixture',platform_client_id:1};let saved;
 const sb={auth:{getSession:async()=>({data:{session:{user:{id:id(1)},access_token:'x.'+Buffer.from(JSON.stringify({session_id:id(2)})).toString('base64url')+'.x'}}}),getUser:async()=>({data:{user:{id:id(1)}}})},rpc:async(name)=>({data:name==='support_ticket_actor_context'?actor:saved?[saved]:[]}),functions:{invoke:async(_,{body})=>{if(body.action==='list')return {data:{tickets:[],has_more:false}};saved={request_id:body.request_id,fields:{subject:body.subject,category:body.category,message:body.message},state:'uncertain'};return {data:{persisted:true,accepted:false,request_id:body.request_id,delivery_state:'uncertain'}};}}};
 const c=createSupportClient(sb);await c.list();c.view.draft={subject:'Saved request',message:'Still pending',category:'technical'};await c.create();assert.equal(c.view.receipt,null);assert.equal(c.view.pending.request_id,saved.request_id);
 const restored=createSupportClient(sb);await restored.list();assert.equal(restored.view.pending.request_id,saved.request_id);assert.equal(restored.view.deliveryState,'uncertain');
});
test('financial retry reconciles its authoritative receipt before sending another mutation',async()=>{
 const payload={p_invoice:9,p_amount:20,p_method:'Cash',p_date:'2026-10-23',p_notes:''},record={invoice_id:9,amount:20,payment_method:'Cash',payment_date:'2026-10-23',notes:''},store=new Map([['orbito-operation:payment:9',JSON.stringify({requestId:id(1),payload})]]),calls=[];
 const ctx={pb:{rpc:async(name,args)=>{calls.push({name,args});return {data:{applied:true,record}}}},crypto,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};vm.createContext(ctx);vm.runInContext(strip(read('src/operations.js')),ctx);
 const result=await ctx.recordPayment({invoice_id:9,amount:20,payment_method:'Cash',payment_date:'2026-10-23'});assert.equal(result.amount,20);assert.deepEqual(calls.map(c=>c.name),['platform_financial_outcome']);assert.equal(store.size,0);
});
test('inventory loads only on request for one client and rejects departed responses',async()=>{
 const state={authenticated:true,page:'client-detail',authorityGeneration:1,currentUser:{auth_user_id:id(1),session_id:id(2),role:'master_admin'},selectedClient:{id:1},clientSelectionGeneration:1};let resolve;const calls=[];const ctx={pState:state,pb:{rpc:(name,args)=>{calls.push({name,args});return new Promise(r=>resolve=r);}},esc:String};vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);vm.runInContext(strip(read('src/ui-primitives.js')),ctx);vm.runInContext(strip(read('src/backend-inventory.js')),ctx);
 assert.equal(calls.length,0);const pending=ctx.loadBackendInventory();assert.equal(calls.length,1);assert.equal(calls[0].args.p_client,1);ctx.selectClient({id:2});resolve({data:{client_id:1,report:{}}});assert.equal(await pending,false);assert.equal(state.backendInventory,null);
 state.backendInventory={clientId:2,report:{evidence:{capabilities:{'support-identity':true}}}};const panel=ctx.backendInventoryPanel({id:2},true);assert.match(panel,/Support identity: Found/);assert.match(panel,/Last full verification/);
});

test('customer CLI inspection is exact-project authorized and invokes only fixed read operations',async()=>{
 const ref='abcdefghijklmnopqrst',calls=[],expected=packageNow.migrations.map(({version,name,sha256})=>({version,name,sha256}));let allowed=true;
 const execute=(_exe,args)=>{calls.push(args);if(args[0]==='--version')return '2.120.0';if(args.includes('--help'))return '--linked --project-ref --file --output-format --use-api --env-file';if(args[0]==='projects')return JSON.stringify(allowed?[{id:ref}]:[]);if(args[0]==='functions'&&args[1]==='list')return JSON.stringify(packageNow.functions.map(f=>({slug:f.name,verify_jwt:f.verify_jwt})));throw Error('Unexpected/non-read CLI operation');};
 const query=q=>q.includes('sc.platform_client_id')?[{platform_client_id:1,source_id:id(1),client_binding:'fixture'}]:q.includes('schema_migrations')?expected:q.includes('to_regprocedure')?[{present:true}]:[{capabilities:{capabilities:Object.fromEntries(packageNow.requirements.requirements.map(r=>[r.id,true])),runtime}}];
 const args=['--project-ref',ref,'--client-id','1','--cli','C:/synthetic/supabase.exe'];const result=await inspectBackend(args,{execute,query,report:()=>{}});assert.equal(result.read_only,true);assert.equal(result.compliance,'unable_to_verify');assert.ok(calls.every(a=>a[0]==='--version'||a.includes('--help')||a[0]==='projects'||a[0]==='functions'&&a[1]==='list'));
 allowed=false;await assert.rejects(inspectBackend(args,{execute,query:()=>{throw Error('Unauthorized query reached')},report:()=>{}}),/cannot inspect/);
});

test('legacy Shop pages receive retryable errors while modern clients opt into truthful durable-pending receipts',async()=>{
 const url='https://abcdefghijklmnopqrst.supabase.co',target='https://qrstabcdefghijklmnop.supabase.co/functions/v1/platform-support-tickets',actor={auth_user_id:id(40),session_id:id(41),role:'Business Owner',employee_id:null,source_id:id(42),client_binding:'fixture',platform_client_id:1};
 const token='x.'+Buffer.from(JSON.stringify({sub:actor.auth_user_id,session_id:actor.session_id,iss:url+'/auth/v1',aud:'authenticated',exp:Date.now()/1000+3600})).toString('base64url')+'.x';
 const env={SUPABASE_URL:url,SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',PLATFORM_SUPPORT_TICKETS_SECRET:'a'.repeat(64),PLATFORM_SUPPORT_TICKETS_ENDPOINT:target};
 const transport=async(input)=>{const u=String(input);if(u===target)throw Error('receiver down');if(u.endsWith('/auth/v1/user'))return Response.json({id:actor.auth_user_id});if(u.endsWith('support_ticket_actor_context'))return Response.json(actor);if(u.endsWith('support_submission'))return Response.json({state:'pending'});if(u.endsWith('support_delivery_claim'))return Response.json({dispatch:true,lease_id:id(43)});if(u.endsWith('support_delivery_finish'))return Response.json(true);throw Error('Unexpected fixture call');};
 const handler=shopTicketHandler(k=>env[k],transport),body={action:'create',request_id:id(44),subject:'Same original request',category:'technical',message:'Awaiting acknowledgment'};
 const request=modern=>new Request(url+'/functions/v1/support-tickets',{method:'POST',headers:{Authorization:'Bearer '+token,...(modern?{'x-client-info':'retrasell-support-journal-v1'}:{})},body:JSON.stringify(body)});
 const legacy=await handler(request(false));assert.equal(legacy.status,503);assert.match((await legacy.json()).error,/original request/);
 const modern=await handler(request(true));assert.equal(modern.status,202);const result=await modern.json();assert.equal(result.accepted,false);assert.equal(result.persisted,true);assert.equal(result.request_id,body.request_id);
 const duplicateLedger=[...catalog,{...catalog[1],release_id:'fixture_same_sql'}],samePackages={...packages,fixture_same_sql:packages.fixture_current};const ambiguous=assessBackend(duplicateLedger,samePackages,{...observed(),migrations:packages.fixture_current.migrations,database_source_match:false});assert.equal(ambiguous.observed_migration_release,null);assert.match(ambiguous.limitations.join(' '),/multiple release packages/);
});


test('M2 approved v8 selectors retain candidate denial and historical v6 contract',()=>{
 const release=JSON.parse(read('supabase/releases/shop-release-support-v8.json'));
 const catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
 const manifest=JSON.parse(readFileSync(new URL('../../Orbitoshopv2-v1/scripts/byo-release-manifest.json',import.meta.url),'utf8'));
 const active=JSON.parse(read('supabase/releases/active-shop-release.json'));
 const shopCatalog=JSON.parse(readFileSync(new URL('../../Orbitoshopv2-v1/scripts/backend-release-catalog.json',import.meta.url),'utf8'));
 const staged={release,source:packageNow,manifest,active,catalog,shopCatalog,plan:installationPlan};
 assert.equal(validateSnapshot(staged).requirements,10);
 assert.equal(catalog.filter(c=>c.approved_for_new).length,1);
 assert.equal(active.release_id,'support-v8');assert.equal(manifest.release_id,'support-v8');
 const candidate={...manifest,review_status:'candidate-local',supported:false,approved_for_new:false};
 const before=catalog.map(c=>c.release_id==='support-v8'?candidate:{...c,approved_for_new:c.release_id==='support-v7'});
 assert.equal(validateSnapshot({...staged,manifest:candidate,catalog:before,reviewOnly:true}).review_status,'candidate-local-not-promoted');
 assert.throws(()=>validateSnapshot({...staged,manifest:candidate,catalog:before}),/approved review/);
 assert.throws(()=>validateSnapshot({...staged,catalog,reviewOnly:true}),/Candidate review/);
 const old=JSON.parse(read('supabase/releases/shop-release-support-v6.json'));
 assert.ok(catalog.find(c=>c.release_id==='support-v6').supported);
 // An isolated historical snapshot proves v6's eight-requirement contract, not fresh approval today.
 const historical={...staged,release:old,source:{sha256:old.sha256},manifest:{release_id:'support-v6',sha256:old.sha256,migrations:38,functions:7,review_status:'approved-shared'},active:{release_id:'support-v6',sha256:old.sha256},catalog:catalog.map(c=>({...c,approved_for_new:c.release_id==='support-v6'}))};
 assert.equal(validateSnapshot(historical).requirements,8);
});

test('approved-selector simulation preserves original Managed release pins and validates the exact returned package',async()=>{
 const {activeRelease,releases,pinManagedRelease}=await import('../supabase/functions/_shared/shop-release-registry.ts');
 const saved=structuredClone(activeRelease),seen=[];
 try{
  Object.assign(activeRelease,{release_id:'support-v8',sha256:releases['support-v8'].sha256});
  const old={release_id:'support-v4',sha256:releases['support-v4'].sha256};
  const original=await pinManagedRelease({rpc:async(name,args)=>{seen.push({name,args});return {data:old}}},id(880));
  assert.equal(original,releases['support-v4']);assert.equal(seen[0].args.p_request,id(880));
  assert.equal(seen[0].args.p_release,'support-v8','Future approval may pin a fresh request, never silently retarget an old one');
  await assert.rejects(pinManagedRelease({rpc:async()=>({data:{...old,sha256:'0'.repeat(64)}})},id(881)),/Pinned release unavailable/);
  const fresh=await pinManagedRelease({rpc:async(_name,args)=>({data:{release_id:args.p_release,sha256:args.p_sha256}})},id(882));
  assert.equal(fresh,releases['support-v8']);
 }finally{Object.assign(activeRelease,saved)}
 assert.equal(activeRelease.release_id,'support-v8');assert.equal(JSON.parse(read('supabase/releases/active-shop-release.json')).release_id,'support-v8');
});
