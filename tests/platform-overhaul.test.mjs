import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const load=(p,context={})=>{const ctx=vm.createContext({console,URL,Response,AbortSignal,FormData,Blob,Uint8Array,TextEncoder,crypto:webcrypto,atob,...context});vm.runInContext(stripTypeScriptTypes(read(p).replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);return ctx;};
const esc=String,noop=()=>{};
const ui=load('src/lifecycle.js',{esc});
const anon='header.'+Buffer.from(JSON.stringify({role:'anon',ref:'abcdefghijklmnopqrst'})).toString('base64url')+'.signature';
test('current/historical filters hide archives, retain provisioning and prevent retired contact',()=>{
 const clients=[{id:1,name:'Active',status:'Active'},{id:2,name:'Suspended',status:'Suspended'},{id:3,name:'Archive',lifecycle_state:'Archived'},{id:4,name:'New',lifecycle_state:'Provisioning'}];
 assert.deepEqual(Array.from(ui.visibleClients(clients),c=>c.id),[1,2,4]);assert.deepEqual(Array.from(ui.visibleClients(clients,'historical'),c=>c.id),[3]);assert.equal(ui.visibleClients(clients,'all').length,4);
 assert.equal(ui.canContactShop(clients[2]),false);assert.equal(ui.canContactShop({...clients[0],infrastructure_state:'destroyed'}),false);
});
test('copy block contains exactly public Shop values and rejects service/secret keys',()=>{
 const c={supabase_url:'https://abcdefghijklmnopqrst.supabase.co'};
 const block=ui.publicEnvironment(c,anon,'public-site');assert.deepEqual(block.split('\n').map(x=>x.split('=')[0]),['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY']);
 for(const role of ['service_role','authenticated'])assert.throws(()=>ui.publicEnvironment(c,'x.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.y','site'));
 assert.throws(()=>ui.publicEnvironment(c,'sb_secret_fake','site'));
});
test('server config source of truth clears stale browser ghosts and coalesces submit',async()=>{
 const saved=new Map([['orbito-operation:config:42','corrupt old state']]);
 const ctx=load('src/operations.js',{pb:{},localStorage:{removeItem:k=>saved.delete(k)},crypto:{randomUUID:()=> 'new-request'}});
 let calls=0;const status=async()=>({config_jobs:[{request_id:'original-request'}]});
 await assert.rejects(ctx.serverConfigOperation(42,{suspended:true},status,()=>assert.fail()),/server operation/);assert.equal(saved.size,0);
 const first=ctx.serverConfigOperation(42,{},async()=>({config_jobs:[]}),async id=>{calls++;assert.equal(id,'new-request');return true;});
 assert.equal(ctx.serverConfigOperation(42,{},()=>assert.fail(),()=>assert.fail()),first);await first;assert.equal(calls,1);
});
function managedFixture({ref='abcdefghijklmnopqrst',mode='managed',failure=null,history=[],foreignShop=false}={}){
 const states=new Map(),calls=[],http=[],secrets=[];let reject=failure;
 const release={sha256:'release-hash',migrations:[{version:'20261003121000',name:'test',sql:'begin;\nselect 1;\ncommit;',sha256:'migration-hash'}],functions:[{name:'platform-bridge',entrypoint:'platform-bridge/index.ts',verify_jwt:false,sha256:'function-hash',zip:Buffer.from('fixturezip').toString('base64')}]};
 const ctx=load('supabase/functions/_shared/managed-setup.ts',{release,Deno:{env:{get:()=> 'server-management-token'}},runOnboarding:async()=>{http.push('bridge-owner');},fetch:async(url,init={})=>{
   http.push(url);assert.ok(url.startsWith('https://api.supabase.com/v1/projects/'+ref));assert.equal(init.headers.Authorization,'Bearer server-management-token');
   if(reject && url.includes(reject)){reject=null;throw Error('sensitive remote exception');}
   if(url.endsWith('/secrets')){secrets.push(...JSON.parse(init.body));return new Response(null,{status:201});}
   if(url.endsWith('/database/migrations'))return Response.json(history);
   if(url.endsWith('/database/query')){if(JSON.parse(init.body).query.startsWith('begin;'))http.push('migration-write');return Response.json(JSON.parse(init.body).query.startsWith('select sc.')?[{onboarding_version:2,platform_client_id:foreignShop?42:null,client_binding:foreignShop?'orbito-client-42':null,owner_request:foreignShop?'different-bootstrap-uuid':null,has_owner:foreignShop}]:[{count:0}]);}
   if(url.endsWith('/api-keys?reveal=true'))return Response.json([{name:'service_role',api_key:'NEVER-BROWSER-SERVICE'},{name:'secret',api_key:'sb_secret_fixture'},{name:'anon',api_key:anon}]);
   return Response.json({id:ref});
 }});
 const admin={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{supabase_url:'https://'+ref+'.supabase.co',pairing_mode:mode,onboarding_version:2,lifecycle_state:'Provisioning',infrastructure_state:'unknown'}})})})}),rpc:async(name,args)=>{
   calls.push({name,args});if(name==='platform_onboarding_step')return {data:{project_ref:ref,call_secret:'server-call',source_secret:'server-source',payload:{client_binding:'orbito-client-42',request_id:'same-request'}}};
   if(name==='platform_provision_status_service')return {data:{infrastructure:'ready'}};
   const previous=states.get(args.p_name);if(previous==='passed')return {data:{skip:true}};states.set(args.p_name,args.p_state);return {data:{skip:false}};
 }};
 const request={client_id:42,request_id:'same-request',action:'managed-setup',params:{site_key:'public-site'}};
 return {run:(secret='private-turnstile')=>ctx.runManagedSetup(admin,request,'https://ukbhyerxshteyetwomqy.supabase.co',secret),states,calls,http,secrets,request};
}
test('managed rejects Platform project and BYO before contacting Management API',async()=>{
 for(const options of [{ref:'ukbhyerxshteyetwomqy'},{mode:'byo'}]){const f=managedFixture(options);await assert.rejects(f.run(),/Exact managed Shop/);assert.equal(f.http.length,0);}
});
test('managed stages install approved artifacts, secrets, bridge/owner and preflight; response is public only',async()=>{
 const f=managedFixture();const result=await f.run();
 for(const name of ['project-access','migrations','migration:20261003121000','server-secrets','turnstile','functions','function:platform-bridge','bridge-owner','preflight'])assert.equal(f.states.get(name),'passed',name);
 assert.deepEqual(f.secrets.map(s=>s.name),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT','TURNSTILE_SECRET']);
 assert.equal(result.public_env.VITE_SUPABASE_ANON,anon);
 assert.doesNotMatch(JSON.stringify(result),/NEVER-BROWSER-SERVICE|private-turnstile|server-management-token|server-call|server-source|sb_secret/);
 assert.doesNotMatch(JSON.stringify(f.calls),/private-turnstile|server-management-token|server-call|server-source/);
});
test('failed function retry keeps exact request and does not repeat passed migration/secret stages',async()=>{
 const f=managedFixture({failure:'/functions/deploy'});await assert.rejects(f.run(),/outcome unknown/);const before=f.http.filter(x=>x.endsWith('/secrets') || x==='migration-write').length;
 assert.equal(f.states.get('functions'),'failed');await f.run(undefined);
 assert.equal(f.http.filter(x=>x.endsWith('/secrets') || x==='migration-write').length,before);assert.equal(f.states.get('preflight'),'passed');
 assert.ok(f.calls.every(c=>c.args.p_request==='same-request' || c.name==='platform_provision_status_service'));
});
test('unapproved history fails closed, never resets/migrates target',async()=>{
 const f=managedFixture({history:[{version:'unapproved'}]});await assert.rejects(f.run(),/Unapproved target/);assert.ok(!f.http.some(x=>x.endsWith('/database/query')));
});
test('an unrelated V2 Shop with the same numeric ID/binding cannot have its secrets/functions replaced',async()=>{
 const f=managedFixture({foreignShop:true});await assert.rejects(f.run(),/initialized or differently bound Shop/);assert.equal(f.secrets.length,0);assert.ok(!f.http.some(x=>x.includes('/functions/deploy')));
});
test('missing Turnstile secret requires manual input without logging/retaining any secret',async()=>{
 const f=managedFixture();await assert.rejects(f.run(''),/Enter the Turnstile secret once/);assert.equal(f.states.get('turnstile'),'manual');assert.equal(f.secrets.length,3);
});
test('billing empty/nonempty copy and 25-row display do not change calculations',()=>{
 const src=read('src/pages/billing.js');assert.match(src,/No issued invoices yet\./);assert.match(src,/Showing up to the latest 25 issued invoices\. Outstanding total includes all issued invoices\./);assert.match(src,/invoices\.slice\(0, 25\)/);
});
test('migration and server boundary enforce privileged recovery, history retention and immutable mode',()=>{
 const sql=read('supabase/migrations/20261003120000_platform_overhaul_v1.sql');assert.match(sql,/Managed\/BYO mode is immutable/);assert.match(sql,/require_role\(array\['master_admin'\]\)/);assert.doesNotMatch(sql,/delete from public\.(clients|payments|usage_logs|billing_cycles|operator_audit)/i);
 const edge=read('supabase/functions/platform-config/index.ts');assert.match(edge,/request_id:body\.request_id,changes:recovery\.changes/);assert.match(edge,/platform_config_recovery_finish/);
 const provision=read('supabase/functions/platform-provision/index.ts');assert.match(provision,/delete body.turnstile_secret/);assert.doesNotMatch(provision,/p_params:.*turnstile_secret/);
});
async function recoveryFixture(action,{match=false,timeout=false,closed=false}={}){
 let handler;const calls=[],writes=[];
 const config={repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:false,live_tracking_enabled:false,ems_enabled:false,ems_track_breaks:false,suspended:match};
 const caller={auth:{getUser:async()=>({data:{user:{id:'verified-operator'}}})},rpc:async(name,args)=>({data:name==='platform_config_recovery'?(closed?{complete:true,state:'failed'}:{complete:false,recovery_id:'lease',changes:{suspended:true}}):{}})};
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}};let clients=0;
 load('supabase/functions/platform-config/index.ts',{Deno:{env:{get:()=> 'server-value'},serve:fn=>handler=fn},createClient:()=>++clients===1?caller:admin,bridgeCallCredential:async()=>({project_ref:'abcdefghijklmnopqrst',bridge_call_secret:'never-browser-call-secret'}),fetch:async(url,init)=>{
   const body=JSON.parse(init.body);writes.push(body);if(timeout)throw Error('remote-secret-error');return Response.json({config:body.operation==='config-read'?config:{...config,suspended:true}});
 }});
 const response=await handler(new Request('https://platform.invalid',{method:'POST',body:JSON.stringify({client_id:42,request_id:'original-request',action:'recover',recovery_action:action,reason:'Audited fixture recovery'})}));return {calls,writes,result:await response.json(),status:response.status};
}
test('recovery reads first then retries EXACT original identity and changes',async()=>{
 const f=await recoveryFixture('retry');assert.deepEqual(f.writes,[{operation:'config-read'},{operation:'config-write',request_id:'original-request',changes:{suspended:true}}]);assert.equal(f.calls[0].args.p_state,'applied');assert.doesNotMatch(JSON.stringify(f.result),/never-browser-call-secret/);
});
test('reconcile mismatch/read-only/unknown timeout never clears the original uncertainty',async()=>{
 for(const [action,options] of [['reconcile',{}],['read',{match:true}],['retry',{timeout:true}]]){const f=await recoveryFixture(action,options);assert.equal(f.calls[0].args.p_state,null);assert.equal(f.result.state,'unresolved');}
 const matched=await recoveryFixture('reconcile',{match:true});assert.equal(matched.calls[0].args.p_state,'applied');assert.equal(matched.writes.length,1);
});
test('closed server operation is authoritative, recovery never contacts a vanished Shop',async()=>{
 const f=await recoveryFixture('close',{closed:true});assert.equal(f.writes.length,0);assert.equal(f.result.complete,true);
});
