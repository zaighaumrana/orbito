import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
import {installationPlan} from '../supabase/functions/_shared/backend-plan.js';
import {InvocationBudget,ManagedPause} from '../supabase/functions/_shared/managed-invocation.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');
test('route data is one owned, role-verified request; unrelated datasets and departed responses cannot publish',async()=>{
 const state={authenticated:true,dataReady:true,authorityGeneration:1,page:'overview',modal:null,currentUser:{auth_user_id:'a',session_id:'s',role:'master_admin'},clientSelectionGeneration:1,data:{clients:[],payments:['unrelated'],platformUsers:[]}};
 const calls=[];let release;const pb={rpc:(name,args)=>{calls.push({name,args});return new Promise(r=>release=r)}};
 const ctx={pState:state,pb,refreshRoleState:()=>{throw Error('role mismatch')},URL};vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);
 vm.runInContext(strip(read('src/supabase.js').replace(/^export const pb =.*$/m,'').replace(/^export const PLATFORM_AUTH_EMAIL =.*$/m,'')).replaceAll('import.meta.env','({})'),ctx);
 const pending=ctx.loadPlatform();assert.equal(calls.length,1);assert.equal(calls[0].name,'platform_route_resource');assert.equal(calls[0].args.p_resource,'overview');
 release({data:{auth_user_id:'a',session_id:'s',role:'master_admin',data:{clients:[],overview:{clients:5}}}});await pending;assert.equal(state.dataReady,true);assert.deepEqual(state.data.payments,['unrelated']);
 state.page='clients';state.filter='needle';state.resourceOffset=50;const stale=ctx.loadPlatform();assert.equal(calls[1].args.p_search,'needle');assert.equal(calls[1].args.p_offset,50);state.clientSelectionGeneration++;state.page='support';release({data:{auth_user_id:'a',session_id:'s',role:'master_admin',data:{clients:[{id:99}]}}});await stale;assert.equal(state.data.clients.length,0);
 console.log('ROUTE_REQUESTS: previous master aggregate=13; current route payload=1; billing/team/usage absent from initial route requests.');
});
test('budget reserves time and isolates owner/preflight work units',()=>{
 let now=0;const b=new InvocationBudget(0,()=>now);b.beforeWork('migration:1');assert.throws(()=>b.beforeWork('bridge-owner'),ManagedPause);now=60000;assert.throws(()=>b.beforeWork('function:login'),ManagedPause);
});
function engineFixture(failSecret=false,loseMigration=false){
 const sha=s=>createHash('sha256').update(s).digest('hex'),ref='abcdefghijklmnopqrst',request={action:'managed-setup',client_id:1,request_id:'request',params:{site_key:'public-site'}},history=[],stages=new Map(),deployed=new Map(),writes=[];let unknown=null,onboarded=false;
 const migrations=Array.from({length:6},(_,i)=>({version:String(i+1),name:'m'+i,sql:'select '+i+';',sha256:sha('select '+i+';')}));
 const release={migrations,functions:[{name:'login',entrypoint:'login/index.ts',verify_jwt:true,stage_sha256:'fn',files:[{path:'login/index.ts',content:'export {}'}]}],stage_checksums:{migrations:'all-migrations',functions:'all-functions'}};
 const admin={from:()=>({select(){return this},eq(){return this},single:async()=>({data:{supabase_url:'https://'+ref+'.supabase.co',pairing_mode:'managed',onboarding_version:2,lifecycle_state:'Provisioning'}})}),
  command:async(kind,args={})=>{if(kind==='check')return {data:{unknown_step:unknown}};if(kind==='reconciled'){assert.ok(unknown.startsWith('migration:'));unknown=null;}if(kind==='dispatch'){assert.equal(unknown,null);unknown=args.step;}if(kind==='verified-stage'){assert.equal(unknown,args.p_name);unknown=null;stages.set(args.p_name,args.p_checksum);}return {data:{}};},
  rpc:async(name,args)=>{if(name==='platform_managed_stage'){if(stages.has(args.p_name))return {data:{skip:true}};if(args.p_state==='passed')stages.set(args.p_name,args.p_checksum);return {data:{skip:false}};}if(name==='platform_onboarding_step')return {data:{project_ref:ref,payload:{client_binding:'orbito-client-1',request_id:'owner-request'},call_secret:'synthetic',source_secret:'synthetic'}};return {data:{infrastructure:'ready'}};}};
 const fetcher=async(input,init={})=>{const u=String(input);if(u.endsWith(ref))return Response.json({id:ref});if(u.endsWith('/database/migrations'))return Response.json(history.map(h=>({version:h.version})));
  if(u.endsWith('/database/query')){const q=JSON.parse(init.body).query;if(q.startsWith('select version'))return Response.json(history);if(q.includes('from pg_tables'))return Response.json([{count:0}]);if(q.includes('sc.onboarding_version'))return Response.json([{onboarding_version:onboarded?2:0,onboarding_completed_at:null,platform_client_id:onboarded?1:null,client_binding:onboarded?'orbito-client-1':null,owner_request:onboarded?'owner-request':null,has_owner:false}]);const m=migrations.find(m=>q.includes("version='"+m.version+"'"));assert.ok(m);assert.ok(!history.some(h=>h.version===m.version),'no migration replay');writes.push('migration:'+m.version);history.push({...m,statements:[m.sql]});if(loseMigration){loseMigration=false;throw Error('reply lost after commit');}return Response.json([]);}
  if(u.endsWith('/secrets')){writes.push('secrets');if(failSecret)throw Error('lost reply');return Response.json([]);}
  if(u.includes('/functions/deploy')){const meta=JSON.parse(init.body.get('metadata'));deployed.set(meta.name,{slug:meta.name,verify_jwt:meta.verify_jwt});writes.push('function:'+meta.name);return Response.json({});}
  if(u.endsWith('/functions'))return Response.json([...deployed.values()]);if(u.includes('/api-keys'))return Response.json([]);throw Error('Unexpected synthetic request');};
 const ctx={installationPlan,TextEncoder,URL,InvocationBudget,ManagedPause,crypto,Response,FormData,Blob,AbortSignal,Deno:{env:{get:()=> 'synthetic'}},fetch:fetcher,pinManagedRelease:async()=>release,legacyPublicAnonKey:()=> 'public-anon',configureSupportAuth:async()=>{},runOnboarding:async(_a,r)=>{writes.push(r.action);onboarded=true;}};vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(strip(read('supabase/functions/_shared/managed-setup.ts'))),ctx);
 return {run:()=>{const b=new InvocationBudget();return ctx.runManagedSetup(admin,request,'https://qrstabcdefghijklmnop.supabase.co','one-time-secret',{},'master',{beforeWork:b.beforeWork.bind(b),fetch:fetcher})},writes,history,stages};
}
test('actual Managed engine advances across bounded invocations without replay and completes owner/preflight',async()=>{
 const f=engineFixture();let done=false,pauses=0;for(let n=0;n<12;n++){try{const result=await f.run();assert.equal(result.state,'complete');done=true;break}catch(e){if(!(e instanceof ManagedPause))throw e;pauses++;}}
 assert.equal(done,true);assert.ok(pauses>=2);assert.equal(f.history.length,6);assert.equal(f.writes.filter(w=>w==='function:login').length,1);assert.equal(f.writes.filter(w=>w==='bootstrap-shop').length,1);assert.equal(f.writes.filter(w=>w==='onboarding-status').length,1);
});
test('lost secret response is fenced before dispatch and never automatically replayed',async()=>{
 const f=engineFixture(true);for(let n=0;n<4;n++){try{await f.run()}catch(e){if(e instanceof ManagedPause)continue;break}}
 const count=f.writes.filter(w=>w==='secrets').length;assert.equal(count,1);await assert.rejects(f.run(),/authoritative manual reconciliation/);assert.equal(f.writes.filter(w=>w==='secrets').length,count);
});

test('migration commit with lost acknowledgment is read back against pinned provenance before continuing',async()=>{
 const f=engineFixture(false,true);await assert.rejects(f.run(),/outcome unknown/);
 let done=false;for(let n=0;n<12;n++){try{await f.run();done=true;break}catch(e){if(!(e instanceof ManagedPause))throw e;}}
 assert.equal(done,true);assert.equal(f.writes.filter(w=>w==='migration:1').length,1);
});
test('actual frontend continues serially with one request, keeps secrets in memory and stops after an uncertain result',async()=>{
 for(const uncertain of [false,true]){
  const state={authenticated:true,authorityGeneration:1,page:'client-detail',currentUser:{auth_user_id:'a',session_id:'s',role:'master_admin'},selectedClient:{id:1,onboarding_version:2},clientSelectionGeneration:1,clientRequestGeneration:1,modal:{},clientData:{clientId:1,requestGeneration:1,config:{id:1},provisioning:{}}};
  const calls=[],messages=[];let active=0,maximum=0;
  const form={querySelectorAll:()=>[],elements:{site_key:{value:'public-site'},turnstile_secret:{value:'one-time-secret'}}};
  const ctx={pState:state,crypto,notify:{info(){},error:e=>messages.push(String(e))},render(){},loadClientData:async()=>false,pb:{functions:{invoke:async(_name,{body})=>{calls.push(body);active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,2));active--;if(uncertain)return {error:{}};return {data:calls.length<3?{state:'paused',request_id:body.request_id}:{state:'complete'}};}}}};
  vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);vm.runInContext(strip(read('src/provisioning.js')),ctx);vm.runInContext(strip(read('src/client-setup.js')),ctx);
  const paused=ctx.setupState(state.selectedClient,{provisioning:{job:{state:'paused',action:'managed-setup'}}});assert.equal(paused.busy,false);assert.equal(paused.action,'managed-setup');
  const pending=ctx.submitProvisioning(form,'managed-setup');await ctx.submitProvisioning(form,'managed-setup');await pending;
  assert.equal(maximum,1);assert.equal(calls.length,uncertain?1:3);assert.equal(new Set(calls.map(c=>c.request_id)).size,1);
  assert.ok(calls.every(c=>c.turnstile_secret==='one-time-secret'&&!('turnstile_secret' in c.params)));assert.equal(form.elements.turnstile_secret.value,'');
  if(uncertain)assert.match(messages.at(-1),/outcome unavailable/);
 }
});

test('controlled before/after route-ready requests, transferred bytes and latency use actual loaders',async()=>{
 const metrics={fixture_upstream_delay_ms:8};
 for(const baseline of [true,false]){
  const identity={auth_user_id:'a',session_id:'s',role:'master_admin'},clients=Array.from({length:120},(_,id)=>({id:id+1,name:'Synthetic client '+id,lifecycle_state:'Active',status:'Active',plan:'Basic',currency:'PKR'}));
  const ledger=Array.from({length:600},(_,id)=>({id,client_id:id%120+1,amount:50,recorded_at:'2026-10-23T00:00:00Z',module_type:'BILL',token_count:1,rate_at_log:50}));
  const state={authenticated:true,authorityGeneration:1,clientSelectionGeneration:1,page:'overview',currentUser:identity,data:{},clientView:'current'},calls=[];let bytes=0;
  const reply=async(name,data)=>{calls.push(name);bytes+=Buffer.byteLength(JSON.stringify(data));await new Promise(r=>setTimeout(r,8));return {data};};
  const pb={auth:{getUser:()=>reply('auth.getUser',{user:{id:'a'}})},rpc:(name)=>reply(name,name==='platform_operator_identity'?identity:name==='platform_route_resource'?{...identity,data:{clients:clients.slice(0,50),overview:{clients:120},usageSummary:[],invoices:[],offset:0,has_more:true}}:name==='platform_dashboard_summary'?{open_tickets:0}:name==='platform_team_history'?{operations:[]}:[]),from:table=>({select(){return this},order(){return this},range(){return reply(table,table==='clients'?clients:['usage_logs','billing_cycles','payments','client_credit','pricing_rate_log'].includes(table)?ledger:[])}})};
  const ctx={pState:state,pb,URL,refreshRoleState(){}};vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);
  const source=baseline?execFileSync('git',['show','a64582c711ba6db5e878dd9efaad8c85893c765d:src/supabase.js'],{encoding:'utf8'}):read('src/supabase.js');
  vm.runInContext(strip(source.replace(/^export const pb =.*$/m,'').replace(/^export const PLATFORM_AUTH_EMAIL =.*$/m,'')).replaceAll('import.meta.env','({})'),ctx);
  const start=performance.now();await ctx.loadPlatform();metrics[baseline?'before':'after']={requests:calls.length,response_bytes:bytes,route_ready_ms:+(performance.now()-start).toFixed(2),calls};
 }
 assert.equal(metrics.before.requests,13);assert.equal(metrics.after.requests,1);assert.ok(metrics.after.response_bytes<metrics.before.response_bytes);console.log('CONTROLLED_ROUTE_METRICS '+JSON.stringify(metrics));
});
