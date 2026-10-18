// Execute both actual handlers with bounded, explicit HTTP doubles. No hosted I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ticketHandler as central} from '../supabase/functions/platform-support-tickets/handler.ts';
import {enrollmentHandler} from '../supabase/functions/platform-support-enrollment/handler.ts';
import {ticketHandler as shop} from '../../Orbitoshopv2-v1/supabase/functions/support-tickets/handler.ts';
import {sha,proof,fields,CONTRACT} from '../supabase/functions/platform-support-tickets/protocol.ts';
const platform='https://ukbhyerxshteyetwomqy.supabase.co',local='https://abcdefghijklmnopqrst.supabase.co';
const uid='97000000-0000-4000-8000-000000000001',sid='97000000-0000-4000-8000-000000000002',source='98000000-0000-4000-8000-000000000001',request='99000000-0000-4000-8000-000000000001';
const secret='f'.repeat(64),ticket='99000000-0000-4000-8000-000000000010';
const jwt=claims=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid,exp:Math.floor(Date.now()/1000)+1800,iss:local+'/auth/v1',aud:'authenticated',...claims})).toString('base64url')+'.fixture-signature';
const token=jwt({}),body={action:'create',request_id:request,subject:' Scanner ',category:'technical',message:'Disconnects <script>plain text</script>'};
const context={auth_user_id:uid,session_id:sid,role:'Business Owner',source_id:source,client_binding:'client-42',platform_client_id:42};
const server=b=>({...b,contract:CONTRACT,project_ref:'abcdefghijklmnopqrst',source_id:source,client_binding:'client-42'});
function fixture(opt={}){
 const calls=[],creates=[],commands=[];
 const sourceRecord={key_id:request,source_id:source,project_ref:'abcdefghijklmnopqrst',client_binding:'client-42',client_id:42,shop_public_api_key:'public-shop-key'};
 const env={SUPABASE_URL:platform,SUPABASE_SERVICE_ROLE_KEY:'private-platform-service',SUPABASE_ANON_KEY:'platform-public',PLATFORM_MANAGEMENT_TOKEN:'management-private'};
 const shopEnv={SUPABASE_URL:local,SUPABASE_ANON_KEY:'public-shop-key',SUPABASE_SERVICE_ROLE_KEY:'private-shop-service',PLATFORM_SUPPORT_TICKETS_SECRET:secret,PLATFORM_SUPPORT_TICKETS_ENDPOINT:platform+'/functions/v1/platform-support-tickets',...opt.shopEnv};
 let c,s,e;
 const fetcher=async(url,settings)=>{
  assert.equal(settings.redirect,'error');assert.ok(settings.signal);calls.push(url);
  if(opt.network)throw Error('PRIVATE KEY: should never be returned');
  const u=new URL(url),b=settings.body?JSON.parse(settings.body):null,h=new Headers(settings.headers);
  const reply=(data,status=200)=>Response.json(data,{status});
  if(url===platform+'/functions/v1/platform-support-tickets')return c(new Request(url,settings));
  if(url===local+'/functions/v1/support-tickets'){
   if(opt.capabilityUnavailable)throw Error('uncertain installation');
   const r=await s(new Request(url,settings));
   if(opt.badProof && r.ok){const c=await r.json();return Response.json({...c,proof:'invalid'});}return r;
  }
  if(u.pathname==='/auth/v1/user'){
   const t=h.get('authorization')?.slice(7);
   return !opt.authDenied && (t===token||t===opt.validToken||t===jwt({role:'forged'}))?reply({id:uid}):reply({error:'denied'},401);
  }
  if(u.pathname.endsWith('/support_ticket_actor_context'))return opt.actorDenied?reply({code:'42501'},403):reply({...context,...opt.actor});
  if(u.pathname.endsWith('/support_ticket_capability_context'))return reply({source_id:source,client_binding:'client-42',platform_client_id:42});
  if(u.pathname.endsWith('/platform_operator_identity'))return reply({auth_user_id:uid,session_id:sid,role:opt.staffRole||'master_admin'});
  if(u.pathname.endsWith('/platform_support_ticket_source'))return opt.revoked||b.p_hash!==opt.hash&&b.p_hash!==await sha(secret)?reply({code:'42501'},403):reply(sourceRecord);
  if(u.pathname.endsWith('/platform_support_ticket_create')){creates.push(b);return reply({accepted:true,ticket_id:ticket,status:'Open'});}
  if(u.pathname.endsWith('/platform_support_ticket_read'))return reply(opt.rows||[]);
  if(u.pathname.endsWith('/platform_support_credential_command')){
   commands.push(b);if(b.p_action==='material')return reply({secret,secret_sha256:await sha(secret),project_ref:'abcdefghijklmnopqrst',source_id:source,client_binding:'client-42',client_id:42,shop_public_api_key:jwt({role:'anon',ref:'abcdefghijklmnopqrst'}),pairing_mode:'managed'});
   return reply({enabled:b.p_action==='enable',request_id:request});
  }
  if(url==='https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/secrets' && opt.installUncertain)throw Error('uncertain Management response');
  if(url==='https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/secrets')return new Response(null,{status:201,headers:{'Content-Length':'0'}});
  throw Error('Unexpected URL: '+url);
 };
 c=central(k=>env[k],fetcher);s=shop(k=>shopEnv[k],fetcher);e=enrollmentHandler(k=>env[k],fetcher);
 const invoke=async(which,b,headers={})=>{const r=await ({central:c,shop:s,enrollment:e}[which])(new Request(local,{method:'POST',headers:{Authorization:'Bearer '+(which==='central'?secret:token),'Content-Type':'application/json',...(which==='central'?{'X-Shop-User-Authorization':'Bearer '+token}:{}),...headers},body:typeof b==='string'?b:JSON.stringify(b)}));return {status:r.status,body:await r.json()};};
 return {invoke,calls,creates,commands};
}
test('Shop → Platform independently verifies actual requester twice and forwards only server-derived identity',async()=>{
 const f=fixture();const result=await f.invoke('shop',body);assert.equal(result.status,202);assert.equal(result.body.ticket_id,ticket);
 assert.equal(f.calls.filter(u=>u.endsWith('/auth/v1/user')).length,2);assert.equal(f.calls.filter(u=>u.endsWith('/support_ticket_actor_context')).length,2);
 assert.equal(f.creates[0].p_actor.auth_user_id,uid);assert.equal(f.creates[0].p_fields.subject,'Scanner');assert.equal(Object.hasOwn(f.creates[0].p_fields,'client_id'),false);
});
test('credential alone, forged/expired/foreign requester, wrong source/binding/project and revoked credential fail closed',async()=>{
 for(const headers of [{'X-Shop-User-Authorization':''},{'X-Shop-User-Authorization':'Bearer forged'},{'X-Shop-User-Authorization':'Bearer '+jwt({exp:1})},{'X-Shop-User-Authorization':'Bearer '+jwt({sub:request})},{Authorization:'Bearer bridge-source-secret'}]){
  const f=fixture();assert.ok((await f.invoke('central',server(body),headers)).status>=400);assert.equal(f.creates.length,0);
 }
 for(const override of [{project_ref:'bcdefghijklmnopqrstu'},{source_id:request},{client_binding:'wrong'}]){const f=fixture();assert.equal((await f.invoke('central',{...server(body),...override})).status,403);assert.equal(f.creates.length,0);}
 const f=fixture({revoked:true});assert.equal((await f.invoke('shop',body)).status,401);assert.equal(f.creates.length,0);
});
test('canonical actor denials and independent identity disagreement override forged role claims',async()=>{
 for(const opt of [{actorDenied:true},{actor:{role:'Cashier'}},{actor:{role:'Technician'}},{actor:{role:'Orbito Support'}},{actor:{auth_user_id:request}},{actor:{session_id:request}},{actor:{platform_client_id:43}},{actor:{source_id:request}}]){
  const f=fixture(opt);assert.equal((await f.invoke('shop',body)).status,403);assert.equal(f.creates.length,0);
 }
 const f=fixture({actor:{role:'Manager',employee_id:1}});assert.equal((await f.invoke('shop',body)).status,202);
});
test('strict streamed body and action schemas reject unknown fields, overposting, arrays, malformed and oversized input before network',async()=>{
 for(const b of [{...body,client_id:43},{...body,actor:{role:'Business Owner'}},{...body,url:'https://evil.invalid'},{...body,price:0},{...body,message:'x'.repeat(4001)},{...body,subject:''},{action:'list',offset:-1},{action:'list',offset:5001},{action:'get',ticket_id:'1'},[],null,'{bad',' '.repeat(16385)]){
  const f=fixture();const r=await f.invoke('shop',b);assert.ok([400,413].includes(r.status));assert.equal(f.calls.length,0);
 }
 assert.equal(fields({...body,subject:' x '}).subject,'x');
});
test('verification outage is generic and contains no privileged details; arbitrary configured destinations fail closed',async()=>{
 const f=fixture({network:true}),r=await f.invoke('shop',body);assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE|service|management-private|f{64}/);
 for(const endpoint of ['http://localhost/internal','https://evil.invalid/functions/v1/platform-support-tickets',local+'/functions/v1/platform-support-tickets']){
  const f=fixture({shopEnv:{PLATFORM_SUPPORT_TICKETS_ENDPOINT:endpoint}});assert.equal((await f.invoke('shop',body)).status,503);assert.equal(f.calls.length,0);
 }
});
test('customer projections exclude private upstream fields and foreign/absent ticket is generic 404',async()=>{
 const f=fixture({rows:[{ticket_id:ticket,subject:'Safe',status:'Resolved',resolution:'Fixed',staff_email:'private',client_binding:'private',service_role:'private'}]});
 const r=await f.invoke('shop',{action:'get',ticket_id:ticket});assert.equal(r.body.ticket.resolution,'Fixed');assert.doesNotMatch(JSON.stringify(r.body),/private|staff_email|client_binding|service_role/);
 assert.equal((await fixture().invoke('shop',{action:'get',ticket_id:ticket})).status,404);
});
test('managed installation stays disabled until the exact installed key, pairing, endpoint and capability prove readiness',async()=>{
 const b={action:'install',client_id:42,request_id:request},f=fixture();const installed=await f.invoke('enrollment',b);assert.equal(installed.status,200);assert.equal(installed.body.enabled,false);
 const verified=await f.invoke('enrollment',{...b,action:'verify'});assert.equal(verified.status,200);assert.equal(verified.body.enabled,true);
 assert.equal(f.commands.filter(c=>c.p_action==='enable').length,1);assert.doesNotMatch(JSON.stringify(installed.body)+JSON.stringify(verified.body),/f{64}|private-platform|management/);
 const denied=fixture({staffRole:'portfolio_manager'});assert.equal((await denied.invoke('enrollment',b)).status,403);assert.equal(denied.commands.length,0);
 const wrong=fixture({shopEnv:{PLATFORM_SUPPORT_TICKETS_SECRET:'e'.repeat(64)}});assert.equal((await wrong.invoke('enrollment',{...b,action:'verify'})).status,503);assert.equal(wrong.commands.some(c=>c.p_action==='enable'),false);
});
test('shared protocol bytes match across repositories and browser source has no server key references',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');assert.equal(read('../supabase/functions/platform-support-tickets/protocol.ts'),read('../../Orbitoshopv2-v1/supabase/functions/support-tickets/protocol.ts'));
 for(const p of ['../../Orbitoshopv2-v1/src/platform/support.js','../../Orbitoshopv2-v1/src/admin/pages/support.js'])assert.doesNotMatch(read(p),/SERVICE_ROLE|PLATFORM_SUPPORT_TICKETS_SECRET|PLATFORM_MANAGEMENT_TOKEN/);
});

// These are provider-transport doubles; the native Auth test separately issues
// a real two-hour GoTrue token. Claims are never treated as authentication.
test('verified longer JWTs work; issuer/audience/expiry/user/session/provider failures remain denied',async()=>{
 const longer=jwt({exp:Math.floor(Date.now()/1000)+7200});
 const f=fixture({validToken:longer});assert.equal((await f.invoke('shop',body,{Authorization:'Bearer '+longer})).status,202);
 assert.equal(f.calls.filter(u=>u.endsWith('/auth/v1/user')).length,2);
 for(const claim of [{iss:platform+'/auth/v1'},{iss:'https://evil.invalid'},{aud:'service_role'},{exp:1},{exp:'future'},{sub:request},{session_id:request}]){
  const t=jwt(claim),f=fixture({validToken:t});assert.ok((await f.invoke('shop',body,{Authorization:'Bearer '+t})).status>=400);assert.equal(f.creates.length,0);
 }
 for(const t of ['x.'+Buffer.from('null').toString('base64url')+'.x','x.bad.x'])assert.equal((await fixture().invoke('shop',body,{Authorization:'Bearer '+t})).status,401);
 const denied=fixture({validToken:longer,authDenied:true});assert.equal((await denied.invoke('shop',body,{Authorization:'Bearer '+longer})).status,401);assert.equal(denied.creates.length,0);
 const revoked=fixture({validToken:longer,actorDenied:true});assert.equal((await revoked.invoke('shop',body,{Authorization:'Bearer '+longer})).status,403);assert.equal(revoked.creates.length,0);
});
test('uncertain installation and invalid capability never enable; replay verifies the same enrollment',async()=>{
 const b={client_id:42,request_id:request};
 const uncertain=fixture({installUncertain:true});assert.equal((await uncertain.invoke('enrollment',{...b,action:'install'})).status,503);
 assert.ok(uncertain.commands.some(c=>c.p_action==='installation_started'));assert.ok(!uncertain.commands.some(c=>['installation_acknowledged','enable'].includes(c.p_action)));
 for(const opt of [{capabilityUnavailable:true},{badProof:true},{shopEnv:{PLATFORM_SUPPORT_TICKETS_ENDPOINT:'https://bcdefghijklmnopqrstu.supabase.co/functions/v1/platform-support-tickets'}}]){
  const f=fixture(opt);assert.equal((await f.invoke('enrollment',{...b,action:'verify'})).status,503);assert.ok(!f.commands.some(c=>c.p_action==='enable'));
 }
 const f=fixture();for(let i=0;i<2;i++)assert.equal((await f.invoke('enrollment',{...b,action:'verify'})).status,200);
 assert.ok(f.commands.every(c=>c.p_request===request));
});
