import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeUpgradePlan} from '../supabase/functions/_shared/upgrade-contract.js';
import {installationPlan} from '../../Orbitoshopv2-v1/scripts/backend-plan.mjs';
import {upgradeBackend} from '../../Orbitoshopv2-v1/scripts/upgrade-backend.mjs';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=json('supabase/releases/approved-shop-releases.json'),old=json('supabase/releases/shop-release-support-v7.json'),candidate=json('supabase/releases/shop-release-support-v8.json');
const policy=r=>catalog.find(c=>c.sha256===r.sha256),identity={client_id:42,project_ref:'abcdefghijklmnopqrst',source_id:'90000000-0000-4000-8000-000000000042',client_binding:'synthetic-local'};
const observation=r=>({shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:r.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:r.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,present:true,source_sha256:sha256})),database_source_match:true,origin:'synthetic-local',capabilities:Object.fromEntries(r.requirements.requirements.filter(q=>q.id!=='core-runtime').map(q=>[q.id,true])),runtime:{database_reachable:true,edge_functions:true,authentication:true}});
test('candidate remains unpromoted and both installer plans contain the complete catalog requirement',()=>{
 assert.equal(json('supabase/releases/active-shop-release.json').sha256,old.sha256);
 assert.equal(policy(candidate).approved_for_new,false);assert.equal(policy(candidate).supported,false);assert.equal(policy(candidate).review_status,'candidate-local');
 assert.equal(catalog.filter(c=>c.approved_for_new).length,1);
 for(const mode of ['managed','byo']){
  const plan=installationPlan(candidate,mode);assert.equal(plan.migrations.length,40);assert.equal(plan.migrations.at(-1).version,'20261029173151');assert.equal(plan.coreFunctions.length+plan.deferredFunctions.length,7);
  assert.ok(candidate.requirements.installers[mode].requirements.includes('catalog-icons-and-brands'));
 }
 assert.throws(()=>makeUpgradePlan(old,candidate,policy(old),policy(candidate),observation(old),identity),/approved supported/);
});
test('post-approval plan rehearsal is additive one-migration/zero-function; actual candidate CLI stops before provider access',async()=>{
 // Test-only policy projection: never persisted, selected by an installer, or an approval.
 const projected={...policy(candidate),approved_for_new:true,supported:true};
 const plan=makeUpgradePlan(old,candidate,policy(old),projected,observation(old),identity);
 assert.deepEqual(plan.steps.map(s=>s.name),['migration:20261029173151']);assert.equal(plan.maintenance_required,false);
 let calls=0;
 await assert.rejects(upgradeBackend(['--mode','byo','--project-ref',identity.project_ref,'--client-id','42','--from-sha',old.sha256,'--journal','C:/Private/synthetic-not-created.json','--review'],{invoke:()=>{calls++;throw Error('Provider must not be called')}}),/Preflight blocked/);
 assert.equal(calls,0);
});
test('missing optional catalog capability does not mark healthy v7 as drift; missing required v8 capability does',()=>{
 const packages={'support-v7':old,'support-v8':candidate},v7=observation(old);v7.capabilities['catalog-icons-and-brands']=false;
 const historical=assessBackend(catalog.filter(c=>packages[c.release_id]),packages,v7);
 assert.equal(historical.compliance,'up_to_date');assert.equal(historical.runtime_health,'healthy');assert.equal(historical.upgrade.available,false);
 const v8=observation(candidate);v8.capabilities['catalog-icons-and-brands']=false;
 assert.equal(assessBackend(catalog.filter(c=>packages[c.release_id]),packages,v8).compliance,'drift');
});
