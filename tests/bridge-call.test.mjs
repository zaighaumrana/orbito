import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('supabase/functions/platform-provision/index.ts');
const helpers=['shop-credentials','bridge-call'].map(p=>read(`supabase/functions/_shared/${p}.ts`)).join('\n');
const code=transformSync((helpers+'\n'+main).replace(/^import .*$/gm,'').replace(/^export /gm,''),{loader:'ts',format:'cjs'}).code;
const scheduler='fixture-scheduler-not-real',callSecret='fixture-bridge-call-credential-000000000000',service='fixture-platform-service',shopService='fixture-shop-service';
const ref='kxmovywgshyltwusghhj',sourceId='91fb4957-c2c4-4d6a-8a8a-e4783b302f97';
function fixture({missing=false,lookupError=false,http=200,network=false,response={enabled:true,acknowledged:0},operator=false,allowed=true,action='provision-call',managementFails=false}={}) {
 let handler; const calls=[],requests=[]; let stored=null;
 const context={job:{step:'credential_saved',plan:{}},connection:{project_ref:ref,client_binding:'orbito-client-1'},source:{source_id:sourceId,client_binding:'orbito-client-1',enabled:true,usage_from_sequence:7},currency:'PKR',projection_exists:true,source_credential_exists:true};
 const rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='platform_onboarding_retry_targets') return {data:[]};
        if(name==='platform_provision_poll_targets')return {data:[1]};
  if(name==='platform_bridge_call_credential')return lookupError?{error:{message:callSecret}}:{data:missing?null:{project_ref:ref,bridge_call_secret:callSecret}};
  if(name==='platform_bridge_call_health')return {data:null};
  if(name==='platform_provision_begin')return allowed?{data:{complete:false}}:{error:{code:'42501',message:'denied'}};
  if(name==='platform_provision_step') {
   if(args.p_step==='context')return {data:context};
   return {data:{}};
  }
  if(name==='platform_prepare_bridge_call') {assert.ok(/^[a-f0-9]{64}$/.test(args.p_candidate),'Cryptographic candidate required'); stored ||= args.p_candidate; return {data:{project_ref:ref,bridge_call_secret:stored}};}
  if(name==='platform_commit_bridge_call')return {data:null};
  assert.fail('Unexpected RPC: '+name);
 };
 vm.runInNewContext(code,{
  Deno:{env:{get:key=>({SUPABASE_URL:'https://platform.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:service,PLATFORM_SCHEDULER_SECRET:scheduler,PLATFORM_MANAGEMENT_TOKEN:'fixture-management'})[key]},serve:fn=>{handler=fn;}},
  crypto:webcrypto,TextEncoder,TextDecoder,Response,AbortSignal,URL,atob,
  console:new Proxy({}, {get:()=>()=>assert.fail('Logging is forbidden in credential paths')}),
  createClient:()=>({rpc,auth:{getUser:async()=>{calls.push({name:'getUser'});return {data:{user:operator?{id:'operator'}:null}};}}}),
  fetch:async(url,init)=>{
   requests.push({url,init});
   if(url.startsWith('https://api.supabase.com/')) {
    assert.equal(url,`https://api.supabase.com/v1/projects/${ref}/secrets`);
    const values=JSON.parse(init.body); assert.equal(values.length,1); assert.equal(values[0].name,'PLATFORM_BRIDGE_CALL_SECRET');
    assert.ok(values[0].value===stored,'Management secret must equal prepared Vault value');
    return new Response('{}',{status:managementFails?500:201});
   }
   assert.equal(url,`https://${ref}.supabase.co/functions/v1/platform-bridge`);
   assert.equal(init.method,'POST');assert.equal(init.body,'{}');assert.equal(init.redirect,'error');assert.ok(init.signal);
   assert.ok(init.headers.Authorization.startsWith('Bearer '),'Bearer scheme required');
   assert.ok(init.headers.Authorization===`Bearer ${callSecret}`,'Must send the dedicated call credential');
   assert.ok(init.headers.Authorization!==`Bearer ${shopService}`,'Must not send Shop service role');
   if(network)throw new Error(callSecret);
   return new Response(typeof response==='string'?response:JSON.stringify(response),{status:http});
  },
 });
 return {calls,requests,async run(){
  const body=operator?{client_id:1,request_id:'00000000-0000-4000-8000-000000000001',action,params:{}}:{action:'dispatch'};
  const res=await handler(new Request('https://platform.invalid',{method:'POST',headers:{Authorization:`Bearer ${operator?'operator-jwt':scheduler}`},body:JSON.stringify(body)}));
  const text=await res.text();
  for(const value of [callSecret,service,shopService,scheduler,stored].filter(Boolean))assert.ok(!text.includes(value),'Response must contain no credential values');
  for(const item of calls.filter(c=>c.name==='platform_bridge_call_health'))assert.ok(!JSON.stringify(item).includes(callSecret),'Diagnostic must be secret-free');
  return {status:res.status,body:JSON.parse(text)};
 }};
}
test('full scheduler handler selects existing client and dispatches dedicated credential',async()=>{
 const h=fixture(); const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.outcomes[0].ok,true);
 assert.deepEqual(h.calls.map(c=>c.name),['platform_onboarding_retry_targets','platform_provision_poll_targets','platform_bridge_call_credential','platform_bridge_call_health']);
 assert.equal(h.calls.find(c=>c.name==='platform_bridge_call_credential').args.p_client,1);
});
for(const [name,options,code] of [
 ['missing',{missing:true},'missing_bridge_call_credential'],['lookup failure',{lookupError:true},'credential_lookup_failed'],
 ['Shop 401',{http:401,response:callSecret},'shop_http_error'],['Shop 403',{http:403},'shop_http_error'],['Shop 500',{http:500},'shop_http_error'],
 ['network timeout',{network:true},'network_or_timeout'],['invalid JSON',{response:callSecret},'invalid_shop_response'],
 ['invalid success',{response:{enabled:true}},'invalid_shop_response'],['disabled',{response:{enabled:false}},'shop_delivery_disabled'],
]) test(name+' is safe and fails closed',async()=>{
 const h=fixture(options);const r=await h.run();const result=r.body.outcomes[0];
 assert.equal(result.ok,false);assert.equal(result.code,code);
 if(options.http)assert.equal(result.http_status,options.http);
 if(options.missing||options.lookupError)assert.equal(h.requests.length,0);
});
for(const action of ['provision-call','rotate-call']) test(action+' uses the existing master-authorized job, Vault preparation and only the call-secret write',async()=>{
 const h=fixture({operator:true,action});const r=await h.run();assert.equal(r.status,200);
 assert.deepEqual(h.calls.map(c=>c.name),['getUser','platform_provision_begin','platform_provision_step','platform_prepare_bridge_call','platform_provision_step','platform_commit_bridge_call','platform_provision_step']);
 assert.equal(h.calls[1].args.p_action,action);assert.equal(h.calls[1].args.p_client,1);
 assert.deepEqual(h.calls.filter(c=>c.name==='platform_provision_step').map(c=>c.args.p_step),['context','checkpoint','complete']);
 assert.equal(h.requests.length,1);
});
test('non-master cannot backfill credentials',async()=>{
 const h=fixture({operator:true,allowed:false});assert.equal((await h.run()).status,409);assert.equal(h.requests.length,0);
 assert.deepEqual(h.calls.map(c=>c.name),['getUser','platform_provision_begin']);
});
test('unknown Management outcome retains job for resume without committing new reference',async()=>{
 const h=fixture({operator:true,managementFails:true});assert.equal((await h.run()).status,503);
 assert.ok(!h.calls.some(c=>c.name==='platform_commit_bridge_call'));
 assert.equal(h.calls.at(-1).args.p_step,'failure');
});
const migration=read('supabase/migrations/20260928062701_platform_bridge_call_secret.sql');
test('additive Vault references and service-only grants; Client 1 needs no recreation or cutover write',()=>{
 assert.match(migration,/shop_credentials add column bridge_call_secret_id uuid references vault.secrets/);
 assert.match(migration,/provision_jobs add column bridge_call_secret_id uuid references vault.secrets/);
 assert.match(migration,/revoke all on function %s from public,anon,authenticated/);
 assert.match(migration,/grant execute on function %s to service_role/);
 assert.match(migration,/require_role\(array\['master_admin'\]\)/);
 assert.match(migration,/v:=j.bridge_call_secret_id/);assert.match(migration,/v:=c.bridge_call_secret_id/);
 assert.match(migration,/vault.create_secret\(p_candidate\)/);
 assert.match(migration,/set bridge_call_secret_id=j.bridge_call_secret_id where client_id=j.client_id/);
 assert.doesNotMatch(migration,/(?:update|insert into|delete from|alter table) public\.(?:clients|bridge_sources|bridge_events|usage_logs|billing_cycles|payments)/i);
 assert.doesNotMatch(migration,/update platform_private.source_credentials/i);
 assert.doesNotMatch(migration,/create or replace function platform_private.provision_poll_targets/);
});
const sha=s=>createHash('sha256').update(s).digest('hex');
const protectedHashes={"activation": "4db45871b39e243cf97455618f80a469d64813b695830ddf6647a57de7e5315f", "sourceRotation": "e61a5daf3824f940f3646d1e122c22ddb2cd9670c396e91651c49f5cab536a06", "supabase/migrations/20260925191052_platform_control_plane.sql": "83af3ff6d7d5d4ae7de1415e9f2e40df0da5a12127a94e66880abb0509461406", "supabase/migrations/20260926234425_client_provisioning.sql": "d6208b8cfb81933db9f2222355291445b0e7616ff5a623ffad8a2d443d9741e4"};
test('existing selection, duplicate/sequence ledger invariants and cutover/source-rotation code unchanged',()=>{
 const section=(a,b)=>main.slice(main.indexOf(a),main.indexOf(b,main.indexOf(a))).replace(/\r\n/g,'\n');
 assert.equal(sha(section("    } else if (body.action === 'activate') {","    } else if (body.action === 'rotate') {")),protectedHashes.activation);
 assert.equal(sha(section("    } else if (body.action === 'rotate') {","    } else if (body.action === 'verify') {")),protectedHashes.sourceRotation);
 for(const [path,digest] of Object.entries(protectedHashes).filter(([k])=>k.startsWith('supabase/')))assert.equal(sha(readFileSync(new URL('../'+path,import.meta.url))),digest);
 const sourceWrite="{ name:'PLATFORM_BRIDGE_SOURCE_SECRET',value:secret },";
 assert.equal(main.split(sourceWrite).length-1,2);
 assert.match(main,/await provisionCall\(\)/); // Additional initial credential setup; source code remains separate.
});
