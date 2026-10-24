// Actual clean Vite builds from synthetic public inputs; no .env inventory.
import {mkdtempSync,writeFileSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const ref='abcdefghijklmnopqrst',dir=mkdtempSync(join(tmpdir(),'retrasell-public-build-'));
const anon='fixture.'+Buffer.from(JSON.stringify({role:'anon',ref,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
try{
 for(const [repo,config] of [['orbito',{VITE_PLATFORM_URL:`https://${ref}.supabase.co`,VITE_PLATFORM_ANON:anon,VITE_TURNSTILE_KEY:'synthetic-site'}],['Orbitoshopv2-v1',{VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON:anon,VITE_TURNSTILE_SITE_KEY:'synthetic-site'}]]){
  const root=resolve(import.meta.dirname,'../../'+repo),file=join(dir,repo+'.json');writeFileSync(file,JSON.stringify(config));
  const run=extra=>spawnSync(process.execPath,['scripts/build-verified.mjs','--config',file,'--project-ref',ref,...extra],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,VITE_SUPABASE_URL:'https://wrong-stale.invalid',VITE_PLATFORM_URL:'https://wrong-stale.invalid'}});
  let result=run([]);assert.equal(result.status,0,result.stderr);console.log(repo+': clean build PASS');
  result=run(['--verify-dist']);assert.equal(result.status,0,result.stderr);
  const manifest=join(root,'dist/retrasell-build.json'),original=readFileSync(manifest,'utf8');
  try{writeFileSync(manifest,original.replace(ref,'bcdefghijklmnopqrstu'));assert.notEqual(run(['--verify-dist']).status,0,'stale target refused');}finally{writeFileSync(manifest,original)}
  assert.equal(run(['--verify-dist']).status,0);console.log(repo+': compiled target/digest verification and stale-target refusal PASS');
  unlinkSync(file);
 }
}finally{for(const repo of ['orbito','Orbitoshopv2-v1'])try{unlinkSync(join(dir,repo+'.json'))}catch{}rmdirSync(dir)}
