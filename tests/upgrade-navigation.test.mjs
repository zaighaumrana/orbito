import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {hasUpgradePlan,upgradeActionAllowed,validateAssessment} from '../src/upgrade-assessment.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
const release=id=>catalog.find(r=>r.release_id===id),v4=release('support-v4'),v6=release('support-v6'),v7=release('support-v7');
const uuid=n=>'99600000-0000-4000-8000-'+String(n).padStart(12,'0');
const identity={client_id:2,project_ref:'abcdefghijklmnopqrst',source_id:uuid(1),client_binding:'fixture-client-2'};
function job(mode,request=uuid(2),from=v4,to=v6,state='completed_reviewed'){
 const steps=from===v4?[{type:'migration',name:'migration:20261023012311',sha256:'a'.repeat(64)},...['platform-bridge','support-tickets'].map(name=>({type:'function',name:'function:'+name,sha256:'b'.repeat(64)}))]:[{type:'migration',name:'migration:20261025233743',sha256:'c'.repeat(64)}];
 return {...identity,mode,request_id:request,state,source_sha256:from.sha256,target_sha256:to.sha256,plan_sha256:'d'.repeat(64),
  plan:{contract:'retrasell-controlled-upgrade-v1',...identity,source_sha256:from.sha256,target_sha256:to.sha256,source_release:from.release_id,target_release:to.release_id,compatibility:'additive-protocol-1',steps,source_fully_verified:false,evidence_origin:mode==='byo'?'customer-reported':'provider-read-only'},
  steps:Object.fromEntries(steps.map(s=>[s.name,{state:'passed',sha256:s.sha256}])),conditions:{source_review_reference:'old-review-only'},verification:{full_source_verified:false,limitations:['Original source limitation']},updated_at:'2026-10-24T18:45:00Z'};
}
function fixture(mode='managed'){
 let saved=job(mode),inputs=[],html='',uuids=0;
 const calls={rpc:[],edge:[]},client={id:2,pairing_mode:mode,supabase_url:`https://${identity.project_ref}.supabase.co`};
 const state={authenticated:true,page:'client-detail',authorityGeneration:1,currentUser:{auth_user_id:uuid(8),session_id:uuid(9),role:'master_admin'},selectedClient:client,clientSelectionGeneration:1,
  backendInventory:{clientId:2,catalog,report:{runtime_health:'healthy'}},clientData:{operations:{source:{source_id:identity.source_id}},provisioning:{connection:{client_binding:identity.client_binding}}}};
 const ctx={pState:state,hasUpgradePlan,upgradeActionAllowed,validateAssessment,crypto:{randomUUID:()=>uuid(100+ ++uuids)},document:{querySelectorAll:()=>inputs},esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),notify:{error:()=>{},success:()=>{}},
  pb:{rpc:async(name,args)=>{calls.rpc.push({name,args});return {data:structuredClone(saved)};},functions:{invoke:async(_,{body})=>{calls.edge.push(structuredClone(body));return {data:{job:job(mode,body.request_id,v6,v7,'review')}};}}}};
 vm.createContext(ctx);
 const load=(path,names)=>vm.runInContext(`(function(){${read(path).replace(/^import .*$/gm,'').replace(/^export /gm,'')}\nObject.assign(globalThis,{${names.join(',')}});})()`,ctx);
 load('src/async-context.js',['captureView','viewCurrent','selectClient']);
 load('src/ui-primitives.js',['technicalRows','evidenceDetails','releaseName']);
 load('src/upgrade-view.js',['renderUpgradePanel']);
 load('src/backend-upgrade.js',['handleUpgrade','upgradePanel']);
 const render=()=>{html=ctx.upgradePanel(state.selectedClient,true);};
 return {ctx,state,calls,render,get html(){return html},get saved(){return saved},set saved(j){saved=j},get uuids(){return uuids},set inputs(fields){inputs=Object.entries(fields).map(([id,value])=>({id,value:typeof value==='boolean'?'':value,checked:value===true}));},action:async action=>{await ctx.handleUpgrade(action,render);}};
}
function assessment(){
 const p=job('byo',uuid(70),v6,v7,'review').plan;
 return JSON.stringify({contract:'retrasell-byo-upgrade-assessment-v1',...identity,source_sha256:v6.sha256,target_sha256:v7.sha256,plan:p,
  observation:{shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:[{version:'20261023012311',name:'fixture',sha256:'e'.repeat(64)}],functions:[{name:'support-tickets',present:true,verify_jwt:true}],runtime_ready:true}});
}
const form=mode=>({'upgrade-source':v6.sha256,...(mode==='byo'?{'upgrade-assessment':assessment(),'upgrade-fresh-assessment':true}:{})});

test('Managed and BYO completed v4→v6 records remain viewable beside separate v6→v7 preparation',async()=>{
 for(const mode of ['managed','byo']){
  const f=fixture(mode),original=JSON.stringify(f.saved);
  await f.action('upgrade-status');assert.match(f.html,/Previous upgrade/);assert.match(f.html,/Support v4/);assert.match(f.html,/Support v6/);assert.match(f.html,/2026-10-24/);assert.match(f.html,/3 steps/);assert.match(f.html,/Original source limitation/);assert.match(f.html,/Prepare next upgrade/);
  await f.action('upgrade-prepare');assert.match(f.html,/View previous upgrade/);assert.match(f.html,/Approved target<\/span><strong>Support v7/);assert.match(f.html,/<select id="upgrade-source" >\s*<option value="">Choose an evidenced source/);assert.equal(f.state.backendUpgrade.requestId,null);assert.deepEqual(Object.keys(f.state.backendUpgrade.draft),[]);
  // Rerender/status refresh and a round trip to history must preserve the new form.
  f.inputs=form(mode);await f.action('upgrade-status');assert.equal(f.state.backendUpgrade.view,'next');await f.action('upgrade-previous');assert.match(f.html,/Previous upgrade target<\/span><strong>Support v6/);f.inputs={};await f.action('upgrade-prepare');assert.match(f.html,new RegExp(`value="${v6.sha256}" selected`));
  await f.action('upgrade-review');assert.equal(f.calls.edge.length,1);const sent=f.calls.edge[0];assert.equal(sent.source_sha256,v6.sha256);assert.notEqual(sent.request_id,f.saved.request_id);assert.equal(f.uuids,1);assert.equal(f.state.backendUpgrade.job.target_sha256,v7.sha256);assert.equal(f.state.backendUpgrade.job.plan.steps.length,1);assert.equal(f.state.backendUpgrade.job.plan.steps[0].type,'migration');assert.equal(f.state.backendUpgrade.pendingReview,null);assert.equal(JSON.stringify(f.saved),original);
  if(mode==='byo')assert.equal(sent.observation.shop.client_binding,identity.client_binding);else assert.equal(sent.observation,undefined);
  assert.equal(JSON.stringify(f.state.backendUpgrade.previousJob),original);await f.action('upgrade-previous');assert.match(f.html,/Previous upgrade target<\/span><strong>Support v6/);assert.match(f.html,/Return to current upgrade/);assert.doesNotMatch(f.html,/data-p-action="upgrade-prepare"/);await f.action('upgrade-current');assert.match(f.html,/Support v7/);assert.equal(f.state.backendUpgrade.job.request_id,sent.request_id);
 }
});

test('unfinished and uncertain jobs retain their request and block competing next reviews',async()=>{
 for(const state of ['review','approved','paused','running','uncertain','verification_required']){
  const j=job('managed',uuid(3),v6,v7,state);assert.equal(upgradeActionAllowed('upgrade-prepare',j,'managed'),false);assert.equal(upgradeActionAllowed('upgrade-review',j,'managed'),false);
 }
 for(const state of ['uncertain','verification_required']){
  const f=fixture();f.saved=job('managed',uuid(3),v6,v7,state);await f.action('upgrade-status');const original=f.state.backendUpgrade.job.request_id;await f.action('upgrade-prepare');await f.action('upgrade-review');assert.equal(f.calls.edge.length,0);assert.equal(f.state.backendUpgrade.job.request_id,original);assert.equal(f.uuids,0);assert.doesNotMatch(f.html,/data-p-action="upgrade-prepare"/);
 }
 assert.equal(upgradeActionAllowed('upgrade-prepare',job('byo',uuid(4),v6,v7,'cancelled'),'byo'),true);
});

test('lost review replies recover the same request and exact source/assessment in Managed and BYO',async()=>{
 for(const mode of ['managed','byo']){
  const f=fixture(mode);await f.action('upgrade-status');await f.action('upgrade-prepare');f.inputs=form(mode);
  f.ctx.pb.functions.invoke=async(_,{body})=>{f.calls.edge.push(structuredClone(body));throw Error('Reply lost');};
  await f.action('upgrade-review');const first=JSON.stringify(f.calls.edge[0]);assert.equal(f.state.backendUpgrade.needsRefresh,true);await f.action('upgrade-prepare');assert.equal(f.calls.edge.length,1);
  f.inputs={};await f.action('upgrade-status');assert.equal(f.state.backendUpgrade.view,'next');assert.match(f.html,/Retry original read-only review/);assert.match(f.html,/<select id="upgrade-source" disabled>/);
  f.inputs={'upgrade-source':v4.sha256,'upgrade-assessment':'changed invalid report'};
  f.ctx.pb.functions.invoke=async(_,{body})=>{f.calls.edge.push(structuredClone(body));return {data:{job:job(mode,body.request_id,v6,v7,'review')}};};
  await f.action('upgrade-review');assert.equal(JSON.stringify(f.calls.edge[1]),first);assert.equal(f.uuids,1);assert.equal(f.state.backendUpgrade.job.source_sha256,v6.sha256);
 }
 // BYO cannot create a fresh review from a previous receipt without fresh assessment.
 const f=fixture('byo');await f.action('upgrade-status');await f.action('upgrade-prepare');f.inputs={'upgrade-source':v6.sha256};await f.action('upgrade-review');assert.equal(f.calls.edge.length,0);assert.equal(f.uuids,0);assert.match(f.state.backendUpgrade.error,/assessment is empty/);
});

test('departed client/role responses cannot publish a recovered review or restart navigation',async()=>{
 for(const depart of [f=>f.ctx.selectClient({id:99,pairing_mode:'managed'}),f=>{f.state.currentUser.role='billing_person';f.state.authorityGeneration++;}]){
  const f=fixture();await f.action('upgrade-status');await f.action('upgrade-prepare');f.inputs=form('managed');let reply;
  f.ctx.pb.functions.invoke=(_,{body})=>{f.calls.edge.push(structuredClone(body));return new Promise(resolve=>reply=resolve);};
  const pending=f.action('upgrade-review');assert.equal(f.calls.edge.length,1);const request=f.calls.edge[0].request_id;depart(f);const before=f.state.backendUpgrade;reply({data:{job:job('managed',request,v6,v7,'review')}});await pending;assert.equal(f.state.backendUpgrade,before);assert.notEqual(f.state.backendUpgrade?.job?.request_id,request);
  await f.action('upgrade-prepare');assert.equal(f.calls.edge.length,1);
 }
});
