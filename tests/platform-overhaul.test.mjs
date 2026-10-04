import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const load=(p,context={})=>{const ctx=vm.createContext({console,URL,Response,AbortSignal,FormData,Blob,Uint8Array,TextEncoder,crypto:webcrypto,atob,...context});if(p==='supabase/functions/_shared/managed-setup.ts')for(const dependency of ['public-api-key.ts','support-auth.ts'])vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/'+dependency).replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);vm.runInContext(stripTypeScriptTypes(read(p).replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);return ctx;};
const esc=String,noop=()=>{};
const ui=load('src/lifecycle.js',{esc});
const anon='header.'+Buffer.from(JSON.stringify({role:'anon',ref:'abcdefghijklmnopqrst'})).toString('base64url')+'.signature';
test('outer submit dispatcher owns busy state while special forms execute and reject duplicate clicks',async()=>{
 const cases=[['config-recovery','reconcile'],['client-lifecycle','archive'],['provision-recovery','resume'],['public-environment','copy']];
 for(const [type,action] of cases){
  let submit,release,calls=0,refreshes=0,renders=0;const alerts=[];
  const pending=new Promise(resolve=>release=resolve);
  const form={dataset:{pForm:type},elements:Object.fromEntries(Object.entries({request_id:'original-request',reason:'Audited recovery',project_ref:'abcdefghijklmnopqrst',anon,site_key:'public-site'}).map(([name,value])=>[name,{value}]))};
  const operation=async(name,args)=>{
   calls++;assert.equal(form.dataset.busy,'true');
   if(type==='config-recovery'){
    assert.equal(name,'platform-config');assert.equal(args.body.request_id,'original-request');
    assert.equal(args.body.action,'recover');assert.equal(args.body.recovery_action,action);
   }else if(type==='public-environment')assert.match(name,/VITE_SUPABASE_URL=/);
   else{
    assert.equal(name,type==='client-lifecycle'?'platform_client_lifecycle':'platform_provision_reconcile');
    assert.equal(args.p_client,42);assert.equal(args.p_action,action);
    if(type==='provision-recovery')assert.equal(args.p_request,'original-request');
   }
   await pending;return {data:{state:'applied'}};
  };
  const ctx=load('src/forms.js',{
   pState:{selectedClient:{id:42,supabase_url:'https://abcdefghijklmnopqrst.supabase.co'},clientData:{config:{}},modal:'open'},
   rpc:operation,pb:{functions:{invoke:operation}},publicEnvironment:ui.publicEnvironment,
   navigator:{clipboard:{writeText:operation}},alert:message=>alerts.push(message),
   loadPlatform:async()=>{refreshes++;assert.equal(form.dataset.busy,'true');},loadClientData:async()=>{},render:()=>renders++,
   document:{addEventListener:(name,listener)=>{assert.equal(name,'submit');submit=listener;}}
  });
  // Execute the actual registration from main.js, without unrelated app boot/network work.
  const dispatcher=read('src/main.js').split('/* ── Wire up all click/input/keyboard events ── */')[0].replace(/^import .*$/gm,'');
  vm.runInContext(dispatcher,ctx);
  const event={target:form,submitter:{value:action},preventDefault:noop};
  const first=submit(event);
  assert.equal(calls,1,`${type} must execute after the outer listener sets busy`);
  await submit(event);assert.equal(calls,1,'an overlapping submit must be ignored');
  assert.equal(form.dataset.busy,'true');release();await first;
  assert.equal(form.dataset.busy,undefined);assert.deepEqual(alerts,[]);
  assert.equal(refreshes,type==='public-environment'?0:1);assert.equal(renders,refreshes);
  if(type!=='public-environment')assert.equal(ctx.pState.modal,null);
  // A rejected operation retains error/refresh behavior and releases the outer guard.
  if(type==='config-recovery'){
   ctx.pb.functions.invoke=async()=>{throw Error('fixture failure');};
   await submit(event);assert.deepEqual(alerts,['fixture failure']);
   assert.equal(form.dataset.busy,undefined);assert.equal(refreshes,2);assert.equal(renders,2);
  }
 }
});
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
function managedFixture({ref='abcdefghijklmnopqrst',mode='managed',failure=null,failureStatus=0,history=[],foreignShop=false,target={},schemaCount=0,savedStages=[],savedChecksums={},artifact=null,requestId='same-request',platformKeys=null,platformLegacyEnabled=true}={}){
 const states=new Map(savedStages.map(name=>[name,'passed'])),calls=[],http=[],secrets=[],order=[],uploads=[];let reject=failure;
 const current={onboarding_version:0,platform_client_id:null,client_binding:null,owner_request:null,has_owner:false,...(foreignShop?{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'different-bootstrap-uuid',has_owner:true}:{}),...target};
 const release=artifact || {sha256:'release-hash',stage_checksums:{migrations:'legacy-release-hash',functions:'legacy-release-hash'},migrations:[{version:'20261003121000',name:'test',sql:'begin;\nselect 1;\ncommit;',sha256:'migration-hash'}],functions:[{name:'platform-bridge',entrypoint:'platform-bridge/index.ts',verify_jwt:false,sha256:'function-hash',stage_sha256:'legacy-function-hash',files:[{path:'_shared/runtime-preflight.ts',content:'export const checkRuntime = () => ({});'},{path:'platform-bridge/index.ts',content:"import { checkRuntime } from '../_shared/runtime-preflight.ts';"}]}]};
 const stageChecksum=name=>name==='project-access'?ref:name==='migrations'?release.stage_checksums.migrations:name==='functions'?release.stage_checksums.functions:name==='turnstile'?createHash('sha256').update('private-turnstile').digest('hex'):name.startsWith('migration:')?release.migrations.find(m=>'migration:'+m.version===name).sha256:name.startsWith('function:')?release.functions.find(f=>'function:'+f.name===name).stage_sha256:null;
 const checksums=new Map(savedStages.map(name=>[name,Object.hasOwn(savedChecksums,name)?savedChecksums[name]:stageChecksum(name)]));
 const platformUrl='https://ukbhyerxshteyetwomqy.supabase.co',platformAnon='h.'+Buffer.from(JSON.stringify({role:'anon',ref:'ukbhyerxshteyetwomqy'})).toString('base64url')+'.s';
 const env={PLATFORM_MANAGEMENT_TOKEN:'server-management-token',SUPABASE_URL:platformUrl,SUPABASE_ANON_KEY:'sb_publishable_runtime-platform'};
 const caller={rpc:async name=>{assert.equal(name,'platform_operator_identity');return {data:{auth_user_id:'master-id',role:'master_admin',email:'canonical-master@example.test'}};}};
 const ctx=load('supabase/functions/_shared/managed-setup.ts',{release,Deno:{env:{get:key=>env[key]}},runOnboarding:async(_admin,request)=>{http.push('bridge-owner');order.push(request.action);},fetch:async(url,init={})=>{
   http.push(url);assert.equal(init.headers.Authorization,'Bearer server-management-token');
   if(url.startsWith('https://api.supabase.com/v1/projects/ukbhyerxshteyetwomqy/api-keys')){
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);
    return Response.json(url.endsWith('/legacy')?{enabled:platformLegacyEnabled}:platformKeys || [{name:'service_role',type:'legacy',api_key:'NEVER-BROWSER-PLATFORM-SERVICE'},{name:'publishable',type:'publishable',api_key:'sb_publishable_management-platform'},{name:'anon',type:'legacy',api_key:platformAnon}]);
   }
   assert.ok(url.startsWith('https://api.supabase.com/v1/projects/'+ref));
   if(reject && url.includes(reject)){reject=null;if(failureStatus)return Response.json({error:'Entrypoint path does not exist'},{status:failureStatus});throw Error('sensitive remote exception');}
   if(url.endsWith('/secrets')){if(init.method==='POST'){order.push('secrets');secrets.push(...JSON.parse(init.body));return new Response(null,{status:201});}return Response.json(secrets.map(({name})=>({name,value:'digest'})));}
   if(url.endsWith('/database/migrations'))return Response.json(history);
   if(url.endsWith('/database/query')){const query=JSON.parse(init.body).query;if(query.startsWith('begin;')){http.push('migration-write');order.push('migration');}if(query.startsWith('select sc.'))order.push('validate');return Response.json(query.startsWith('select sc.')?[current]:[{count:schemaCount}]);}
   if(url.includes('/functions/deploy')){
    order.push('functions');assert.ok(init.body instanceof FormData);assert.equal(init.headers['Content-Type'],undefined);
    const metadata=JSON.parse(init.body.get('metadata')),files=await Promise.all(init.body.getAll('file').map(async file=>({path:file.name,content:await file.text(),type:file.type})));
    uploads.push({metadata,files});
   }
   if(url.endsWith('/api-keys?reveal=true'))return Response.json([{name:'service_role',api_key:'NEVER-BROWSER-SERVICE'},{name:'secret',api_key:'sb_secret_fixture'},{name:'anon',api_key:anon}]);
   return Response.json({id:ref});
 }});
 const admin={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{supabase_url:'https://'+ref+'.supabase.co',pairing_mode:mode,onboarding_version:2,lifecycle_state:'Provisioning',infrastructure_state:'unknown'}})})})}),rpc:async(name,args)=>{
   calls.push({name,args});if(name==='platform_onboarding_step'){order.push('prepare');return {data:{project_ref:ref,call_secret:'server-call',source_secret:'server-source',payload:{client_binding:'orbito-client-42',request_id:requestId}}};}
   if(name==='platform_provision_status_service')return {data:{infrastructure:'ready'}};
   const previous=states.get(args.p_name),checksum=checksums.get(args.p_name),missingPassedSecret=args.p_name==='turnstile' && previous==='passed' && args.p_checksum===null;
   if((previous==='passed' || (args.p_name==='turnstile' && checksum!=null)) && checksum!==args.p_checksum && !missingPassedSecret)return {error:{message:'Approved artifact changed; reconcile before retry'}};
   if(previous==='passed')return {data:{skip:true}};states.set(args.p_name,args.p_state);checksums.set(args.p_name,args.p_checksum);return {data:{skip:false}};
 }};
 const request={client_id:42,request_id:requestId,action:'managed-setup',params:{site_key:'public-site'}};
 return {run:(...args)=>ctx.runManagedSetup(admin,request,platformUrl,args.length?args[0]:'private-turnstile',caller,'master-id'),states,checksums,calls,http,secrets,request,order,uploads};
}

test('approved Shop functions deploy repeated source file parts with included entrypoints and unchanged JWT metadata',async()=>{
 const artifact=JSON.parse(read('supabase/functions/_shared/shop-release.json')),f=managedFixture({artifact});await f.run();
 assert.equal(f.uploads.length,6);
 for(const upload of f.uploads){
  const fn=artifact.functions.find(fn=>fn.name===upload.metadata.name);
  assert.deepEqual(upload.metadata,{name:fn.name,entrypoint_path:fn.entrypoint,verify_jwt:fn.verify_jwt});
  assert.ok(upload.files.length>1);assert.deepEqual(upload.files.map(file=>({path:file.path,content:file.content})),fn.files.map(file=>({path:file.path,content:file.content})));
  assert.ok(upload.files.some(file=>file.path===upload.metadata.entrypoint_path));assert.ok(upload.files.every(file=>file.type==='application/typescript' && !file.path.endsWith('.zip')));
  assert.doesNotMatch(JSON.stringify(upload),/server-management-token|private-turnstile|server-call|server-source|NEVER-BROWSER-SERVICE/);
 }
 assert.equal(f.uploads.find(u=>u.metadata.name==='platform-bridge').metadata.verify_jwt,false);
});

test('HTTP 400 account-admin failure resumes the recorded UUID without reinstalling passed stages or re-entering Turnstile',async()=>{
 const artifact=JSON.parse(read('supabase/functions/_shared/shop-release.json'));
 const legacy=JSON.parse(read('../Orbitoshopv2-v1/scripts/managed-release-v1-checksums.json'));
 const requestId='70df1850-292f-447f-93fb-8d5e0e915f9e';
 const f=managedFixture({artifact,requestId,failure:'/functions/deploy?slug=account-admin',failureStatus:400});
 await assert.rejects(f.run(),/HTTP 400/);assert.equal(f.states.get('function:account-admin'),'failed');assert.equal(f.states.get('functions'),'failed');
 assert.equal(f.checksums.get('migrations'),legacy.release_sha256);assert.equal(f.states.get('turnstile'),'passed');
 const saved=new Map(f.checksums),writes=f.http.filter(url=>url==='migration-write' || url.endsWith('/secrets')).length;
 assert.equal((await f.run(undefined)).state,'complete');
 assert.equal(f.http.filter(url=>url==='migration-write' || url.endsWith('/secrets')).length,writes);
 for(const stage of ['migrations','server-secrets','turnstile'])assert.equal(f.checksums.get(stage),saved.get(stage));
 assert.deepEqual(f.uploads.map(u=>u.metadata.name),artifact.functions.map(fn=>fn.name));
 assert.ok(f.calls.filter(c=>c.name==='platform_managed_stage').every(c=>c.args.p_request===requestId));
 await f.run(undefined);assert.equal(f.uploads.length,6);assert.equal(f.order.filter(stage=>stage==='bootstrap-shop').length,1);
});

test('regenerated release skips an approved passed function and rejects a changed successful checksum',async()=>{
 const artifact=JSON.parse(read('supabase/functions/_shared/shop-release.json'));
 const legacy=JSON.parse(read('../Orbitoshopv2-v1/scripts/managed-release-v1-checksums.json'));
 const savedStages=['project-access','migrations','server-secrets','turnstile','support-auth-config','function:account-admin'];
 const f=managedFixture({artifact,savedStages,savedChecksums:{migrations:legacy.release_sha256,'function:account-admin':artifact.functions.find(fn=>fn.name==='account-admin').stage_sha256}});
 await f.run(undefined);assert.deepEqual(f.uploads.map(u=>u.metadata.name),artifact.functions.slice(1).map(fn=>fn.name));assert.equal(f.secrets.length,0);assert.ok(!f.http.includes('migration-write'));
 const changed=managedFixture({artifact,savedStages,savedChecksums:{'function:account-admin':'unapproved-source-checksum'}});
 await assert.rejects(changed.run(undefined),/Stage state unavailable/);assert.equal(changed.uploads.length,0);
});

test('freshly migrated version-0 Shop is accepted before pairing and canonical bootstrap',async()=>{
 const f=managedFixture();assert.equal((await f.run()).state,'complete');
 assert.deepEqual(f.order,['migration','validate','prepare','secrets','secrets','secrets','functions','bootstrap-shop','onboarding-status']);
});

test('new support stage runs independently when all prior managed stages already passed',async()=>{
 const f=managedFixture({savedStages:['project-access','migrations','server-secrets','turnstile','functions','bridge-owner','preflight'],target:{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'same-request'}});
 assert.equal((await f.run(undefined)).state,'complete');
 assert.deepEqual(f.secrets.map(s=>s.name),['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL']);
 assert.equal(f.uploads.length,0);assert.ok(!f.http.includes('migration-write'));assert.ok(!f.http.includes('bridge-owner'));
 assert.equal(f.states.get('support-auth-config'),'passed');
 await f.run(undefined);assert.equal(f.secrets.length,3);
});

test('future managed support stage resolves Platform legacy anon through Management with publishable runtime key',async()=>{
 const f=managedFixture(),result=await f.run();
 const lookup='https://api.supabase.com/v1/projects/ukbhyerxshteyetwomqy/api-keys?reveal=true';
 assert.ok(f.http.includes(lookup));assert.ok(f.http.includes(lookup.replace('?reveal=true','/legacy')));
 assert.equal(f.states.get('support-auth-config'),'passed');
 const value=f.secrets.find(s=>s.name==='PLATFORM_SUPABASE_ANON').value;
 assert.deepEqual(JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()),{role:'anon',ref:'ukbhyerxshteyetwomqy'});
 assert.notEqual(value,'sb_publishable_runtime-platform');
 assert.doesNotMatch(JSON.stringify([result,f.calls]),/NEVER-BROWSER-PLATFORM-SERVICE|sb_publishable_|api_key/);
 assert.ok(!JSON.stringify([result,f.calls]).includes(value));
 for(const options of [{platformKeys:[]},{platformKeys:[{name:'anon',api_key:anon}]},{platformLegacyEnabled:false}]){
  const failed=managedFixture(options);await assert.rejects(failed.run(),/Platform public anon JWT unavailable/);
  assert.equal(failed.states.get('support-auth-config'),'failed');assert.equal(failed.uploads.length,0);
  assert.ok(!failed.secrets.some(s=>s.name.startsWith('PLATFORM_SUPABASE') || s.name==='PLATFORM_AUTH_EMAIL'));
 }
});

test('managed public environment still returns only the exact Shop public JWT via the shared selector',async()=>{
 let keys=[{name:'secret',type:'secret',api_key:'sb_secret_never-public'},{name:'service_role',api_key:'NEVER-PUBLIC-SERVICE'},{name:'publishable',type:'publishable',api_key:'sb_publishable_other'},{name:'anon',type:'legacy',api_key:anon}];
 const ctx=load('supabase/functions/_shared/managed-setup.ts',{Deno:{env:{get:()=> 'server-management-token'}},fetch:async(url,init)=>{
  assert.equal(url,'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/api-keys?reveal=true');assert.equal(init.headers.Authorization,'Bearer server-management-token');assert.equal(init.redirect,'error');return Response.json(keys);
 }});
 const admin={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{supabase_url:'https://abcdefghijklmnopqrst.supabase.co',pairing_mode:'managed',turnstile_site_key:'public-site'}})})})})};
 const result=await ctx.managedPublicEnvironment(admin,42,'https://ukbhyerxshteyetwomqy.supabase.co');
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{VITE_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SUPABASE_ANON:anon,VITE_TURNSTILE_SITE_KEY:'public-site'});
 assert.doesNotMatch(JSON.stringify(result),/sb_secret_|NEVER-PUBLIC-SERVICE|api_key/);
 keys=[{name:'anon',api_key:'h.'+Buffer.from(JSON.stringify({role:'anon',ref:'ukbhyerxshteyetwomqy'})).toString('base64url')+'.s'}];
 await assert.rejects(ctx.managedPublicEnvironment(admin,42,'https://ukbhyerxshteyetwomqy.supabase.co'),/public anon JWT/);
});

test('same recorded request resumes a fresh Shop after the migrations stage passed',async()=>{
 const f=managedFixture({savedStages:['project-access','migrations','migration:20261003121000']});assert.equal((await f.run()).state,'complete');
 assert.ok(!f.http.some(url=>url.endsWith('/database/migrations') || url==='migration-write'));
 assert.deepEqual(f.order,['validate','prepare','secrets','secrets','secrets','functions','bootstrap-shop','onboarding-status']);
 assert.ok(f.calls.every(c=>c.args.p_request===f.request.request_id || c.name==='platform_provision_status_service'));
});

test('exact reserved V2 identity remains resumable',async()=>{
 const f=managedFixture({target:{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'same-request'}});
 assert.equal((await f.run()).state,'complete');
});

for(const [name,target] of [
 ['initialized version-2 Shop',{onboarding_version:2}],
 ['owner-existing Shop',{has_owner:true}],
 ['fresh version with conflicting binding',{client_binding:'another-client'}],
 ['fresh version with existing owner request',{owner_request:'different-bootstrap-uuid'}],
 ['fresh version with different client ID',{platform_client_id:99}],
 ['reserved Shop with different binding',{onboarding_version:2,platform_client_id:42,client_binding:'another-client',owner_request:'same-request'}],
 ['reserved Shop with different request',{onboarding_version:2,platform_client_id:42,client_binding:'orbito-client-42',owner_request:'different-bootstrap-uuid'}],
 ['reserved Shop with different client ID',{onboarding_version:2,platform_client_id:99,client_binding:'orbito-client-42',owner_request:'same-request'}],
 ['unsupported onboarding version',{onboarding_version:1}],
])test(`managed rejects ${name} before secrets/functions`,async()=>{
 const f=managedFixture({target});await assert.rejects(f.run(),/initialized or differently bound Shop/);
 assert.equal(f.secrets.length,0);assert.ok(!f.http.some(url=>url.includes('/functions/deploy')));
 assert.ok(!f.order.includes('bootstrap-shop'));
});

test('existing schema without approved migration history requires manual adoption',async()=>{
 const f=managedFixture({schemaCount:1});await assert.rejects(f.run(),/Existing schema without approved history/);
 assert.equal(f.secrets.length,0);assert.ok(!f.http.includes('migration-write'));assert.ok(!f.order.includes('prepare'));
});
test('managed rejects Platform project and BYO before contacting Management API',async()=>{
 for(const options of [{ref:'ukbhyerxshteyetwomqy'},{mode:'byo'}]){const f=managedFixture(options);await assert.rejects(f.run(),/Exact managed Shop/);assert.equal(f.http.length,0);}
});
test('managed stages install approved artifacts, secrets, bridge/owner and preflight; response is public only',async()=>{
 const f=managedFixture();const result=await f.run();
 for(const name of ['project-access','migrations','migration:20261003121000','server-secrets','turnstile','support-auth-config','functions','function:platform-bridge','bridge-owner','preflight'])assert.equal(f.states.get(name),'passed',name);
 assert.deepEqual(f.secrets.map(s=>s.name),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT','TURNSTILE_SECRET','PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL']);
 assert.equal(f.secrets.find(s=>s.name==='PLATFORM_SUPABASE_URL').value,'https://ukbhyerxshteyetwomqy.supabase.co');assert.equal(f.secrets.find(s=>s.name==='PLATFORM_AUTH_EMAIL').value,'canonical-master@example.test');
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
