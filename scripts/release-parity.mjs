// Deterministic fail-closed release gate. No provider, secrets or installation writes.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,posix} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b,message)=>assert.deepEqual(a,b,message);
const baseRequired=['core-runtime','usage-outbox','billing-projection','config-journal','support-identity','support-consent','owner-bootstrap','support-durable-submissions'];
export function validateSnapshot({release,source,manifest,active,catalog,shopCatalog,plan,reviewOnly=false}){
 const {sha256,...body}=release;assert.equal(sha(JSON.stringify(body)),sha256,'Invalid release fingerprint');
 assert.equal(source.sha256,sha256,'Committed backend/source differs from packaged release');
 assert.equal(active.sha256,sha256,'Invalid active selector');assert.equal(manifest.sha256,sha256,'Stale BYO manifest');assert.equal(manifest.release_id,active.release_id,'Installer selector divergence');
 if(reviewOnly){
  const candidate=catalog.find(c=>c.release_id===active.release_id);
  assert.equal(manifest.review_status,'candidate-local','Candidate review evidence required');
  assert.ok(candidate&&candidate.sha256===sha256&&candidate.review_status==='candidate-local'&&candidate.approved_for_new===false&&candidate.supported===false,'Review must not promote a candidate');
 }else{
  assert.equal(manifest.review_status,'approved-shared','Missing approved review evidence');
  const approved=catalog.find(c=>c.release_id===active.release_id&&c.approved_for_new);assert.ok(approved&&approved.sha256===sha256,'Unapproved fresh release');
 }
 assert.equal(catalog.filter(c=>c.approved_for_new).length,1,'Ambiguous fresh selector');
 assert.equal(shopCatalog[sha256]?.release_id,active.release_id,'Missing customer catalog');
 const versions=release.migrations.map(m=>m.version);same(versions,[...new Set(versions)].sort(),'Duplicate/out-of-order migrations');
 assert.ok(versions.length>0);for(const m of release.migrations)assert.equal(sha(m.sql),m.sha256,'Migration content drift: '+m.version);
 const required=[...baseRequired,...(versions.includes('20261025233743')?['bounded-operational-reads']:[]),...(versions.includes('20261029173151')?['catalog-icons-and-brands']:[]),...(versions.includes('20261030233527')?['icon-label-preferences']:[]),...(versions.includes('20261031003158')?['inventory-retirement']:[])];
 const r=release.requirements;assert.equal(r?.contract,'retrasell-backend-requirements-v1','Canonical requirements missing');same([...r.requirements.map(x=>x.id)].sort(),[...required].sort(),'Unaccounted backend requirement');
 assert.ok(r.requirements.every(q=>['purpose','managed','byo','verification'].every(k=>typeof q[k]==='string'&&q[k].length>=10)),'Missing requirement traceability');
 same([...new Set(r.requirements.flatMap(x=>x.migrations))].sort(),versions,'Unmapped migration requirement');
 same([...new Set(r.requirements.flatMap(x=>x.functions))].sort(),release.functions.map(f=>f.name).sort(),'Unmapped function requirement');
 assert.ok(r.runtime.database.functions.length&&r.runtime.database.tables.length&&r.runtime.database.triggers.length&&r.runtime.database.security.length,'Missing database/security contract');
 assert.equal(r.compatibility.automatic_upgrade,false,'Detection must not execute upgrades');assert.ok(r.mode_exceptions.every(e=>['platform-invocation-ownership','managed-privileged-support-handoff'].includes(e.id)&&e.mode==='managed'&&e.purpose),'Unreviewed installer exception');
 const dependencies=new Set();
 for(const f of release.functions){
  const {sha256:fnHash,stage_sha256,...fn}=f;assert.equal(sha(JSON.stringify(fn)),fnHash,'Function package drift: '+f.name);assert.equal(f.verify_jwt,f.name!=='platform-bridge','Gateway drift: '+f.name);
  for(const file of f.files){assert.equal(sha(file.content),file.sha256,'Function source drift: '+file.path);for(const m of file.content.matchAll(/(?:from|import)\s*['"](https:\/\/[^'"]+)['"]/g))dependencies.add(m[1]);
   for(const m of file.content.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)){const path=posix.normalize(posix.join(posix.dirname(file.path),m[1]));assert.ok(f.files.some(x=>x.path===path),'Missing local runtime dependency: '+path);}
  }
 }
 same([...dependencies].sort(),[...r.runtime.external_dependencies].sort(),'Unaccounted external runtime dependency');
 for(const mode of ['managed','byo']){const p=plan(release,mode);same(p.migrations.map(m=>m.version),versions,'Installer migration omission: '+mode);same([...p.coreFunctions,...p.deferredFunctions].map(f=>f.name).sort(),release.functions.map(f=>f.name).sort(),'Installer function omission: '+mode);}
 same(manifest.migrations,versions.length,'Stale migration manifest');same(manifest.functions,release.functions.length,'Stale function manifest');
 return {...(reviewOnly?{review_status:'candidate-local-not-promoted'}:{}),release_id:active.release_id,sha256,migrations:versions.length,functions:release.functions.length,requirements:r.requirements.length};
}
export async function validateWorkspace(platformRoot=resolve(import.meta.dirname,'..'),shopRoot=resolve(platformRoot,'../Orbitoshopv2-v1'),candidateId,promotionId){
 const read=(root,p)=>readFileSync(resolve(root,p),'utf8').replaceAll('\r\n','\n'),json=(root,p)=>JSON.parse(read(root,p));
 const installedSelector=json(platformRoot,'supabase/releases/active-shop-release.json');
 const catalog=json(platformRoot,'supabase/releases/approved-shop-releases.json'),shopCatalog=json(shopRoot,'scripts/backend-release-catalog.json');
 const fresh=catalog.find(c=>c.approved_for_new);
 let proposedSelector=installedSelector;
 if(promotionId){
  assert.ok(!candidateId&&fresh?.release_id===promotionId&&fresh.supported===true&&fresh.review_status==='approved-shared','Explicit approved supported promotion target required');
  assert.ok(catalog.some(c=>c.release_id===installedSelector.release_id&&c.sha256===installedSelector.sha256&&c.supported),'Existing active selector must remain a known supported release');
  proposedSelector={release_id:fresh.release_id,sha256:fresh.sha256};
 }
 assert.ok(fresh&&fresh.release_id===proposedSelector.release_id&&fresh.sha256===proposedSelector.sha256,'Active selector differs from approved release');
 if(candidateId)assert.match(candidateId,/^support-v[0-9]+$/,'Explicit candidate ID required');
 const candidate=candidateId&&catalog.find(c=>c.release_id===candidateId);
 if(candidateId)assert.ok(candidate&&candidate.review_status==='candidate-local'&&!candidate.approved_for_new&&!candidate.supported,'Unpromoted registered candidate required');
 const active=candidate?{release_id:candidateId,sha256:candidate.sha256}:proposedSelector;
 const release=json(platformRoot,'supabase/releases/shop-release-'+active.release_id+'.json');
 // Candidate evidence reuses the existing catalog and the same validator. It is
 // not an installer selector, approval, or a second provisioning/version tracker.
 const manifest=candidate?{...candidate}:json(shopRoot,'scripts/byo-release-manifest.json');
 same(readdirSync(resolve(shopRoot,'supabase/migrations')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort(),release.migrations.map(m=>m.version+'_'+m.name+'.sql'),'Migration source omitted from package');
 same(readdirSync(resolve(shopRoot,'supabase/functions'),{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='_shared').map(d=>d.name).sort(),release.functions.map(f=>f.name).sort(),'Function source omitted from package');
 same([...read(shopRoot,'supabase/config.toml').matchAll(/\[functions\.([^\]]+)\]/g)].map(m=>m[1]).sort(),release.functions.map(f=>f.name).sort(),'Unaccounted gateway configuration');
 const git=(...args)=>execFileSync('git',['-C',shopRoot,...args],{encoding:'utf8',maxBuffer:32e6});
 assert.match(manifest.backend_source_commit||'',/^[a-f0-9]{40}$/,'Exact committed backend evidence required');git('merge-base','--is-ancestor',manifest.backend_source_commit,'HEAD');
 const sourcePaths=[...release.migrations.map(m=>'supabase/migrations/'+m.version+'_'+m.name+'.sql'),...new Set(release.functions.flatMap(f=>f.files.map(s=>'supabase/functions/'+s.path))),'supabase/config.toml','scripts/backend-requirements.json'];
 for(const p of sourcePaths){same(read(shopRoot,p),git('show','HEAD:'+p).replaceAll('\r\n','\n'),'Uncommitted backend change: '+p);same(read(shopRoot,p),git('show',manifest.backend_source_commit+':'+p).replaceAll('\r\n','\n'),'Change after backend fingerprint source commit: '+p);}
 const {buildRelease}=await import(pathToFileURL(resolve(shopRoot,'scripts/build-platform-release.mjs')).href),{installationPlan}=await import(pathToFileURL(resolve(shopRoot,'scripts/backend-plan.mjs')).href);
 same(read(shopRoot,'scripts/backend-inventory.ts'),read(platformRoot,'supabase/functions/_shared/backend-inventory.ts'),'Inventory evidence-model divergence');
 same(read(shopRoot,'scripts/backend-plan.mjs'),read(platformRoot,'supabase/functions/_shared/backend-plan.js'),'Installer planner divergence');
 for(const name of ['upgrade-contract','upgrade-engine'])same(read(shopRoot,'scripts/'+name+'.mjs'),read(platformRoot,'supabase/functions/_shared/'+name+'.js'),'Managed/BYO upgrade contract divergence: '+name);
 assert.match(read(shopRoot,'scripts/upgrade-backend.mjs'),/customer-claim/,'BYO execution must claim the same durable Platform pending-operation fence');
 for(const [root,p,pattern]of [[platformRoot,'supabase/functions/_shared/managed-setup.ts',/for\(const migration of plan!\.migrations\)/],[platformRoot,'supabase/functions/_shared/managed-setup.ts',/plan!\.coreFunctions/],[platformRoot,'supabase/functions/_shared/support-automation.ts',/installationPlan\(release,'managed'\)\.deferredFunctions/],[shopRoot,'scripts/byo-setup.mjs',/plan\.coreFunctions/],[shopRoot,'scripts/byo-support-release.mjs',/plan\.deferredFunctions/],[shopRoot,'scripts/byo-support-release.mjs',/migrations:plan\.migrations/]])assert.match(read(root,p),pattern,'Installer is not consuming its approved plan: '+p);
 const result=validateSnapshot({release,source:buildRelease(shopRoot,{support:true}),manifest,active,catalog,shopCatalog,plan:installationPlan,reviewOnly:Boolean(candidateId)});
 for(const c of catalog){
  const p=c.release_id==='accepted-v1'?'supabase/functions/_shared/shop-release.json':'supabase/releases/shop-release-'+c.release_id+'.json',old=json(platformRoot,p);assert.equal(old.sha256,c.sha256,'Catalog fingerprint mismatch: '+c.release_id);
  const {sha256,...body}=old;assert.equal(sha(JSON.stringify(body)),sha256,'Historical immutable fingerprint corrupted');
  // Grandfather the accepted pre-gate baseline; legacy v1 had earlier revisions.
  // New artifacts are locked to their first committed fingerprint thereafter.
  const baseline='c9bb36eb7f1b75b556ac0894f6cd0353cf78f32f';
  execFileSync('git',['-C',platformRoot,'merge-base','--is-ancestor',baseline,'HEAD']);
  let anchor;try{execFileSync('git',['-C',platformRoot,'cat-file','-e',baseline+':'+p],{stdio:'pipe'});anchor=baseline;}catch{anchor=execFileSync('git',['-C',platformRoot,'log','--diff-filter=A','--format=%H','--',p],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean).at(-1);}
  if(anchor){const original=JSON.parse(execFileSync('git',['-C',platformRoot,'show',anchor+':'+p],{encoding:'utf8',maxBuffer:32e6}));assert.equal(sha256,original.sha256,'Previously accepted immutable release was rewritten: '+c.release_id);}
  same(shopCatalog[c.sha256]?.migration_manifest,old.migrations.map(({version,name,sha256})=>({version,name,sha256})),'Customer migration evidence missing: '+c.release_id);
  same(shopCatalog[c.sha256]?.function_manifest,old.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,sha256})),'Customer function evidence missing: '+c.release_id);
 }
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args[0]==='--candidate'){if(args.length!==2)throw Error('Use --candidate RELEASE_ID');console.log('PASS local candidate parity '+JSON.stringify(await validateWorkspace(undefined,undefined,args[1])));}
 else {if(args.length&&!((args.length===2||args.length===4)&&args[0]==='--shop-root'&&(args.length===2||args[2]==='--platform-root')))throw Error('Use --shop-root PATH [--platform-root PATH]');
 console.log('PASS release parity '+JSON.stringify(await validateWorkspace(args[3]?resolve(args[3]):undefined,args[1]?resolve(args[1]):undefined)));}
}
