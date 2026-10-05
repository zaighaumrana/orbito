import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const platformRef='ukbhyerxshteyetwomqy',shopRef='dexzxxqkbwnpetbsuxxv';
const platformUrl=`https://${platformRef}.supabase.co`;
const jwt=(role='anon',ref=platformRef,extra={})=>'h.'+Buffer.from(JSON.stringify({role,ref,...extra})).toString('base64url')+'.s';
const platformKeys=()=>[{name:'service_role',type:'legacy',api_key:jwt('service_role')},{name:'secret',type:'secret',api_key:'sb_secret_private-key'},{name:'publishable',type:'publishable',api_key:'sb_publishable_management-key'},{name:'anon',type:'legacy',api_key:jwt()}];
const request={client_id:42,request_id:'98000000-0000-4000-8000-000000000001',action:'repair-support-access',params:{}};
function fixture({role='master_admin',identityId='verified-master',identityError=false,identityThrows=false,targetError=false,ref=shopRef,current={},remoteError=false,runtimeAnon='sb_publishable_runtime-key',keys=platformKeys(),legacyEnabled=true,keyError=0,keyNetworkError=false,keyMalformed=false,missingToken=false,missingEmail=false,url=platformUrl,missingVerification=false}={}){
 let handler;const rpc=[],http=[],logs=[],writes=[];
 const env={SUPABASE_URL:url,SUPABASE_ANON_KEY:runtimeAnon,SUPABASE_SERVICE_ROLE_KEY:'private-service',PLATFORM_MANAGEMENT_TOKEN:missingToken?'':'private-management'};
 const caller={auth:{getUser:async()=>({data:{user:{id:'verified-master'}}})},rpc:async(name,args)=>{
  rpc.push({name,args});
  if(name==='platform_operator_identity'){if(identityThrows)throw Error('private identity details');return {data:{auth_user_id:identityId,role,email:missingEmail?'':'  canonical-master@example.test  '},error:identityError?{}:null};}
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
   if(url.startsWith(`https://api.supabase.com/v1/projects/${platformRef}/api-keys`)){
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);
    if(keyNetworkError)throw Error('private-management private-key-response');
    if(keyError)return Response.json({error:'private-management private-key-response'},{status:keyError});
    if(keyMalformed)return new Response('private-key-response');
    return Response.json(url.endsWith('/legacy')?{enabled:legacyEnabled}:keys);
   }
   if(remoteError)return Response.json({error:'private-management canonical-master@example.test'},{status:403});
   if(url.endsWith('/database/query'))return Response.json([{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'owner-immutable-uuid',...current}]);
   if(url.endsWith('/secrets')){if(init.method==='POST'){writes.push(...JSON.parse(init.body));return new Response(null,{status:201});}return Response.json(missingVerification?[]:writes.map(({name})=>({name,value:'server-digest'})));}
   return Response.json({id:ref});
  }});
 for(const path of ['supabase/functions/_shared/public-api-key.ts','supabase/functions/_shared/support-auth.ts'])vm.runInContext(stripTypeScriptTypes(read(path).replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/platform-provision/index.ts').replace(/^import .*$/gm,'')),ctx);
 return {rpc,http,logs,writes,env,ctx,send:async(body=request)=>{const r=await handler(new Request('https://platform.test',{method:'POST',headers:{Authorization:'Bearer verified-token'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
test('actual repair with a modern runtime publishable key installs the Management legacy anon JWT and exactly three settings',async()=>{
 const f=fixture(),result=await f.send();assert.equal(result.status,200);
 assert.deepEqual(f.writes,[{name:'PLATFORM_SUPABASE_URL',value:platformUrl},{name:'PLATFORM_SUPABASE_ANON',value:jwt()},{name:'PLATFORM_AUTH_EMAIL',value:'canonical-master@example.test'}]);
 assert.deepEqual(result.body,{state:'complete',request_id:request.request_id,support_auth_configured:true});
 assert.deepEqual(f.http.map(c=>[c.url.replace(`https://api.supabase.com/v1/projects/${shopRef}`,'').replace(`https://api.supabase.com/v1/projects/${platformRef}`,'Platform'),c.method]),[['','GET'],['/database/query','POST'],['Platform/api-keys/legacy','GET'],['Platform/api-keys?reveal=true','GET'],['/secrets','POST'],['/secrets','GET']]);
 assert.match(f.http[1].body.query,/^select /);assert.doesNotMatch(f.http[1].body.query,/insert|update|delete/i);
 assert.ok(f.rpc.every(c=>['platform_operator_identity','platform_support_access_target','platform_support_access_finish'].includes(c.name)));
 assert.doesNotMatch(JSON.stringify([result,f.rpc,f.logs]),/canonical-master|private-management|private-service|supabase\.co|h\.|sb_secret_|sb_publishable_|api_key/);
 assert.equal(f.rpc.at(-1).args.p_configured,true);
});
test('browser configuration injection is rejected before any repair or write',async()=>{
 for(const body of [{...request,PLATFORM_AUTH_EMAIL:'attacker@example.test'},{...request,params:{email:'attacker@example.test'}},{...request,params:{PLATFORM_SUPABASE_URL:'https://attacker.test',PLATFORM_SUPABASE_ANON:'private-key'}},{...request,turnstile_secret:'replacement'}]){
  const f=fixture();assert.equal((await f.send(body)).status,400);assert.equal(f.writes.length,0);assert.equal(f.http.length,0);
 }
});
test('repair requires verified master UUID/role and usable canonical server configuration',async()=>{
 for(const options of [{role:'portfolio_manager'},{identityId:'another-user'}]){const f=fixture(options);assert.equal((await f.send()).status,403);assert.equal(f.http.length,0);}
 const f=fixture({missingEmail:true}),result=await f.send();assert.equal(result.status,503);assert.match(result.body.error,/Master identity unavailable/);assert.equal(f.writes.length,0);
});

test('support key resolution ignores runtime key format and uses only the enabled Management anon JWT',async()=>{
 for(const runtimeAnon of ['sb_publishable_runtime-key',jwt('service_role'),jwt('anon',shopRef),'']){
  const f=fixture({runtimeAnon}),result=await f.send();assert.equal(result.status,200);assert.equal(f.writes[1].value,jwt());
 }
 // Skip invalid candidates rather than falling back to a privileged/public opaque key.
 const f=fixture({keys:[{name:'anon',type:'legacy',api_key:jwt('service_role')},{name:'anon',type:'legacy',api_key:jwt('anon',shopRef)},...platformKeys()]});
 assert.equal((await f.send()).status,200);assert.equal(f.writes[1].value,jwt());
});

test('missing, disabled, expired, wrong-ref, privileged and non-JWT Platform anon keys fail closed without exposing values',async()=>{
 const invalid=[[],null,{api_key:jwt()},[{name:'service_role',api_key:jwt('service_role')}],[{name:'secret',api_key:'sb_secret_private-key'}],[{name:'publishable',api_key:'sb_publishable_management-key'}],
  [{name:'anon',api_key:'sb_publishable_management-key'}],[{name:'anon',api_key:'sb_secret_private-key'}],[{name:'anon',api_key:jwt('service_role')}],[{name:'anon',api_key:jwt('anon',shopRef)}],
  [{name:'anon',type:'secret',api_key:jwt()}],[{name:'anon',api_key:'h.'+Buffer.from('{"role":"anon"}').toString('base64url')+'.s'}],
  [{name:'anon',api_key:jwt('anon',platformRef,{exp:1})}],[{name:'anon',api_key:jwt('anon',platformRef,{nbf:Date.now()/1000+3600})}],
  [{name:'anon',api_key:'h.invalid-json.s'}],[{name:'anon',api_key:jwt().split('.').slice(0,2).join('.')}]];
 for(const options of [...invalid.map(keys=>({keys})),{legacyEnabled:false},{missingToken:true},{keyError:403},{keyNetworkError:true},{keyMalformed:true}]){
  const f=fixture(options),result=await f.send();assert.equal(result.status,503);assert.match(result.body.error,/Platform public anon JWT unavailable/);assert.equal(f.writes.length,0);
  assert.doesNotMatch(JSON.stringify([result,f.rpc,f.logs]),/private-management|private-service|private-key-response|sb_secret_|sb_publishable_|h\.|api_key/);
 }
});

test('invalid server Platform URLs fail before any Management request with a project-specific diagnostic',async()=>{
 for(const url of ['','http://'+platformRef+'.supabase.co','https://'+platformRef+'.supabase.co.attacker.test','https://user:password@'+platformRef+'.supabase.co','https://'+platformRef+'.supabase.co/path','https://short.supabase.co','https://'+platformRef+'.supabase.co?key=private']){
  const f=fixture({url}),result=await f.send();assert.equal(result.status,503);assert.match(result.body.error,/Platform project identity invalid/);assert.equal(f.http.length,0);assert.equal(f.writes.length,0);
 }
});

test('shared support resolver distinguishes unavailable verified master identity without API access',async()=>{
 for(const options of [{role:'portfolio_manager'},{identityId:'another-user'},{identityError:true},{identityThrows:true},{missingEmail:true}]){
  const f=fixture(options);await assert.rejects(f.ctx.supportAuthSecrets({rpc:async()=>{if(options.identityThrows)throw Error('private identity details');return {data:{role:options.role||'master_admin',auth_user_id:options.identityId||'verified-master',email:options.missingEmail?'':'canonical-master@example.test'},error:options.identityError?{}:null}}},'verified-master'),/Master identity unavailable/);assert.equal(f.http.length,0);
 }
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
