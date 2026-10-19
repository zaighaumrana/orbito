import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileManagedSupport,approvedSupportHistory} from '../supabase/functions/_shared/support-automation.ts';
import {releases,activeRelease,pinManagedRelease,validateRelease} from '../supabase/functions/_shared/shop-release-registry.ts';
import {ticketHandler} from '../../Orbitoshopv2-v1/supabase/functions/support-tickets/handler.ts';
import {sha} from '../supabase/functions/platform-support-tickets/protocol.ts';
import {submitByoSupport} from '../src/byo-support.js';
const platform='https://qrstabcdefghijklmnop.supabase.co',ref='abcdefghijklmnopqrst',shop='https://'+ref+'.supabase.co',actor='97000000-0000-4000-8000-000000000001',sid='97000000-0000-4000-8000-000000000002',source='98000000-0000-4000-8000-000000000001',request='99000000-0000-4000-8000-000000000001';
const release=releases['support-v2'],history=release.migrations.slice(0,32).map(m=>({version:m.version,name:m.name,statements:[m.sql]}));
async function promoted(fn){const before={...activeRelease};Object.assign(activeRelease,{release_id:'support-v2',sha256:release.sha256});try{return await fn()}finally{Object.assign(activeRelease,before)}}
async function fixture(opt={}){
 const events=[],secret='d'.repeat(64),hash=await sha(secret),anon='x.'+Buffer.from(JSON.stringify({role:'anon',ref,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.x';
 const context={state:'waiting',ready:opt.ready!==false,request_id:request,project_ref:ref,source_id:source,client_binding:'orbito-client-42',...opt.context};
 let enabled=opt.enabled||false,installed='',dispatched=false,writes=0;
 const env={SUPABASE_URL:platform,SUPABASE_ANON_KEY:'platform-public',SUPABASE_SERVICE_ROLE_KEY:'platform-private',PLATFORM_MANAGEMENT_TOKEN:'management-private'};
 const admin={rpc:async(name,args)=>{assert.equal(name,'platform_support_automation_command');events.push({journal:args.p_action,data:args.p_data});if(args.p_action==='record')Object.assign(context,args.p_data);if(enabled)context.state='enabled';return {data:{...context}}}};
 const identity={auth_user_id:actor,session_id:sid,role:opt.role||'master_admin'};
 const caller={rpc:async()=>({data:identity})};
 let local;
 const fetcher=async(url,init)=>{
  events.push({url});const headers=new Headers(init.headers);
  if(url===shop+'/functions/v1/support-tickets')return local(new Request(url,init));
  if(url===platform+'/auth/v1/user')return Response.json({id:actor});
  if(url===platform+'/rest/v1/rpc/platform_operator_identity')return Response.json(identity);
  if(url===shop+'/rest/v1/rpc/support_ticket_installation_context')return Response.json({source_id:source,client_binding:context.client_binding,platform_client_id:42,installation_version:2,ready:true});
  if(url===platform+'/rest/v1/rpc/platform_support_credential_command'){
   const b=JSON.parse(init.body);assert.equal(b.p_request,request);events.push({credential:b.p_action});
   if(b.p_action==='material')return Response.json({secret,secret_sha256:hash,project_ref:ref,source_id:source,client_binding:context.client_binding,shop_public_api_key:anon,pairing_mode:'managed'});
   if(b.p_action==='installation_started'){if(dispatched)return Response.json({code:'PT409'},{status:409});dispatched=true;}
   if(b.p_action==='enable')enabled=true;
   return Response.json({enabled,request_id:request});
  }
  assert.ok(url.startsWith('https://api.supabase.com/v1/projects/'+ref));assert.equal(headers.get('Authorization'),'Bearer management-private');
  if(url.endsWith('/api-keys?reveal=true'))return Response.json([{name:'anon',type:'legacy',api_key:anon},{name:'service_role',api_key:'never-forward'}]);
  if(url.endsWith('/database/query')){
   const q=JSON.parse(init.body).query;
   if(q.includes('select version,name,statements'))return Response.json(opt.history||history);
   if(q.includes('select public.support_ticket_installation_context'))return Response.json([{context:{source_id:source,client_binding:context.client_binding,platform_client_id:42,ready:true,installation_version:2}}]);
   if(q.startsWith('select public.bridge_runtime_preflight'))return Response.json([{owner_account:opt.owner||'active',onboarding_completed_at:'2026-10-01',suspended:false,platform_client_id:42,source_id:source,client_binding:context.client_binding}]);
   assert.ok(q.startsWith('begin;'));return Response.json([]);
  }
  if(url.includes('/functions/deploy')){assert.ok(init.body instanceof FormData);assert.equal(JSON.parse(init.body.get('metadata')).verify_jwt,true);if(opt.deployFailure)throw Error('provider unknown');return Response.json({});}
  if(url.endsWith('/secrets')){writes++;const b=JSON.parse(init.body);installed=b.find(s=>s.name==='PLATFORM_SUPPORT_TICKETS_SECRET').value;if(opt.uncertainWrite)throw Error('response lost after write');return new Response(null,{status:201});}
  return Response.json({id:ref});
 };
 local=ticketHandler(k=>({SUPABASE_URL:shop,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:'shop-private',PLATFORM_SUPPORT_TICKETS_SECRET:installed,PLATFORM_SUPPORT_TICKETS_ENDPOINT:platform+'/functions/v1/platform-support-tickets'})[k],fetcher);
 return {run:()=>reconcileManagedSupport(admin,caller,actor,42,platform,'Bearer transient-master',k=>env[k],fetcher),events,writes:()=>writes};
}
test('registry validates accepted and staged fingerprints; pins select saved package and reject unavailable hashes',async()=>{
 for(const r of Object.values(releases))await validateRelease(r);
 const admin={rpc:async()=>({data:{release_id:'accepted-v1',sha256:releases['accepted-v1'].sha256}})};
 assert.equal(await pinManagedRelease(admin,request),releases['accepted-v1']);
 await assert.rejects(()=>pinManagedRelease({rpc:async()=>({data:{release_id:'support-v2',sha256:'a'.repeat(64)}})},request),/Pinned release unavailable/);
});
test('automatic enrollment stays local before explicit promotion and waits for prerequisites or existing enabled credentials',async()=>{
 for(const opt of [{},{ready:false},{enabled:true},{context:{state:'revoked'}}]){const f=await fixture(opt);const result=await f.run();assert.ok(['waiting','enabled','revoked'].includes(result.state));assert.ok(!f.events.some(e=>e.url));}
});
test('Master authority, exact contiguous source history and live owner are checked before secret writes',async()=>promoted(async()=>{
 const manager=await fixture({role:'portfolio_manager'});await assert.rejects(manager.run,/Master/);assert.ok(!manager.events.length);
 for(const opt of [{history:history.slice(1)},{history:history.map((r,i)=>i===0?{...r,statements:['different SQL']}:r)},{owner:'unconfirmed'},{deployFailure:true}]){const f=await fixture(opt);assert.equal((await f.run()).state,'attention');assert.equal(f.writes(),0);}
}));
test('actual managed orchestration deploys additive Support, prepares disabled, installs, proves nonce and enables',async()=>promoted(async()=>{
 const f=await fixture();assert.equal((await f.run()).state,'enabled');assert.equal(f.writes(),1);
 assert.deepEqual(f.events.filter(e=>e.credential).map(e=>e.credential),['prepare','material','material','installation_started','installation_acknowledged','material','enable']);
 assert.ok(f.events.every(e=>!JSON.stringify(e).includes('management-private')&&!JSON.stringify(e).includes('transient-master')));
}));
test('lost Management response recovers the same installed key by proof without a second write',async()=>promoted(async()=>{
 const f=await fixture({uncertainWrite:true});assert.equal((await f.run()).state,'attention');assert.equal(f.writes(),1);assert.equal((await f.run()).state,'enabled');assert.equal(f.writes(),1);
}));
test('history rejects gaps and source conflicts while accepting exact approved base',async()=>{
 assert.equal((await approvedSupportHistory(history,release)).length,2);await assert.rejects(()=>approvedSupportHistory([...history,{version:'unknown'}],release));
});
test('BYO UI uses the current SDK session, exact file identity and original UUID; never accepts another client file',async()=>{
 const handoff={client_id:42,project_ref:ref,source_id:source,client_binding:'orbito-client-42',request_id:request,secret_sha256:'d'.repeat(64)},calls=[];
 const form={elements:{enrollment:{files:[{size:1024,text:async()=>JSON.stringify(handoff)}]},shop_public_api_key:{value:'public-anon'}}};
 const client={id:42,pairing_mode:'byo',supabase_url:shop},sdk={functions:{invoke:async(_name,{body})=>{calls.push(body);return {data:{enabled:body.action==='verify'}}}}};
 await submitByoSupport(form,client,sdk,()=>true);assert.deepEqual(calls.map(c=>c.action),['prepare','verify']);assert.ok(calls.every(c=>c.request_id===request));
 await assert.rejects(()=>submitByoSupport(form,{...client,id:43},sdk,()=>true),/does not match/);assert.equal(calls.length,2);
});
