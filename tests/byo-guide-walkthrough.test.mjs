import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setupByo} from '../../Orbitoshopv2-v1/scripts/setup-byo.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const decode=v=>v.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&amp;','&');
test('first-time walkthrough uses the actual on-screen commands and public template through local install/resume/enroll/acceptance states',async()=>{
 const ui={URL,esc:escape};vm.createContext(ui);
 for(const p of ['src/support-setup.js','src/client-setup.js'])vm.runInContext(read(p).replace(/^import .*$/gm,'').replace(/^export /gm,''),ui);
 const ref='abcdefghijklmnopqrst',html=ui.byoSetupModal({id:50,pairing_mode:'byo',onboarding_version:2,supabase_url:`https://${ref}.supabase.co`,shop_url:'https://fresh.example.test',owner_email:'owner@example.test'},{});
 const commands=[...html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m=>decode(m[1]));
 const dir=mkdtempSync(join(tmpdir(),'retrasell-screen-walkthrough-')),reports=[],calls=[];
 const argv=command=>[...command.matchAll(/"([^"]*)"|(\S+)/g)].map(m=>(m[1]??m[2]).replaceAll('$setupRoot',dir)).slice(2);
 const cli=join(dir,'supabase.exe');let owner='missing',onboarded=false;
 const deps={report:s=>reports.push(s),invoke:(_exe,a)=>{calls.push(a);return a[0]==='--version'?'2.120.0':a.includes('--help')?'--linked --project-ref --file --output-format --use-api --env-file':''},ask:async q=>q.startsWith('To authorize')?`INSTALL ${ref}`:q.startsWith('After Platform')?'99000000-0000-4000-8000-000000000099':q.startsWith('Type ACCEPT')?`ACCEPT ${ref}`:'',run:async a=>{calls.push(a);return a[a.indexOf('--phase')+1]==='status'?{owner_account:owner,onboarded,platform_client_id:50,client_binding:'orbito-client-50',source_id:'98000000-0000-4000-8000-000000000050'}:undefined}};
 try{
  const publicConfig=JSON.parse(decode(/<pre>([\s\S]*?)<\/pre>/.exec(html)[1]));
  publicConfig.VITE_SUPABASE_ANON='x.'+Buffer.from(JSON.stringify({role:'anon',ref,exp:Date.now()/1000+3600})).toString('base64url')+'.x';publicConfig.VITE_TURNSTILE_SITE_KEY='synthetic-site';
  writeFileSync(join(dir,'public-shop.json'),JSON.stringify(publicConfig));writeFileSync(join(dir,'runtime.env'),'TURNSTILE_SECRET=synthetic-private\n');
  writeFileSync(join(dir,'orbito-shop-pairing.env'),`# orbito-project-ref: ${ref}\n# orbito-client-id: 50\nPLATFORM_BRIDGE_ENDPOINT=https://qrstabcdefghijklmnop.supabase.co/functions/v1/platform-bridge\nPLATFORM_BRIDGE_CALL_SECRET=${'a'.repeat(64)}\nPLATFORM_BRIDGE_SOURCE_SECRET=${'b'.repeat(64)}\n`);
  await setupByo([...argv(commands.find(c=>c.endsWith('--login'))),'--cli',cli],deps);assert.ok(calls.some(a=>a[0]==='login'));
  const install=[...argv(commands.find(c=>c.includes('--mode fresh'))),'--cli',cli];
  assert.equal((await setupByo(install,deps)).state,'Runtime verified');
  assert.equal((await setupByo([...argv(commands.find(c=>c.endsWith('--status')))],{report:()=>{},invoke:()=>{throw Error('local status must not call provider')}})).state,'Runtime verified');
  const resume=[...argv(commands.find(c=>c.includes('--journal')&&!c.includes('--mode')&&!c.includes('--status')&&!c.includes('--enroll')&&!c.includes('--record'))),'--cli',cli];
  assert.equal((await setupByo(resume,deps)).state,'Waiting for owner');owner='active';assert.equal((await setupByo(resume,deps)).state,'Waiting for onboarding');onboarded=true;
  assert.equal((await setupByo([...argv(commands.find(c=>c.endsWith('--enroll'))),'--cli',cli],deps)).state,'Support enrollment pending');
  assert.equal((await setupByo([...argv(commands.find(c=>c.endsWith('--record-acceptance'))),'--cli',cli],deps)).acceptance.kind,'owner-reported');
  assert.match(reports.join('\n'),/CAPTCHA is NOT browser verified/);assert.doesNotMatch(reports.join('\n'),/synthetic-private|a{64}|b{64}/);
  assert.doesNotMatch(readFileSync(join(dir,'journal.json'),'utf8'),/synthetic-private|a{64}|b{64}/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
