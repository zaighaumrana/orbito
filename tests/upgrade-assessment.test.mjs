import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateAssessment,hasUpgradePlan,upgradeActionAllowed} from '../src/upgrade-assessment.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('supabase/releases/approved-shop-releases.json'));
const source=catalog.find(r=>r.release_id==='support-v4'),target=catalog.find(r=>r.approved_for_new);
const identity={client_id:1,project_ref:'abcdefghijklmnopqrst',source_id:'99500000-0000-4000-8000-000000000001',client_binding:'fixture-1'};
const client={id:1,pairing_mode:'byo',supabase_url:`https://${identity.project_ref}.supabase.co`};
const p={contract:'retrasell-controlled-upgrade-v1',...identity,source_sha256:source.sha256,target_sha256:target.sha256,compatibility:'additive-protocol-1',steps:[{type:'migration',name:'migration:20261023012311',sha256:'a'.repeat(64)}]};
const report=()=>({contract:'retrasell-byo-upgrade-assessment-v1',...identity,source_sha256:source.sha256,target_sha256:target.sha256,plan:p,observation:{shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:[{version:'20261022155952',name:'support_session_consent',sha256:'b'.repeat(64)}],functions:[{name:'support-tickets',present:true,verify_jwt:true}],runtime_ready:true}});
const options={client,catalog,source:source.sha256,binding:identity,fresh:true};
test('assessment rejects malformed/unsupported reports and projects only existing nonsecret fields',()=>{
 assert.throws(()=>validateAssessment('',options),/empty/);assert.throws(()=>validateAssessment('{',options),/not valid JSON/);
 const r=report();r.contract='unknown-v2';assert.throws(()=>validateAssessment(JSON.stringify(r),options),/Unsupported assessment version/);
 delete r.observation;r.contract=report().contract;assert.throws(()=>validateAssessment(JSON.stringify(r),options),/missing/);
 const valid=report();valid.observation.shop.unexpected='not-forwarded';valid.observation.secret='not-forwarded';
 const result=validateAssessment(JSON.stringify(valid),options);assert.equal(result.shop.unexpected,undefined);assert.equal(result.secret,undefined);assert.equal(result.runtime_ready,true);
});
test('assessment preserves exact customer/source/target and rejects stale, conflicting and unfinished evidence',()=>{
 const check=(change,pattern)=>{const r=report();change(r);assert.throws(()=>validateAssessment(JSON.stringify(r),options),pattern);};
 check(r=>r.project_ref='zyxwvutsrqponmlkjihg',/different customer/);check(r=>r.source_id='changed',/outdated or different pairing/);
 check(r=>r.source_sha256=target.sha256,/historical source/);check(r=>r.target_sha256=source.sha256,/upgrade target/);
 check(r=>r.generated_at='2000-01-01',/stale/);check(r=>r.expires_at='2000-01-01',/expired/);check(r=>r.observation.functions=[null],/incomplete/);check(r=>r.observation.shop.owner_busy=true,/pending configuration/);
 assert.throws(()=>validateAssessment(JSON.stringify(report()),{...options,fresh:false}),/no collection timestamp/);
 assert.throws(()=>validateAssessment(JSON.stringify(report()),{...options,job:{state:'review',source_sha256:'x'}}),/conflicts with the original/);
 const job={...identity,source_sha256:source.sha256,target_sha256:target.sha256,plan_sha256:'c'.repeat(64),plan:p};assert.equal(hasUpgradePlan(job),true);assert.equal(hasUpgradePlan({...job,plan:null}),false);assert.equal(hasUpgradePlan({...job,target_sha256:null}),false);
});
test('empty BYO assessment makes zero network calls and creates no phantom job or request UUID',async()=>{
 const id='99500000-0000-4000-8000-000000000002',state={authenticated:true,page:'client-detail',authorityGeneration:1,currentUser:{auth_user_id:id,session_id:id,role:'master_admin'},selectedClient:client,clientSelectionGeneration:1,backendInventory:{catalog},backendUpgrade:{clientId:1,statusLoaded:true,draft:{'upgrade-source':{value:source.sha256},'upgrade-assessment':{value:''}}}};
 let calls=0,message;const ctx={pState:state,upgradeActionAllowed,hasUpgradePlan,validateAssessment,document:{querySelectorAll:()=>[]},pb:{rpc:async()=>{calls++;},functions:{invoke:async()=>{calls++;}}},notify:{error:m=>message=m}};vm.createContext(ctx);
 const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');vm.runInContext(strip(read('src/async-context.js')),ctx);vm.runInContext(strip(read('src/backend-upgrade.js')),ctx);
 await ctx.handleUpgrade('upgrade-review',()=>{});assert.equal(calls,0);assert.match(message,/empty/);assert.equal(state.backendUpgrade.job,undefined);assert.equal(state.backendUpgrade.requestId,undefined);
});
