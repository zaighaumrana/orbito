import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const platformRef='ukbhyerxshteyetwomqy',shopRef='dexzxxqkbwnpetbsuxxv';
const platformUrl=`https://${platformRef}.supabase.co`;
const jwt=(role='anon')=>'h.'+Buffer.from(JSON.stringify({role,ref:platformRef})).toString('base64url')+'.s';
const request={client_id:42,request_id:'98000000-0000-4000-8000-000000000001',action:'repair-support-access',params:{}};
function fixture({role='master_admin',identityId='verified-master',targetError=false,ref=shopRef,current={},remoteError=false,anon=jwt(),missingEmail=false,missingRuntime=false,missingVerification=false}={}){
 let handler;const rpc=[],http=[],logs=[],writes=[];
 const env={SUPABASE_URL:platformUrl,SUPABASE_ANON_KEY:missingRuntime?'':anon,SUPABASE_SERVICE_ROLE_KEY:'private-service',PLATFORM_MANAGEMENT_TOKEN:'private-management'};
 const caller={auth:{getUser:async()=>({data:{user:{id:'verified-master'}}})},rpc:async(name,args)=>{
  rpc.push({name,args});
  if(name==='platform_operator_identity')return {data:{auth_user_id:identityId,role,email:missingEmail?'':'  canonical-master@example.test  '}};
  assert.equal(name,'platform_support_access_target');return targetError?{error:{message:'private database details'}}:{data:{project_ref:ref,client_binding:'orbito-client-42',owner_request:'owner-immutable-uuid'}};
 }};
 const admin={rpc:async(name,args)=>{rpc.push({name,args});assert.equal(name,'platform_support_access_finish');return {};}};
 const ctx=vm.createContext({Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,atob,crypto,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  createClient:(_url,key)=>key==='private-service'?admin:caller,
  console:{error:(...args)=>logs.push(args),log:(...args)=>logs.push(args)},
  runManagedSetup:()=>assert.fail('repair must not run managed setup'),runOnboarding:()=>assert.fail('repair must not run onboarding'),
  fetch:async(url,init={})=>{
   assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer private-management');
   http.push({url,method:init.method,body:init.body && JSON.parse(init.body)});
   if(remoteError)return Response.json({error:'private-management canonical-master@example.test'},{status:403});
   if(url.endsWith('/database/query'))return Response.json([{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'owner-immutable-uuid',...current}]);
   if(url.endsWith('/secrets')){if(init.method==='POST'){writes.push(...JSON.parse(init.body));return new Response(null,{status:201});}return Response.json(missingVerification?[]:writes.map(({name})=>({name,value:'server-digest'})));}
   return Response.json({id:ref});
  }});
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/support-auth.ts').replace(/^export /gm,'')),ctx);
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/platform-provision/index.ts').replace(/^import .*$/gm,'')),ctx);
 return {rpc,http,logs,writes,env,ctx,send:async(body=request)=>{const r=await handler(new Request('https://platform.test',{method:'POST',headers:{Authorization:'Bearer verified-token'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
test('actual repair handler sources only server runtime and verified canonical master email, and writes exactly three values',async()=>{
 const f=fixture(),result=await f.send();assert.equal(result.status,200);
 assert.deepEqual(f.writes,[{name:'PLATFORM_SUPABASE_URL',value:platformUrl},{name:'PLATFORM_SUPABASE_ANON',value:jwt()},{name:'PLATFORM_AUTH_EMAIL',value:'canonical-master@example.test'}]);
 assert.deepEqual(result.body,{state:'complete',request_id:request.request_id,support_auth_configured:true});
 assert.deepEqual(f.http.map(c=>[c.url.replace(`https://api.supabase.com/v1/projects/${shopRef}`,''),c.method]),[['','GET'],['/database/query','POST'],['/secrets','POST'],['/secrets','GET']]);
 assert.match(f.http[1].body.query,/^select /);assert.doesNotMatch(f.http[1].body.query,/insert|update|delete/i);
 assert.ok(f.rpc.every(c=>['platform_operator_identity','platform_support_access_target','platform_support_access_finish'].includes(c.name)));
 assert.doesNotMatch(JSON.stringify([result,f.rpc,f.logs]),/canonical-master|private-management|private-service|supabase\.co|h\./);
 assert.equal(f.rpc.at(-1).args.p_configured,true);
});
test('browser configuration injection is rejected before any repair or write',async()=>{
 for(const body of [{...request,PLATFORM_AUTH_EMAIL:'attacker@example.test'},{...request,params:{email:'attacker@example.test'}},{...request,params:{PLATFORM_SUPABASE_URL:'https://attacker.test',PLATFORM_SUPABASE_ANON:'private-key'}},{...request,turnstile_secret:'replacement'}]){
  const f=fixture();assert.equal((await f.send(body)).status,400);assert.equal(f.writes.length,0);assert.equal(f.http.length,0);
 }
});
test('repair requires verified master UUID/role and usable canonical server configuration',async()=>{
 for(const options of [{role:'portfolio_manager'},{identityId:'another-user'}]){const f=fixture(options);assert.equal((await f.send()).status,403);assert.equal(f.http.length,0);}
 for(const options of [{missingEmail:true},{missingRuntime:true},{anon:jwt('service_role')}]){const f=fixture(options);assert.equal((await f.send()).status,503);assert.equal(f.writes.length,0);}
});
test('Platform target and targets rejected by server validation cannot receive secrets',async()=>{
 for(const options of [{ref:platformRef},{targetError:true}]){const f=fixture(options);assert.equal((await f.send()).status,503);assert.equal(f.http.length,0);assert.equal(f.writes.length,0);}
});
test('live target must match recorded version, client, immutable binding and owner request before repair',async()=>{
 for(const current of [{onboarding_version:0},{platform_client_id:99},{client_binding:'different'},{owner_request:'different'},{owner_request:null}]){
  const f=fixture({current});assert.equal((await f.send()).status,503);assert.equal(f.writes.length,0);assert.equal(f.rpc.at(-1).args.p_configured,false);
 }
});
test('remote errors are sanitized and missing installed names cannot produce Verified status',async()=>{
 for(const options of [{remoteError:true},{missingVerification:true}]){const f=fixture(options),result=await f.send();assert.equal(result.status,503);assert.equal(result.body.resumable,true);assert.doesNotMatch(JSON.stringify([result,f.rpc,f.logs]),/private-management|canonical-master|private-service/);assert.equal(f.rpc.at(-1).args.p_configured,false);}
});
test('Advanced repair action is master-only, managed-only and unavailable for retired clients; status is boolean only',()=>{
 const ui=vm.createContext({URL,esc:s=>String(s??'')});vm.runInContext(read('src/client-setup.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ui);
 const client={id:42,onboarding_version:2,pairing_mode:'managed',lifecycle_state:'Suspended',infrastructure_state:'ready',supabase_url:`https://${shopRef}.supabase.co`};
 const detail={provisioning:{connection:{bridge_call_configured:true,health:{checks:{owner_reservation:true},support_auth_configured:true}}}};
 const html=ui.renderClientSetup(client,detail,true);assert.match(html,/value="repair-support-access"/);assert.match(html,/Support access configuration: <strong>Verified/);assert.doesNotMatch(html,/PLATFORM_AUTH_EMAIL|PLATFORM_SUPABASE_ANON/);
 assert.doesNotMatch(ui.renderClientSetup(client,detail,false),/value="repair-support-access"/);
 for(const changes of [{pairing_mode:'byo'},{lifecycle_state:'Archived'},{infrastructure_state:'destroyed'},{infrastructure_state:'decommissioned'}])assert.doesNotMatch(ui.renderClientSetup({...client,...changes},detail,true),/value="repair-support-access"/);
});
