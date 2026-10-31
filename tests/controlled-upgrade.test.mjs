import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {makeUpgradePlan,requireUpgradeProgress,verifyUpgradeResult,digest} from '../supabase/functions/_shared/upgrade-contract.js';
import {executeUpgrade} from '../supabase/functions/_shared/upgrade-engine.js';
import {upgradeBackend} from '../../Orbitoshopv2-v1/scripts/upgrade-backend.mjs';
import {hasUpgradePlan,upgradeActionAllowed} from '../src/upgrade-assessment.js';
import {classifyClosure} from '../scripts/support-closure-preflight.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=JSON.parse(read('supabase/releases/shop-release-support-v4.json')),target=JSON.parse(read('supabase/releases/shop-release-support-v10.json')),catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
const policy=r=>catalog.find(c=>c.sha256===r.sha256),identity={client_id:100,project_ref:'abcdefghijklmnopqrst',source_id:'99500000-0000-4000-8000-000000000001',client_binding:'fixture-100'};
const observation=r=>({shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:r.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:r.functions.map(({name,verify_jwt})=>({name,verify_jwt,present:true,source_sha256:null})),origin:'fixture-provider',runtime_ready:true});
const plan=()=>makeUpgradePlan(source,target,policy(source),policy(target),observation(source),identity);
test('actual v4→v10 plan contains only missing SQL and changed functions, preserving older healthy compatibility and source uncertainty',async()=>{
 const p=plan();assert.equal(p.steps.filter(s=>s.type==='migration').length,5);assert.deepEqual(p.steps.filter(s=>s.type==='function').map(s=>s.name).sort(),['function:platform-bridge','function:support-tickets','function:verify-pin']);assert.equal(p.source_fully_verified,false);
 assert.equal(verifyUpgradeResult(target,observation(target),identity).full_source_verified,false);
 assert.equal(await digest({b:2,a:{z:1,y:2}}),await digest({a:{y:2,z:1},b:2}),'JSONB key order must not change approval identity');
 assert.throws(()=>requireUpgradeProgress(target,p,observation(target).migrations,{}),/checkpoints/);requireUpgradeProgress(target,p,observation(target).migrations,Object.fromEntries(p.steps.filter(s=>s.type==='migration').map(s=>[s.name,{state:'passed'}])));
 for(const change of [o=>o.migrations[0].sha256='bad',o=>o.functions[0].verify_jwt=false,o=>o.shop.owner_busy=true,o=>o.shop.source_id='different']){const o=observation(source);change(o);assert.throws(()=>makeUpgradePlan(source,target,policy(source),policy(target),o,identity));}
 assert.throws(()=>makeUpgradePlan(source,target,{...policy(source),compatibility:{bridge:2}},policy(target),observation(source),identity),/Protocol/);
});
test('real bounded executor pauses serially and resumes original checkpoints; lost provider ACK never becomes a passed step',async()=>{
 const job={request_id:'same-original-request',plan:plan(),steps:{}},events=[];let unknown=null,state='running';
 const command=async(kind,args={})=>{events.push(kind);if(kind==='dispatch'){assert.equal(unknown,null);unknown=args.step;}if(kind==='passed'){assert.equal(unknown,args.step);job.steps[args.step]={state:'passed'};unknown=null;}if(kind==='pause'){assert.equal(unknown,null);state='paused';}if(kind==='finish')state='verification_required';return {...job,state};};
 const adapter={command,inspect:async()=>{},migrate:async()=>events.push('sql'),deploy:async()=>events.push('function'),verify:async()=>verifyUpgradeResult(target,observation(target),identity)};
 assert.equal((await executeUpgrade(job,target,adapter)).state,'paused');assert.equal(Object.keys(job.steps).length,2);assert.equal((await executeUpgrade(job,target,adapter)).state,'paused');assert.equal(Object.keys(job.steps).length,4);assert.equal((await executeUpgrade(job,target,adapter)).state,'paused');assert.equal(Object.keys(job.steps).length,6);assert.equal((await executeUpgrade(job,target,adapter)).state,'verification_required');assert.equal(Object.keys(job.steps).length,8);assert.equal(events.filter(e=>e==='sql').length,5);
 const failed={...job,steps:{}};unknown=null;await assert.rejects(executeUpgrade(failed,target,{...adapter,migrate:async()=>{throw Error('lost after commit');}}),/uncertain/);assert.ok(unknown);assert.equal(events.at(-1),'uncertain');
});
test('customer apply refuses missing clearance or blocked authoritative operations before any provider write and rejects legacy Managed terminal authority',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'upgrade-gates-'));let calls=0;
 try{
  const args=['--mode','byo','--project-ref',identity.project_ref,'--client-id','100','--from-sha',source.sha256,'--journal',join(dir,'journal.json'),'--apply'];
  await assert.rejects(upgradeBackend(['--mode','managed']),/Platform/);await assert.rejects(upgradeBackend(args,{invoke:()=>{calls++;throw Error();}}),/clearance/i);assert.equal(calls,0);assert.equal(existsSync(join(dir,'journal.json')),false);
  const p=plan(),platformRef='zyxwvutsrqponmlkjihg',request='99500000-0000-4000-8000-000000000010';
  writeFileSync(join(dir,'approval.json'),JSON.stringify({contract:'retrasell-byo-upgrade-clearance-v1',platform_url:`https://${platformRef}.supabase.co`,platform_public_key:'sb_publishable_'+('synthetic_only_').repeat(3),token:'b'.repeat(64),request_id:request,plan:p,plan_sha256:await digest(p)}));
  const fetch=async(url,init)=>{assert.equal(url,`https://${platformRef}.supabase.co/auth/v1/settings`);assert.equal(init.method,'GET');assert.equal(init.headers['x-retrasell-upgrade-token'],undefined);return Response.json({external:{email:true}});};
  let writes=0;const o=observation(source);
  const query=async q=>{if(!q.startsWith('select ')){writes++;throw Error('No provider mutation expected');}if(q.includes('from public.shop_config'))return [o.shop];if(q.includes('schema_migrations'))return o.migrations;return [{runtime:{owner_account:'active',checks:{database:true}}}];};
  const invoke=a=>{if(a[0]==='--version')return '2.120.0';if(a.includes('--help'))return '--linked --project-ref --file --output-format --use-api --env-file';if(a[0]==='projects')return JSON.stringify([{id:identity.project_ref}]);if(a[0]==='functions'&&a[1]==='list')return JSON.stringify(source.functions.map(f=>({name:f.name,verify_jwt:f.verify_jwt})));writes++;throw Error('No function deployment expected');};
  await assert.rejects(upgradeBackend([...args,'--approval-file',join(dir,'approval.json'),'--platform-project-ref',platformRef,'--cli','C:/fixture/supabase.exe'],{query,invoke,fetch,confirm:async()=>`UPGRADE ${identity.project_ref} ${target.sha256}`,platform:async()=>{throw Error('Authoritative pending configuration blocked');}}),/pending configuration/);
  assert.equal(writes,0);assert.equal(JSON.parse(readFileSync(join(dir,'journal.json'))).request_id,request);
  let history=o.migrations,claims=0;const ledger={...identity,mode:'byo',source_sha256:source.sha256,request_id:request,target_sha256:target.sha256,plan_sha256:await digest(p),plan:p,steps:{},state:'approved'};
  const platform=async(action,fields={})=>{
   if(action==='customer-claim'){assert.ok(['approved','paused'].includes(ledger.state));claims++;ledger.state='running';return structuredClone({...ledger,invocation:`99500000-0000-4000-8000-0000000000${claims+20}`});}
   assert.equal(action,'customer-command');const {kind,args}=fields;
   if(kind==='dispatch'){assert.equal(ledger.unknown_step,undefined);ledger.unknown_step=args.step;}
   if(kind==='passed'){assert.equal(ledger.unknown_step,args.step);ledger.steps[args.step]={state:'passed'};delete ledger.unknown_step;}
   if(kind==='pause')ledger.state='paused';if(kind==='finish')ledger.state='verification_required';return kind==='check'?{}:structuredClone(ledger);
  };
  const successfulQuery=async q=>{if(q.startsWith('begin;')){writes++;history=observation(target).migrations.slice(0,history.length+1);return [];}if(q.includes('schema_migrations'))return history;return query(q);};
  const successfulInvoke=a=>{if(a[0]==='functions'&&a[1]==='deploy'&&!a.includes('--help')){writes++;return '{}';}return invoke(a);};
  const result=await upgradeBackend([...args,'--approval-file',join(dir,'approval.json'),'--platform-project-ref',platformRef,'--cli','C:/fixture/supabase.exe'],{query:successfulQuery,invoke:successfulInvoke,fetch,confirm:async()=>`UPGRADE ${identity.project_ref} ${target.sha256}`,platform,report:()=>{}});
  assert.equal(result.state,'verification_required');assert.equal(writes,8);assert.equal(claims,4);assert.equal(JSON.parse(readFileSync(join(dir,'journal.json'))).request_id,request);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('populated Platform intake cannot be treated as empty closure; already-closed target is recognized without mutation',()=>{
 assert.match(classifyClosure({platform_schema:true,clients:1,tickets:1,jobs:0,pins:0,closure_applied:false}),/BLOCKED-POPULATED/);assert.equal(classifyClosure({platform_schema:true,closure_applied:true,anonymous_closed:true}),'already-applied-and-closed');assert.throws(()=>classifyClosure({platform_schema:false}),/never.*Shop/);
});
test('upgrade frontend captures approval fields before submitting render and denies departed or unauthorized views',async()=>{
 const id='99500000-0000-4000-8000-000000000002',state={authenticated:true,page:'client-detail',authorityGeneration:1,currentUser:{auth_user_id:id,session_id:id,role:'master_admin'},selectedClient:{id:100,pairing_mode:'managed'},clientSelectionGeneration:1,backendUpgrade:{clientId:100,job:{request_id:id,project_ref:identity.project_ref,target_sha256:target.sha256,plan_sha256:'a'.repeat(64)}}};state.backendUpgrade.job={...state.backendUpgrade.job,...identity,state:'review',mode:'managed',source_sha256:source.sha256,plan_sha256:'a'.repeat(64),plan:plan()};let args,fields=[{id:'upgrade-source-review',value:'real-source-review'}];
 const ctx={upgradeActionAllowed,hasUpgradePlan,pState:state,document:{querySelectorAll:()=>fields},pb:{rpc:async(name,a)=>{if(name==='platform_upgrade_approve')args=a;return {data:state.backendUpgrade.job};}},esc:String,inputDialog:async()=>`UPGRADE ${identity.project_ref} ${target.sha256}`,confirmDialog:async()=>true,notify:{error:()=>{}}};vm.createContext(ctx);
 const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');vm.runInContext(strip(read('src/async-context.js')),ctx);vm.runInContext(strip(read('src/backend-upgrade.js')),ctx);
 await ctx.handleUpgrade('upgrade-approve',()=>{fields=[];});assert.equal(args.p_conditions.source_review_reference,'real-source-review');
 state.currentUser.role='billing_person';args=null;await ctx.handleUpgrade('upgrade-approve',()=>{});assert.equal(args,null);
});


test('approved v10 preserves optional v9/v8/v7 upgrades and rejects unapproved targets or drift',()=>{
 const v7=JSON.parse(read('supabase/releases/shop-release-support-v7.json')),approved=policy(target);
 assert.equal(approved.approved_for_new,true);assert.equal(approved.supported,true);
 assert.equal(policy(v7).supported,true);assert.equal(policy(v7).approved_for_new,false);assert.equal(policy(v7).successor,'support-v10');assert.equal(policy(v7).upgrade_policy,'optional');
 const manifest=r=>r.migrations.map(({version,name,sha256})=>({version,name,sha256}));
 assert.deepEqual(target.functions.filter(f=>f.name!=='verify-pin'),v7.functions.filter(f=>f.name!=='verify-pin'));assert.notEqual(target.functions.find(f=>f.name==='verify-pin').sha256,v7.functions.find(f=>f.name==='verify-pin').sha256);
 assert.deepEqual(manifest(target).slice(0,-3),manifest(v7));assert.equal(target.migrations.at(-1).version,'20261031003158');
 for(const [version,missing] of [['support-v2',8],['support-v3',6],['support-v4',5],['support-v6',4],['support-v7',3],['support-v8',2],['support-v9',1]]){
  const older=JSON.parse(read('supabase/releases/shop-release-'+version+'.json'));
  assert.throws(()=>makeUpgradePlan(older,target,policy(older),{...approved,approved_for_new:false},observation(older),identity),/approved supported/);
  const proposed=makeUpgradePlan(older,target,policy(older),approved,observation(older),identity);
  assert.equal(proposed.steps.filter(s=>s.type==='migration').length,missing);
  if(['support-v6','support-v7','support-v8','support-v9'].includes(version))assert.deepEqual(proposed.steps.filter(s=>s.type==='function').map(s=>s.name),['function:verify-pin']);
 }
 const p=makeUpgradePlan(v7,target,policy(v7),approved,observation(v7),identity);
 assert.deepEqual(p.steps.map(s=>s.name),['migration:20261029173151','migration:20261030233527','migration:20261031003158','function:verify-pin']);
 assert.throws(()=>requireUpgradeProgress(target,p,observation(target).migrations,{}),/checkpoints/);
 requireUpgradeProgress(target,p,observation(target).migrations,Object.fromEntries(p.steps.filter(s=>s.type==='migration').map(s=>[s.name,{state:'passed'}])));
 assert.equal(verifyUpgradeResult(target,observation(target),identity).full_source_verified,false);
 const wrong=observation(v7);wrong.functions[0].verify_jwt=false;assert.throws(()=>makeUpgradePlan(v7,target,policy(v7),approved,wrong,identity),/gateway/);
});
