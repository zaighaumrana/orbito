import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeUpgradePlan} from '../supabase/functions/_shared/upgrade-contract.js';
import {installationPlan} from '../../Orbitoshopv2-v1/scripts/backend-plan.mjs';
import {customerReleasePreflight} from '../../Orbitoshopv2-v1/scripts/release-preflight.mjs';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=json('supabase/releases/approved-shop-releases.json'),old=json('supabase/releases/shop-release-support-v7.json'),candidate=json('supabase/releases/shop-release-support-v8.json');
const policy=r=>catalog.find(c=>c.sha256===r.sha256),identity={client_id:42,project_ref:'abcdefghijklmnopqrst',source_id:'90000000-0000-4000-8000-000000000042',client_binding:'synthetic-local'};
const observation=r=>({shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:r.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:r.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,present:true,source_sha256:sha256})),database_source_match:true,origin:'synthetic-local',capabilities:Object.fromEntries(r.requirements.requirements.filter(q=>q.id!=='core-runtime').map(q=>[q.id,true])),runtime:{database_reachable:true,edge_functions:true,authentication:true}});
test('owner-approved v8 becomes active and both installer plans contain the complete catalog requirement',()=>{
 assert.equal(json('supabase/releases/active-shop-release.json').sha256,candidate.sha256);
 assert.equal(policy(candidate).approved_for_new,true);assert.equal(policy(candidate).supported,true);assert.equal(policy(candidate).review_status,'approved-shared');
 assert.equal(catalog.filter(c=>c.approved_for_new).length,1);
 for(const mode of ['managed','byo']){
  const plan=installationPlan(candidate,mode);assert.equal(plan.migrations.length,40);assert.equal(plan.migrations.at(-1).version,'20261029173151');assert.equal(plan.coreFunctions.length+plan.deferredFunctions.length,7);
  assert.ok(candidate.requirements.installers[mode].requirements.includes('catalog-icons-and-brands'));
 }
 assert.throws(()=>makeUpgradePlan(old,candidate,policy(old),{...policy(candidate),approved_for_new:false},observation(old),identity),/approved supported/);
 assert.equal(policy(old).supported,true);assert.equal(policy(old).successor,'support-v8');
});
test('approved plan is additive one-migration/zero-function and customer preflight accepts only the exact target',async()=>{
 const projected=policy(candidate);
 const plan=makeUpgradePlan(old,candidate,policy(old),projected,observation(old),identity);
 assert.deepEqual(plan.steps.map(s=>s.name),['migration:20261029173151']);assert.equal(plan.maintenance_required,false);
 assert.throws(()=>customerReleasePreflight(undefined,candidate.sha256),/Preflight blocked/,'Current v9 candidate source must not masquerade as an approved v8 customer checkout');
 assert.throws(()=>customerReleasePreflight(undefined,'0'.repeat(64)),/Preflight blocked/);
});
test('missing optional catalog capability does not mark healthy v7 as drift; missing required v8 capability does',()=>{
 const packages={'support-v7':old,'support-v8':candidate},v7=observation(old);v7.capabilities['catalog-icons-and-brands']=false;
 const historical=assessBackend(catalog.filter(c=>packages[c.release_id]),packages,v7);
 assert.equal(historical.compliance,'upgrade_available');assert.equal(historical.runtime_health,'healthy');assert.equal(historical.upgrade.available,true);
 const v8=observation(candidate);v8.capabilities['catalog-icons-and-brands']=false;
 assert.equal(assessBackend(catalog.filter(c=>packages[c.release_id]),packages,v8).compliance,'drift');
});


const preferences=json('supabase/releases/shop-release-support-v9.json');
test('icon preferences candidate covers both installers without changing approved v8 selection',()=>{
 assert.equal(policy(preferences).review_status,'candidate-local');assert.equal(policy(preferences).supported,false);assert.equal(policy(preferences).approved_for_new,false);
 assert.equal(json('supabase/releases/active-shop-release.json').release_id,'support-v8');assert.equal(catalog.filter(c=>c.approved_for_new).length,1);
 for(const mode of ['managed','byo']){const plan=installationPlan(preferences,mode);assert.equal(plan.migrations.length,41);assert.equal(plan.migrations.at(-1).version,'20261030233527');assert.ok(preferences.requirements.installers[mode].requirements.includes('icon-label-preferences'));}
 assert.deepEqual(preferences.migrations.slice(0,40),candidate.migrations);assert.deepEqual(preferences.functions,candidate.functions);
 assert.throws(()=>customerReleasePreflight(undefined,preferences.sha256),/Preflight blocked/);
 assert.throws(()=>makeUpgradePlan(candidate,preferences,policy(candidate),policy(preferences),observation(candidate),identity),/approved supported/);
 // In-memory approval simulation only. The actual source catalog stays unapproved.
 const plan=makeUpgradePlan(candidate,preferences,policy(candidate),{...policy(preferences),supported:true,approved_for_new:true},observation(candidate),identity);
 assert.deepEqual(plan.steps.map(step=>step.name),['migration:20261030233527']);assert.equal(plan.maintenance_required,false);
});
test('future preferences remain optional for healthy v8 and required only by exact v9 source',()=>{
 const packages={'support-v8':candidate,'support-v9':preferences},subset=catalog.filter(c=>packages[c.release_id]);
 const v8=observation(candidate);v8.capabilities['icon-label-preferences']=false;
 const healthy=assessBackend(subset,packages,v8);assert.equal(healthy.compliance,'up_to_date');assert.equal(healthy.runtime_health,'healthy');assert.equal(healthy.upgrade.available,false);
 const v9=observation(preferences);v9.capabilities['icon-label-preferences']=false;assert.equal(assessBackend(subset,packages,v9).compliance,'drift');
});
