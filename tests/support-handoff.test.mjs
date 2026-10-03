import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const actor='99000000-0000-4000-8000-000000000001',source='99000000-0000-4000-8000-000000000003',token='a'.repeat(64),secret='test-source-credential-'.repeat(3);
function fixture({role='master_admin',identityId=actor,denied=false}={}){
 let handler;const calls=[],logs=[];
 const admin={rpc:async(name,args)=>{calls.push({name,args});return denied?{error:{message:'private database detail'}}:{data:name==='platform_support_issue'?{shop_url:'https://shop.example.test',expires_at:'2026-10-04T00:01:30Z'}:{ok:true,contract:'orbito-support-handoff-v1',platform_user_id:actor,platform_email:'master@example.test',client_id:42,project_ref:'dexzxxqkbwnpetbsuxxv',client_binding:'client-42',source_id:source,private_extra:'privileged-test-secret'}};}};
 const caller={auth:{getUser:async()=>({data:{user:{id:actor}}})},rpc:async name=>{assert.equal(name,'platform_operator_identity');return {data:{role,auth_user_id:identityId,email:'master@example.test'}};}};
 const env={SUPABASE_URL:'https://ukbhyerxshteyetwomqy.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test',SUPABASE_ANON_KEY:'sb_publishable_test'};
 const ctx=vm.createContext({Request,Response,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},console:{log:(...a)=>logs.push(a),error:(...a)=>logs.push(a)},createClient:(_url,key)=>key==='service-test'?admin:caller});
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/platform-support/index.ts').replace(/^import .*$/gm,'')),ctx);
 return {calls,logs,send:async body=>{const r=await handler(new Request('https://platform.test',{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:JSON.stringify(body)}));return {status:r.status,headers:r.headers,body:await r.json()};}};
}
test('authenticated canonical master issues a 256-bit opaque grant; server RPC receives only SHA256',async()=>{
 const f=fixture(),r=await f.send({action:'issue',client_id:42});assert.equal(r.status,200);assert.match(r.body.token,/^[a-f0-9]{64}$/);
 assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.calls[0].args.p_client,42);assert.equal(f.calls[0].args.p_token_hash,sha(r.body.token));
 assert.doesNotMatch(JSON.stringify(f.calls),new RegExp(r.body.token));assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(f.logs,[]);
 const second=await f.send({action:'issue',client_id:42});assert.notEqual(second.body.token,r.body.token);
});
test('support button is master-only for Active/Suspended managed pairing and absent for retired or BYO clients',()=>{
 const ctx=vm.createContext({URL,Date,esc:v=>String(v)});vm.runInContext(read('src/client-setup.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 const client={id:42,onboarding_version:2,pairing_mode:'managed',lifecycle_state:'Active',infrastructure_state:'ready',shop_url:'https://shop.example.test',supabase_url:'https://dexzxxqkbwnpetbsuxxv.supabase.co'};
 const detail={provisioning:{connection:{bridge_call_configured:true,health:{}}},operations:{source:{source_id:source}}};
 for(const lifecycle_state of ['Active','Suspended'])assert.match(ctx.renderClientSetup({...client,lifecycle_state},detail,true),/data-p-action="open-shop-support"/);
 for(const override of [{lifecycle_state:'Archived'},{infrastructure_state:'destroyed'},{infrastructure_state:'decommissioned'},{pairing_mode:'byo'}])assert.doesNotMatch(ctx.renderClientSetup({...client,...override},detail,true),/data-p-action="open-shop-support"/);
 assert.doesNotMatch(ctx.renderClientSetup(client,detail,false),/data-p-action="open-shop-support"/);
});
test('master UUID/role and server target restrictions fail closed, never accepting browser identity or URL',async()=>{
 for(const options of [{role:'portfolio_manager'},{identityId:source}]){const f=fixture(options),r=await f.send({action:'issue',client_id:42});assert.equal(r.status,403);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.send({action:'issue',client_id:42,shop_url:'https://attacker.test'})).status,400);assert.equal(f.calls.length,0);
 assert.equal((await fixture({denied:true}).send({action:'issue',client_id:42})).status,409);
});
test('server exchange hashes source credential and grant, returns only verified assertion and redacts failures',async()=>{
 const body={action:'exchange',token,client_id:42,project_ref:'dexzxxqkbwnpetbsuxxv',client_binding:'client-42',source_id:source};
 const f=fixture(),r=await f.send(body);assert.equal(r.status,200);assert.equal(f.calls[0].args.p_token_hash,sha(token));assert.equal(f.calls[0].args.p_source_hash,sha(secret));
 assert.doesNotMatch(JSON.stringify([r.body,f.calls,f.logs]),/privileged-test-secret|test-source-credential|service-test|sb_publishable_test/);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(token));
 const denied=await fixture({denied:true}).send(body);assert.equal(denied.status,401);assert.doesNotMatch(JSON.stringify(denied.body),/private database detail/);
 for(const invalid of [{token:'bad'},{source_id:'bad'},{project_ref:'wrong'},{client_id:0},{platform_email:'attacker@example.test'}])assert.equal((await f.send({...body,...invalid})).status,400);
});
test('Platform opens registered Shop with fragment only and closes tab if issuance fails',async()=>{
 let url,closed=0,invoked=0;const tab={opener:{},location:{replace:v=>url=v},close:()=>closed++};
 const ctx=vm.createContext({URL,window:{open:()=>tab},pb:{functions:{invoke:async(name,{body})=>{invoked++;assert.equal(name,'platform-support');assert.equal(body.client_id,42);assert.equal(tab.opener,null);return {data:{token,shop_url:'https://shop.example.test'}};}}}});
 vm.runInContext(read('src/support-handoff.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);await ctx.openShopSupport({id:42});
 assert.equal(url,'https://shop.example.test/#support='+token);assert.equal(new URL(url).search,'');assert.equal(invoked,1);
 ctx.pb.functions.invoke=async()=>({error:{}});await assert.rejects(()=>ctx.openShopSupport({id:42}));assert.equal(closed,1);
 assert.doesNotMatch(read('src/support-handoff.js'),/localStorage|sessionStorage|console\./);
});
