import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const validation=await import('data:text/javascript;base64,'+Buffer.from(read('src/onboarding.js')).toString('base64'));
const callSecret='fixture-call-secret-0000000000000000000000000000',sourceSecret='fixture-source-secret-00000000000000000000000000';
const payload={request_id:'10000000-0000-4000-8000-000000000001',platform_client_id:50,client_binding:'orbito-client-50',business_name:'Test Shop',owner_name:'Test Owner',owner_email:'owner@example.test',billing_currency:'PKR',shop_url:'https://shop.example.test',modules:{repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:false,live_tracking_enabled:false,ems_enabled:false,ems_track_breaks:false},paper_resupply_enabled:false,onboarding_version:2};
function fixture({mode='managed',token='test-management',http=200,network=false,projection=true,malformed=false,invitation=null}={}) {
 const calls=[],requests=[];const target={project_ref:'abcdefghijklmnopqrst',pairing_mode:mode,payload,call_secret:callSecret,source_secret:sourceSecret};
 const ctx={Response,URL,AbortSignal,Deno:{env:{get:()=>token}},
  pollShopBridge:async()=>({ok:projection}),
  fetch:async(url,init)=>{requests.push({url,init});if(network)throw Error('private-network-credential');return new Response(malformed?'invalid-json':JSON.stringify({contract:'orbito-onboarding-runtime-v1',checks:Object.fromEntries(['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'].map(k=>[k,true])),owner_account:'missing',invitation,infrastructure:'ready',owner_setup:'owner_setup_pending',owner_invite:'owner_invite_not_started',onboarding:'onboarding_pending',source_id:'50000000-0000-4000-8000-000000000001',client_binding:'orbito-client-50',config:{}}),{status:http});},
 };
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/onboarding.ts').replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_step==='prepare'?target:{}};}};
 return {calls,requests,run:action=>ctx.runOnboarding(admin,{request_id:payload.request_id,client_id:50,action},'https://platform.supabase.co')};
}
test('owner validation rejects malformed/empty values and normalizes valid identity',()=>{
 assert.deepEqual(validation.validateOwner(' Owner ','OWNER@EXAMPLE.TEST'),{owner_name:'Owner',owner_email:'owner@example.test'});
 for(const [name,email] of [['','a@b.test'],['Owner','bad'],['Owner','a b@c.test'],['x'.repeat(161),'a@b.test']])assert.throws(()=>validation.validateOwner(name,email));
});
test('managed pairing installs three distinct bridge settings without Shop privileged keys',async()=>{
 const f=fixture();assert.equal((await f.run('pair-shop')).state,'paired');assert.equal(f.requests.length,1);
 const secrets=JSON.parse(f.requests[0].init.body);assert.deepEqual(secrets.map(s=>s.name),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
 assert.equal(secrets[0].value,callSecret);assert.equal(secrets[1].value,sourceSecret);assert.notEqual(secrets[0].value,secrets[1].value);
 assert.equal(f.requests[0].init.redirect,'error');assert.doesNotMatch(f.requests[0].init.body,/SERVICE_ROLE|password|SCHEDULER|PAT/);
});
test('BYO pairing never calls Management API and returns only explicit setup download',async()=>{
 const f=fixture({mode:'byo',token:undefined});const result=await f.run('pair-shop');
 assert.equal(result.state,'manual_pairing_required');assert.equal(f.requests.length,0);assert.match(result.setup_file,/PLATFORM_BRIDGE_CALL_SECRET=/);
 assert.doesNotMatch(JSON.stringify(f.calls),new RegExp(callSecret+'|'+sourceSecret));
});
test('managed authorization failure has actionable diagnostics and retains prepared identity',async()=>{
 const f=fixture({http:403});await assert.rejects(f.run('pair-shop'),/project access.*BYO/);
 assert.deepEqual(f.calls.map(c=>c.args.p_step),['prepare']);
});
test('immediate bootstrap sends safe snapshot using call credential and registers source/projection',async()=>{
 const f=fixture();const result=await f.run('bootstrap-shop');assert.equal(result.state,'complete');
 assert.deepEqual(JSON.parse(f.requests[0].init.body),{operation:'bootstrap',payload});
 assert.equal(f.requests[0].init.headers.Authorization,`Bearer ${callSecret}`);
 assert.doesNotMatch(f.requests[0].init.body,/password|secret|SERVICE_ROLE/);
 assert.deepEqual(f.calls.map(c=>c.args.p_step),['prepare','registered','health']);
});
test('retry reuses identical reserved payload; no caller password or secret is projected',async()=>{
 const f=fixture();await f.run('bootstrap-shop');await f.run('bootstrap-shop');assert.equal(f.requests[0].init.body,f.requests[2].init.body);
});
test('failed initial projection remains retryable without recreating the owner',async()=>{
 const f=fixture({projection:false});await assert.rejects(f.run('bootstrap-shop'),/projection is pending/);
 assert.deepEqual(f.calls.map(c=>c.args.p_step),['prepare','registered']);
});
test('unpaired Shop returns safe diagnostics without exposing remote bodies',async()=>{
 const f=fixture({http:401});await assert.rejects(f.run('bootstrap-shop'),/Shop not paired/);assert.equal(f.requests.length,1);
});
test('status uses authenticated bridge only, independent of Management account ownership',async()=>{
 const f=fixture({mode:'byo'});await f.run('onboarding-status');assert.deepEqual(JSON.parse(f.requests[0].init.body),{operation:'status'});
 assert.ok(!f.requests.some(r=>r.url.includes('api.supabase.com')));
});
test('legacy privileged credential input is rejected and bridge config has no key fallback',()=>{
 assert.match(read('supabase/functions/platform-provision/index.ts'),/body\.credential !== undefined/);
 assert.doesNotMatch(read('supabase/functions/platform-config/index.ts'),/service_role_key|shopCredential/);
 assert.doesNotMatch(read('supabase/functions/_shared/shop-credentials.ts'),/PLATFORM_SHOP_CREDENTIALS|service_role_key/);
});

test('optional invitation timeout and rejection preserve provisioning and do not register or project twice',async()=>{
 for(const options of [{network:true},{http:422}]){const f=fixture(options),r=await f.run('invite-owner');assert.equal(r.state,'complete');assert.ok(['pending','failed'].includes(r.invitation));assert.ok(!f.calls.some(c=>c.args.p_step==='registered'));assert.match(r.message,/Manual|manual/);}
});
test('only explicit invitation action sends the optional bridge operation',async()=>{
 const f=fixture();await f.run('invite-owner');assert.equal(JSON.parse(f.requests[0].init.body).operation,'invite-owner');assert.deepEqual(f.calls.map(c=>c.args.p_step),['prepare','health']);
 const code=read('supabase/functions/_shared/onboarding.ts');assert.doesNotMatch(code,/platform_shop_credential|shopCredential|service_role_key|PLATFORM_SHOP_CREDENTIALS/);
});
test('manual-first UI collects no password or privileged Shop credential',()=>{
 for(const p of ['src/provisioning.js','src/client-setup.js','src/modals/client.js']){const code=read(p);if(p!=='src/provisioning.js')assert.match(code,/Manual|manual/);assert.doesNotMatch(code,/<input[^>]+(?:name|type)="(?:password|service_role_key|secret_key|PAT)"/i);}
 assert.match(read('src/client-setup.js'),/Check Owner Account/);assert.doesNotMatch(read('src/provisioning.js'),/Production requires custom SMTP/);
});

test('optional invitation sanitizes unexpected remote state and tolerates an unreadable response',async()=>{
 const bad=fixture({invitation:'private-remote-value'}),r=await bad.run('invite-owner');assert.doesNotMatch(JSON.stringify(r),/private-remote-value/);assert.equal(r.invitation,'already_provisioned');
 const unreadable=fixture({malformed:true}),pending=await unreadable.run('invite-owner');assert.equal(pending.state,'complete');assert.equal(pending.invitation,'pending');assert.deepEqual(unreadable.calls.map(c=>c.args.p_step),['prepare']);
});
