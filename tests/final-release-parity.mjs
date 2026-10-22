// Verify the package against Git's committed backend, not an intermediate tree.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildRelease} from '../../Orbitoshopv2-v1/scripts/build-platform-release.mjs';
const root=new URL('../',import.meta.url),shop=new URL('../../Orbitoshopv2-v1/',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8'),json=p=>JSON.parse(read(p));
const sha=v=>createHash('sha256').update(v).digest('hex');
const git=(repo,...args)=>execFileSync('git',['-C',repo.pathname.replace(/^\/([A-Z]:)/,'$1'),...args],{encoding:'utf8',maxBuffer:40e6});
const active=json('supabase/releases/active-shop-release.json'),r=json('supabase/releases/shop-release-'+active.release_id+'.json');
const manifest=JSON.parse(readFileSync(new URL('scripts/byo-release-manifest.json',shop),'utf8'));
assert.equal(active.release_id,'support-v4');assert.equal(manifest.release_id,active.release_id);assert.equal(manifest.sha256,active.sha256);assert.equal(r.sha256,active.sha256);
const {sha256,...body}=r;assert.equal(sha(JSON.stringify(body)),sha256);
assert.equal(buildRelease(decodeURIComponent(shop.pathname.replace(/^\/([A-Z]:)/,'$1')),{support:true}).sha256,sha256);
for(const m of r.migrations){const p='supabase/migrations/'+m.version+'_'+m.name+'.sql';assert.equal(sha(git(shop,'show','HEAD:'+p).replaceAll('\r\n','\n')),m.sha256,p);assert.equal(sha(m.sql),m.sha256);}
for(const f of r.functions){for(const file of f.files){assert.equal(sha(git(shop,'show','HEAD:supabase/functions/'+file.path).replaceAll('\r\n','\n')),file.sha256,file.path);assert.equal(sha(file.content),file.sha256);}const {sha256:fnSha,stage_sha256,...fn}=f;assert.equal(sha(JSON.stringify(fn)),fnSha);}
const deployed=r.functions.filter(f=>f.name!=='support-tickets').map(f=>f.name).concat('support-tickets').sort();assert.deepEqual(deployed,r.functions.map(f=>f.name).sort());
assert.equal(r.migrations.length,37);assert.equal(r.functions.length,7);assert.deepEqual(r.functions.filter(f=>!f.verify_jwt).map(f=>f.name),['platform-bridge']);
for(const p of ['supabase/functions/_shared/shop-release.json','supabase/releases/shop-release-support-v2.json','supabase/releases/shop-release-support-v3.json'])assert.equal(read(p).replaceAll('\r\n','\n'),git(root,'show','HEAD:'+p).replaceAll('\r\n','\n'),'Old package unchanged: '+p);
const catalog=json('supabase/releases/approved-shop-releases.json');assert.equal(catalog.filter(r=>r.approved_for_new).length,1);assert.ok(catalog.some(a=>a.release_id===active.release_id&&a.sha256===sha256&&a.approved_for_new));
assert.ok(read('supabase/migrations/20261022155957_support_consent_and_release_catalog.sql').includes("('support-v4','"+sha256+"')"));
assert.ok(read('supabase/functions/_shared/shop-release-registry.ts').includes("'support-v4':v4"));
console.log('PASS: exact final committed Shop backend, embedded source/dependencies, migrations, 7 functions/gateways, both selectors, catalog SQL and unchanged legacy artifacts. '+sha256);
