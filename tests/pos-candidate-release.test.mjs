import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeUpgradePlan} from '../supabase/functions/_shared/upgrade-contract.js';
import {installationPlan} from '../../Orbitoshopv2-v1/scripts/backend-plan.mjs';
import {customerReleasePreflight} from '../../Orbitoshopv2-v1/scripts/release-preflight.mjs';
import {assessBackend} from '../supabase/functions/_shared/backend-inventory.ts';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=json('supabase/releases/approved-shop-releases.json'),old=json('supabase/releases/shop-release-support-v7.json'),candidate=json('supabase/releases/shop-release-support-v8.json');
const policy=r=>catalog.find(c=>c.sha256===r.sha256),identity={client_id:42,project_ref:'abcdefghijklmnopqrst',source_id:'90000000-0000-4000-8000-000000000042',client_binding:'synthetic-local'};
const observation=r=>({shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:r.migrations.map(({version,name,sha256})=>({version,name,sha256})),functions:r.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,present:true,source_sha256:sha256})),database_source_match:true,origin:'synthetic-local',capabilities:Object.fromEntries(r.requirements.requirements.filter(q=>q.id!=='core-runtime').map(q=>[q.id,true])),runtime:{database_reachable:true,edge_functions:true,authentication:true}});


const v9=json('supabase/releases/shop-release-support-v9.json'),current=json('supabase/releases/shop-release-support-v10.json');
test('approved v10 completes both fresh plans and preserves immutable v9 with only verify-pin changed',()=>{
 assert.equal(json('supabase/releases/active-shop-release.json').sha256,current.sha256);assert.equal(catalog.filter(c=>c.approved_for_new).length,1);assert.equal(policy(current).review_status,'approved-shared');assert.equal(policy(v9).supported,true);assert.equal(policy(v9).successor,'support-v10');
 for(const mode of ['managed','byo']){const p=installationPlan(current,mode);assert.equal(p.migrations.length,42);assert.equal(p.migrations.at(-1).version,'20261031003158');assert.equal(p.coreFunctions.length+p.deferredFunctions.length,7);assert.ok(current.requirements.installers[mode].requirements.includes('inventory-retirement'));}
 assert.deepEqual(current.migrations.slice(0,41),v9.migrations);assert.deepEqual(current.functions.filter(f=>f.sha256!==v9.functions.find(o=>o.name===f.name).sha256).map(f=>f.name),['verify-pin']);
});
test('existing v9/v8 plans contain only exact missing SQL and one verify-pin package; customer preflight stays fail closed',()=>{
 for(const [source,versions] of [[v9,['20261031003158']],[candidate,['20261030233527','20261031003158']]]){const p=makeUpgradePlan(source,current,policy(source),policy(current),observation(source),identity);assert.deepEqual(p.steps.filter(s=>s.type==='migration').map(s=>s.name),versions.map(v=>'migration:'+v));assert.deepEqual(p.steps.filter(s=>s.type==='function').map(s=>s.name),['function:verify-pin']);assert.equal(p.maintenance_required,false);assert.throws(()=>makeUpgradePlan(source,current,policy(source),{...policy(current),approved_for_new:false},observation(source),identity),/approved supported/);}
 assert.equal(customerReleasePreflight(undefined,current.sha256).manifest.release_id,'support-v10');assert.throws(()=>customerReleasePreflight(undefined,v9.sha256),/Preflight blocked/);
 const wrong=observation(v9);wrong.migrations[0].sha256='0'.repeat(64);assert.throws(()=>makeUpgradePlan(v9,current,policy(v9),policy(current),wrong,identity),/provenance/);
});
test('future retirement stays optional for healthy historical releases and is required only by v10',()=>{
 const packages={'support-v8':candidate,'support-v9':v9,'support-v10':current},subset=catalog.filter(c=>packages[c.release_id]);
 for(const source of [candidate,v9]){const o=observation(source);o.capabilities['inventory-retirement']=false;const report=assessBackend(subset,packages,o);assert.equal(report.compliance,'upgrade_available');assert.equal(report.runtime_health,'healthy');assert.equal(report.upgrade.policy,'optional');}
 const o=observation(current);o.capabilities['inventory-retirement']=false;assert.equal(assessBackend(subset,packages,o).compliance,'drift');
});
