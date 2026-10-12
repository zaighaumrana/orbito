// Execute CURRENT server source. Auth/REST/SMTP doubles are not hosted proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
export const master='94000000-0000-4000-8000-000000000001',target='94000000-0000-4000-8000-000000000002',rowId='94000000-0000-4000-8000-000000000003',requestId='94000000-0000-4000-8000-000000000004';
export function fixture(options={}) {
 const calls=[],audit=[],archives=[],ops=new Map();
 const rows=structuredClone(options.rows || [{id:rowId,auth_user_id:target,email:'team@example.test',name:'Team',role:'portfolio_manager',status:options.status || 'Active',suspended_from:'Active'}]);
 const user=options.user===null?null:options.user || {id:master,email:'master@example.test',email_confirmed_at:'2026-10-09'};
 const authUsers=structuredClone(options.authUsers || [{id:target,email:'team@example.test'},{id:master,email:'master@example.test'}]);
 const caller={auth:{getUser:async()=>({data:{user},error:options.invalid?{}:null}),signInWithPassword:async values=>{calls.push(['password-check',values.email]);return options.passwordError?{error:{}}:{data:{user:options.verifierUser || user,session:{}}};},signOut:async()=>{calls.push(['cleanup']);return {error:options.cleanupError?{}:null};}},rpc:async(name)=>{
  calls.push([name==='platform_operator_identity'?'identity':'context']);
  if(name==='platform_operator_identity') {const result=options.identityRpc?options.identityRpc():{data:options.identity || {auth_user_id:user?.id,role:options.role || 'master_admin',session_id:master},error:options.identityError?{}:null};if(result.data)result.data={session_id:master,password_verification_safe:options.continuityApproved!==false,...result.data};return result;}
  return {data:options.context || {kind:'pending',auth_user_id:user?.id,email:user?.email,session_id:master}};
 }};
 const admin={auth:{admin:{
  getUserById:async id=>({data:{user:authUsers.find(u=>u.id===id)},error:options.lookupError?{status:500}:authUsers.some(u=>u.id===id)?null:{status:404}}),
  inviteUserByEmail:async(value,settings)=>{calls.push(['invite',value,settings]);return options.inviteError?{error:{}}:{data:{user:{id:target,email:value}}};},
  updateUserById:async(id,values)=>{calls.push(['auth-update',id,values]);if(!options.authError)Object.assign(authUsers.find(u=>u.id===id),values);return {data:{user:{id}},error:options.authError?{}:null};},
  deleteUser:async id=>{calls.push(['auth-delete',id]);if(!options.authError)authUsers.splice(authUsers.findIndex(u=>u.id===id),1);return {error:options.authError?{}:null};},
 }},from:()=>{let value;const q={select(){return q;},eq(k,v){value=v;return q;},limit(){return Promise.resolve({data:rows.filter(r=>r.id===value)});}};return q;},rpc:async(name,args)=>{
  calls.push(['rpc',name,args.p_action || args.p_step]);
  if((options.commandError && [args.p_action,name].includes(options.commandError)) || (options.passwordStepError && options.passwordStepError===args.p_step))return {error:{message:'PRIVATE PROVIDER DETAIL'}};
  if(name==='platform_team_password_step')return {data:{success:true,stage:options.saved?'password_saved':args.p_step==='saved'?'password_saved':'password_setting'}};
  if(name==='platform_accept_invite')return options.acceptError?{error:{}}:{data:{success:true,stage:'completed'}};
  const row=rows.find(r=>r.id===args.p_target);let op=ops.get(args.p_request),fresh=!op;
  if(!op){op={request_id:args.p_request,action:args.p_action.replace(/^begin_/,''),stage:options.existingStage || 'reserved',new_operation:options.existingStage?false:true};ops.set(args.p_request,op);}
  else op.new_operation=false;
  if(args.p_action==='deactivate')row.status='Inactive';
  if(args.p_action==='finish_deactivate')op.stage='completed';
  if(args.p_action==='finish_reactivate'){row.status=row.suspended_from;op.stage='completed';}
  if(args.p_action==='dispatch_provider')op.stage='provider_dispatched';
  if(args.p_action==='begin_delete')row.status='Inactive';
  if(args.p_action==='dispatch_delete')op.stage='auth_delete_dispatched';
  if(args.p_action==='mark_review')op.stage='review_required';
  if(['finish_delete','reconcile_delete'].includes(args.p_action)){
   if(authUsers.some(u=>u.id===row?.auth_user_id))return {error:{}};
   if(row){archives.push(row);rows.splice(rows.indexOf(row),1);}op.stage='completed';
  }
  if(['finish_create','finish_edit'].includes(args.p_action))op.stage='completed';
  audit.push({actor_id:args.p_actor,operation_id:args.p_request,target_id:args.p_target,action:args.p_action});
  return {data:{...op,new_operation:fresh&&!options.existingStage}};
 }};
 const secrets={SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',PLATFORM_TEAM_SITE_URL:options.site || 'https://platform.example.test'};
 const ctx={URL,URLSearchParams,Request,Response,TextEncoder,atob,crypto:webcrypto,Date,createClient(){throw Error('Inject factory');},Deno:{env:{get:key=>secrets[key]}},fetch(){throw Error('No real network permitted');}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/platform-team-v2.ts').replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'}),ctx);
 const factory=(_url,key)=>{calls.push(['client',key]);return key==='fixture-anon'?caller:admin;};
 const transport=async(url,settings)=>{
  calls.push(['http',url]);
  if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:user.id}),{status:options.saveError?422:200});
  throw Error('Unexpected network target');
 };
 const invoke=async(action,body,headers={Authorization:'Bearer fixture-session'},method='POST')=>{
  let request=body;
  if(typeof body==='object'&&!options.raw){request={request_id:requestId,...(action==='delete'?{password:'FixturePassword1!',captchaToken:'fixture-captcha',acknowledged:true}:{}),...body};}
  const handler=action==='password'?ctx.passwordHandler(factory,transport):ctx.teamV2Handler(action,factory,transport);
  const result=await handler(new Request('https://local.invalid/functions/v1/'+action,{method,headers,...(method==='POST'?{body:typeof request==='string'?request:JSON.stringify(request)}:{})}));
  return {status:result.status,body:result.status===204?null:await result.json(),headers:result.headers};
 };
 return {invoke,calls,audit,rows,archives};
}
const createBody={name:'New Team',email:'new@example.test',role:'billing_person'};
const privileged=f=>f.calls.filter(c=>c[0]==='client'&&c[1]==='fixture-service');
test('unapproved session continuity blocks deletion before password grant and privileged client',async()=>{const f=fixture({continuityApproved:false});assert.equal((await f.invoke('delete',{id:rowId})).status,503);assert.deepEqual(privileged(f),[]);assert.ok(!f.calls.some(c=>c[0]==='password-check'));assert.deepEqual(f.audit,[]);});
for(const role of ['portfolio_manager','billing_person','ordinary','master_admin-forged'])for(const action of ['create','update','delete','deactivate','reactivate'])test(role+' denied '+action+' before privileged client',async()=>{const f=fixture({role});assert.equal((await f.invoke(action,action==='create'?createBody:{id:rowId,name:'Edited'})).status,403);assert.deepEqual(privileged(f),[]);assert.deepEqual(f.audit,[]);});
for(const options of [{user:null},{invalid:true},{user:{id:master,email:'master@example.test'}},{user:{id:master,email:'master@example.test',email_confirmed_at:'2026-10-09',deleted_at:'2026-10-10'}},{user:{id:master,email:'master@example.test',email_confirmed_at:'2026-10-09',banned_until:'2099-01-01'}},{identityError:true},{identity:{auth_user_id:target,role:'master_admin'}}])test('invalid or unconfirmed actor '+JSON.stringify(options),async()=>{const f=fixture(options);assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.deepEqual(privileged(f),[]);});
for(const options of [{passwordError:true},{cleanupError:true},{verifierUser:{id:target,email:'team@example.test',email_confirmed_at:'2026-10-09'}}])test('deletion reauthentication fails closed '+JSON.stringify(options),async()=>{const f=fixture(options);assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.deepEqual(privileged(f),[]);assert.deepEqual(f.audit,[]);});
test('missing password CAPTCHA acknowledgment and reusable flags denied',async()=>{for(const body of [{id:rowId,request_id:requestId},{id:rowId,request_id:requestId,password:'Fixture1!',acknowledged:true},{id:rowId,request_id:requestId,approved:true}]){const f=fixture({raw:true});assert.ok((await f.invoke('delete',body)).status>=400);assert.deepEqual(f.audit,[]);}});
test('confirmed master rechecked after password verification; browser session never replaced',async()=>{let n=0;const f=fixture({identityRpc:()=>++n===1?{data:{auth_user_id:master,role:'master_admin'}}:{error:{}}});assert.equal((await f.invoke('delete',{id:rowId})).status,403);assert.deepEqual(privileged(f),[]);assert.equal(f.calls.filter(c=>c[0]==='cleanup').length,1);});
test('missing drifted or self-target Auth identities denied before command',async()=>{for(const options of [{authUsers:[]},{lookupError:true},{authUsers:[{id:target,email:'other@example.test'}]},{rows:[{id:rowId,auth_user_id:master,role:'billing_person',email:'master@example.test'}]}]){const f=fixture(options);assert.ok((await f.invoke('reactivate',{id:rowId})).status>=400);assert.deepEqual(f.audit,[]);}});
test('database ownership denial prevents clearing independent provider ban',async()=>{const f=fixture({status:'Inactive',authUsers:[{id:target,email:'team@example.test',banned_until:'2099-01-01'}],commandError:'dispatch_provider'});assert.equal((await f.invoke('reactivate',{id:rowId})).status,409);assert.ok(!f.calls.some(c=>c[0]==='auth-update'));});
test('deletion revokes first, dispatches once, archives only after absence',async()=>{const f=fixture();assert.equal((await f.invoke('delete',{id:rowId})).status,200);assert.equal(f.rows.length,0);assert.equal(f.archives.length,1);assert.ok(f.calls.findIndex(c=>c[0]==='rpc'&&c[2]==='begin_delete')<f.calls.findIndex(c=>c[0]==='auth-delete'));assert.ok(!JSON.stringify(f.audit).includes('FixturePassword1!'));});
test('uncertain Auth deletion does not archive or repeat deletion',async()=>{const f=fixture({authError:true});assert.equal((await f.invoke('delete',{id:rowId})).status,503);assert.equal(f.rows[0].status,'Inactive');assert.equal(f.archives.length,0);const retry=fixture({existingStage:'auth_delete_dispatched'});assert.ok((await retry.invoke('delete',{id:rowId})).status>=400);assert.ok(!retry.calls.some(c=>c[0]==='auth-delete'));});
test('required durable start failure prevents provider mutations',async()=>{const f=fixture({commandError:'begin_delete'});assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.ok(!f.calls.some(c=>c[0]==='auth-delete'));});
test('password setup verifies provider write before checked activation',async()=>{const f=fixture();assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,200);assert.ok(f.calls.findIndex(c=>c[0]==='http')<f.calls.findIndex(c=>c[1]==='platform_accept_invite'));for(const option of [{saveError:true},{acceptError:true},{passwordStepError:'begin'}]){const denied=fixture(option);const r=await denied.invoke('password',{password:'FixturePassword1!'});assert.ok(r.status>=400);if(option.saveError)assert.ok(!denied.calls.some(c=>c[1]==='platform_accept_invite'));}});
test('saved-password retry resumes activation without repeating provider update',async()=>{const f=fixture({saved:true});assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,200);assert.ok(!f.calls.some(c=>c[0]==='http'));});
test('method CORS malformed data and forged role denied',async()=>{for(const [body,headers] of [['{',{}],[{...createBody,role:'master_admin'},{}],[createBody,{Origin:'https://evil.example.test'}]]){const f=fixture();assert.ok((await f.invoke('create',body,{Authorization:'Bearer fixture-session',...headers})).status>=400);assert.deepEqual(f.audit,[]);}const f=fixture();assert.equal((await f.invoke('create',{}, {},'GET')).status,405);assert.equal((await f.invoke('create',{}, {},'OPTIONS')).status,204);});
test('JWT is enabled on all privileged and setup entrypoints; unused legacy wrapper is absent',()=>{for(const name of ['create-platform-user','update-platform-user','delete-platform-user','deactivate-platform-user','reactivate-platform-user','platform-password-setup'])assert.match(read('supabase/config.toml'),new RegExp('\\[functions\\.'+name+'\\]\\s*verify_jwt = true'));assert.equal(existsSync(new URL('../supabase/functions/_shared/platform-team.ts',import.meta.url)),false);});
test('confirmed master creates invitation and edits through durable server commands',async()=>{
 const invite=fixture();assert.equal((await invite.invoke('create',createBody)).status,200);
 const sent=invite.calls.find(c=>c[0]==='invite');assert.equal(sent[1],'new@example.test');assert.equal(sent[2].redirectTo,'https://platform.example.test/?reset=true');
 assert.ok(invite.calls.some(c=>c[2]==='finish_create'));
 const edit=fixture();assert.equal((await edit.invoke('update',{id:rowId,name:'Edited',role:'billing_person'})).status,200);
 assert.ok(edit.calls.some(c=>c[2]==='finish_edit'));assert.ok(!edit.calls.some(c=>c[0]==='password-check'));
});

test('deactivation bans retained identity after durable revocation; Reactivate restores without email',async()=>{
 const off=fixture();assert.equal((await off.invoke('deactivate',{id:rowId})).status,200);assert.equal(off.rows[0].status,'Inactive');
 assert.ok(off.calls.findIndex(c=>c[2]==='deactivate')<off.calls.findIndex(c=>c[0]==='auth-update'));
 assert.equal(off.calls.find(c=>c[0]==='auth-update')[2].ban_duration,'876000h');
 const on=fixture({status:'Inactive'});assert.equal((await on.invoke('reactivate',{id:rowId})).status,200);assert.equal(on.rows[0].status,'Active');
 assert.equal(on.calls.find(c=>c[0]==='auth-update')[2].ban_duration,'none');
 for(const f of [off,on])assert.ok(!f.calls.some(c=>['generate','invite','http','auth-delete'].includes(c[0])));
});
test('provider suspension failure remains revoked and review required; duplicate dispatch never repeats',async()=>{
 const f=fixture({authError:true});assert.equal((await f.invoke('deactivate',{id:rowId})).status,503);assert.equal(f.rows[0].status,'Inactive');assert.ok(f.calls.some(c=>c[2]==='mark_review'));
 const duplicate=fixture({status:'Inactive',existingStage:'provider_dispatched'});assert.equal((await duplicate.invoke('reactivate',{id:rowId})).status,409);assert.ok(!duplicate.calls.some(c=>c[0]==='auth-update'||c[2]==='mark_review'));
});
test('Inactive and archived password setup are denied before provider/password commands',async()=>{
 for(const kind of ['inactive','archived']){const f=fixture({context:{kind,auth_user_id:master,session_id:master}});assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,403);assert.ok(!f.calls.some(c=>c[0]==='http'||c[1]==='platform_team_password_step'));}
});
test('native OTP/recovery AMR eligible; ordinary password session cannot bypass current-password flow',async()=>{
 for(const method of ['otp','recovery','password']){const f=fixture({context:{kind:'active',auth_user_id:master,session_id:master}});const token='synthetic.'+Buffer.from(JSON.stringify({amr:[{method}]})).toString('base64url')+'.synthetic';const r=await f.invoke('password',{password:'FixturePassword1!'},{Authorization:'Bearer '+token});assert.equal(r.status,method==='password'?403:200);assert.equal(f.calls.some(c=>c[0]==='http'),method!=='password');assert.ok(!f.calls.some(c=>c[1]==='platform_accept_invite'));}
});
test('rejected email transport has no runtime or config references',()=>{
 for(const path of ['supabase/functions/_shared/platform-team-v2.ts','supabase/config.toml','src/events.js'])assert.doesNotMatch(read(path),/Resend|resend\.com|PLATFORM_AUTH_(HOOK|EMAIL_GUARD|RESEND)|platform-auth-email|platform-password-recovery|proof_digest/);
});
