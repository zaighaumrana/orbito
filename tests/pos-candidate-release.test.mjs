import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeUpgradePlan} from '../supabase/functions/_shared/upgrade-contract.js';
import {installationPlan} from '../../Orbitoshopv2-v1/scripts/backend-plan.mjs';
import {customerReleasePreflight} from '../../Orbitoshopv2-v1/scripts/release-preflight.mjs';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=json('supabase/releases/approved-shop-releases.json'),old=json('supabase/releases/shop-release-support-v7.json'),candidate=json('supabase/releases/shop-release-support-v8.json');
const policy=r=>catalog.find(c=>c.sha256===r.sha256),identity={client_id:42,project_ref:'abcdefghijklmnopqrst',source_id:'90000000-0000-4000-8000-000000000042',client_binding:'synthetic-local'};
const observation=r=>({shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:r.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:r.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,present:true,source_sha256:sha256})),database_source_match:true,origin:'synthetic-local',capabilities:Object.fromEntries(r.requirements.requirements.filter(q=>q.id!=='core-runtime').map(q=>[q.id,true])),runtime:{database_reachable:true,edge_functions:true,authentication:true}});

const preferences=json('supabase/releases/shop-release-support-v9.json');
test('approved v9 is the sole fresh target and both full installer plans contain icon preferences',()=>{
 assert.equal(json('supabase/releases/active-shop-release.json').sha256,preferences.sha256);
 assert.equal(policy(preferences).approved_for_new,true);assert.equal(policy(preferences).supported,true);assert.equal(policy(preferences).review_status,'approved-shared');
 assert.equal(catalog.filter(c=>c.approved_for_new).length,1);assert.equal(policy(candidate).supported,true);assert.equal(policy(candidate).successor,'support-v9');
 for(const mode of ['managed','byo']){const plan=installationPlan(preferences,mode);assert.equal(plan.migrations.length,41);assert.equal(plan.migrations.at(-1).version,'20261030233527');assert.equal(plan.coreFunctions.length+plan.deferredFunctions.length,7);assert.ok(preferences.requirements.installers[mode].requirements.includes('icon-label-preferences'));}
 assert.deepEqual(preferences.migrations.slice(0,40),candidate.migrations);assert.deepEqual(preferences.functions,candidate.functions);
});
test('verified v8 to v9 uses the existing one-migration/zero-function plan and exact customer preflight',()=>{
 const plan=makeUpgradePlan(candidate,preferences,policy(candidate),policy(preferences),observation(candidate),identity);
 assert.deepEqual(plan.steps.map(s=>s.name),['migration:20261030233527']);assert.equal(plan.maintenance_required,false);
 assert.equal(customerReleasePreflight(undefined,preferences.sha256).manifest.release_id,'support-v9');assert.throws(()=>customerReleasePreflight(undefined,candidate.sha256),/Preflight blocked/);
 assert.throws(()=>makeUpgradePlan(candidate,preferences,policy(candidate),{...policy(preferences),approved_for_new:false},observation(candidate),identity),/approved supported/);
 const wrong=observation(candidate);wrong.migrations[0].sha256='0'.repeat(64);assert.throws(()=>makeUpgradePlan(candidate,preferences,policy(candidate),policy(preferences),wrong,identity),/provenance/);
});
test('missing future icon preferences stays optional for healthy historical sources and required for v9',()=>{
 const packages={'support-v7':old,'support-v8':candidate,'support-v9':preferences},subset=catalog.filter(c=>packages[c.release_id]);
 for(const source of [old,candidate]){const observed=observation(source);observed.capabilities['icon-label-preferences']=false;if(source===old)observed.capabilities['catalog-icons-and-brands']=false;const report=assessBackend(subset,packages,observed);assert.equal(report.compliance,'upgrade_available');assert.equal(report.runtime_health,'healthy');assert.equal(report.upgrade.policy,'optional');}
 const current=observation(preferences);current.capabilities['icon-label-preferences']=false;assert.equal(assessBackend(subset,packages,current).compliance,'drift');
});
