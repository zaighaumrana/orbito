// Executes the real handler with mocked Supabase boundaries; no hosted calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../supabase/functions/platform-provision/index.ts',import.meta.url),'utf8');
const code = transformSync(source.replace(/^import .*$/gm,''),{loader:'ts',format:'cjs'}).code;
const secret = 'synthetic-test-scheduler-value-not-a-real-secret';
const service = 'synthetic-test-service-key';
function setup(options = {}) {
  const { operator = false, allowed = true, queueError = false, retryQueueError = false,
    retryJobs = [], retryFails = false, completeError = false, failureError = false } = options;
  const configured = Object.hasOwn(options,'configured') ? options.configured : secret;
  let handler; const calls = [];
  const env = { SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:service,PLATFORM_SCHEDULER_SECRET:configured };
  vm.runInNewContext(code,{
    Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},crypto:webcrypto,TextEncoder,TextDecoder,Response,AbortSignal,URL,atob,
    console:{log:()=>assert.fail('Unexpected logging'),error:()=>assert.fail('Unexpected logging')},
    fetch:()=>assert.fail('Unexpected network call'),shopCredential:()=>assert.fail('Unexpected credential resolution'),
    runOnboarding:async(_admin,job)=>{calls.push(['runOnboarding',job]);if(retryFails)throw Error('Unknown outcome');},
    createClient:(_url,key,options)=>({
      auth:{getUser:async()=>{calls.push(['getUser',options.global.headers.Authorization]);return {data:{user:operator?{id:'operator'}:null},error:operator?null:{message:'invalid'}};}},
      rpc:async(name,args)=>{
        calls.push([name,args,key]);
        if(name==='platform_onboarding_retry_targets') return {data:retryJobs,error:retryQueueError?{}:null};
        if(name==='platform_provision_step') return {data:{},error:(args.p_step==='complete'?completeError:failureError)?{}:null};
        if(name==='platform_provision_poll_targets') return {data:[],error:queueError?{}:null};
        assert.equal(name,'platform_provision_begin');
        return allowed?{data:{complete:true},error:null}:{data:null,error:{code:'42501',message:'denied'}};
      },
    }),
  });
  return {calls,async send(token,body={action:'dispatch'},raw=false){
    const response = await handler(new Request('https://example.invalid/functions/v1/platform-provision',{
      method:'POST',headers:token===null?{}:{Authorization:token},body:raw?body:JSON.stringify(body),
    }));
    const text = await response.text();
    for(const value of [secret,service,'wrong-secret']) assert.equal(text.includes(value),false,'Response must not disclose credentials');
    return {status:response.status,body:JSON.parse(text)};
  }};
}
test('correct dedicated secret dispatches without user authentication',async()=>{
  const h=setup(); const result=await h.send(`Bearer ${secret}`);
  assert.equal(result.status,200); assert.deepEqual(result.body,{outcomes:[]});
  assert.deepEqual(h.calls.map(x=>x[0]),['platform_onboarding_retry_targets','platform_provision_poll_targets']);
});
for(const [name,token,configured] of [
  ['wrong secret','Bearer wrong-secret',secret],['missing bearer',null,secret],
  ['missing Edge secret',`Bearer ${secret}`,undefined],['empty Edge secret','Bearer ', ''],
  ['legacy service key is not a scheduler fallback',`Bearer ${service}`,secret],
  ['bare secret is not Bearer authentication',secret,secret],
]) test(name,async()=>{
  const h=setup({configured}); const result=await h.send(token);
  assert.equal(result.status,401); assert.deepEqual(h.calls.map(x=>x[0]),['getUser']);
});
for(const action of ['provision','verify','activate','rotate','replace','provision-call','rotate-call']) test(`scheduler cannot ${action}`,async()=>{
  const h=setup(); assert.equal((await h.send(`Bearer ${secret}`,{action})).status,400); assert.equal(h.calls.length,0);
});
for(const body of [null,[],{action:'dispatch',client_id:1},{}]) test(`reject non-exact dispatch body ${JSON.stringify(body)}`,async()=>{
  const h=setup(); assert.equal((await h.send(`Bearer ${secret}`,body)).status,400); assert.equal(h.calls.length,0);
});
test('malformed scheduler JSON is rejected without disclosures',async()=>{
  const h=setup(); assert.equal((await h.send(`Bearer ${secret}`,'{',true)).status,400); assert.equal(h.calls.length,0);
});
for(const allowed of [true,false]) test(`operator still requires getUser and master RPC: ${allowed}`,async()=>{
  const h=setup({operator:true,allowed});
  const result=await h.send('Bearer operator-jwt',{client_id:1,request_id:'00000000-0000-4000-8000-000000000001',action:'verify',params:{}});
  assert.equal(result.status,allowed?200:409);
  assert.deepEqual(h.calls.map(x=>x[0]),['getUser','platform_provision_begin']);
  assert.equal(h.calls[0][1],'Bearer operator-jwt');
});
test('authenticated operators cannot dispatch using their user JWT',async()=>{
  const h=setup({operator:true}); assert.equal((await h.send('Bearer operator-jwt')).status,400);
  assert.deepEqual(h.calls.map(x=>x[0]),['getUser']);
});
test('dispatcher error response contains no credentials',async()=>{
  const h=setup({queueError:true}); assert.equal((await h.send(`Bearer ${secret}`)).status,503);
});
test('only provisioning gateway is changed and installer uses dedicated Vault value',()=>{
  const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
  assert.match(config,/\[functions.platform-provision\][^[]*verify_jwt = false/);
  assert.match(config,/\[functions.platform-config\][^[]*verify_jwt = true/);
  const sql=readFileSync(new URL('../supabase/maintenance/install_platform_bridge_schedule.sql',import.meta.url),'utf8');
  assert.match(sql,/orbito_platform_scheduler_secret/); assert.doesNotMatch(sql,/orbito_platform_service_role/);
  assert.match(sql,/'\* \* \* \* \*'/); assert.match(sql,/timeout_milliseconds := 90000/);
});


test('scheduler records bootstrap completion before returning to ordinary polling',async()=>{
 const job={request_id:'00000000-0000-4000-8000-000000000001',client_id:1,action:'bootstrap-shop',params:{}};
 const h=setup({retryJobs:[job]});assert.equal((await h.send('Bearer '+secret)).status,200);
 assert.deepEqual(h.calls.map(c=>c[0]),['platform_onboarding_retry_targets','runOnboarding','platform_provision_step','platform_provision_poll_targets']);
 assert.equal(h.calls[2][1].p_step,'complete');assert.equal(h.calls[2][1].p_request,job.request_id);
});
test('unknown bootstrap and completion-write failures remain retryable through the same job',async()=>{
 const job={request_id:'00000000-0000-4000-8000-000000000001',client_id:1,action:'bootstrap-shop',params:{}};
 for(const options of [{retryFails:true},{completeError:true}]) {
  const h=setup({...options,retryJobs:[job]});assert.equal((await h.send('Bearer '+secret)).status,200);
  const failure=h.calls.find(c=>c[0]==='platform_provision_step'&&c[1].p_step==='failure');assert.equal(failure[1].p_request,job.request_id);
  assert.equal(h.calls.filter(c=>c[0]==='runOnboarding').length,1);
 }
});
test('retry-queue and outcome persistence errors surface a safe failure for lease recovery',async()=>{
 const queue=setup({retryQueueError:true});assert.equal((await queue.send('Bearer '+secret)).status,503);assert.equal(queue.calls.length,1);
 const outcome=setup({retryJobs:[{request_id:'request',client_id:1,action:'bootstrap-shop'}],retryFails:true,failureError:true});
 assert.equal((await outcome.send('Bearer '+secret)).status,503);assert.ok(!outcome.calls.some(c=>c[0]==='platform_provision_poll_targets'));
});

test('V2 rejects password and historical customer credential inputs before any reservation',async()=>{
 for(const key of ['password','service_role_key','secret_api_key','database_password','customer_pat','supabase_password','credential']){
 const h=setup({operator:true});const r=await h.send('Bearer operator-jwt',{client_id:1,request_id:'00000000-0000-4000-8000-000000000001',action:'bootstrap-shop',params:{},[key]:'synthetic-forbidden-value'});assert.equal(r.status,400);assert.deepEqual(h.calls.map(c=>c[0]),['getUser']);assert.doesNotMatch(JSON.stringify(r.body),/synthetic-forbidden-value/);
 }
});
