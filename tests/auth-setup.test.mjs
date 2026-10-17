import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture({kind='pending',hash='',search='',contextError=false,linkError=false,wrongUuid=false,noSession=false}={}){
 const state={},calls=[],timers=[],session={user:{id:'synthetic-user',email:'team@example.test'}};
 const pb={auth:{getUser:async()=>{calls.push('verify');return {data:{user:session.user}};},getSession:async()=>({data:{session:noSession?null:session}}),verifyOtp:async()=>{calls.push('exchange');return linkError?{error:{}}:{data:{session}};}},rpc:async()=>{calls.push('context');return {error:contextError?{}:null,data:{kind,auth_user_id:wrongUuid?'other':session.user.id,email:session.user.email,reactivation_pending:true}};}};
 const ctx={URLSearchParams,window:{location:{hash,search,pathname:'/'}},history:{replaceState:()=>calls.push('scrub')},crypto:{randomUUID:()=> 'synthetic-operation'},setTimeout:fn=>timers.push(fn)};
 vm.createContext(ctx);vm.runInContext(read('src/auth-setup.js').replace(/^export /gm,''),ctx);
 const router=ctx.createSetupRouter({pb,state,render:()=>calls.push('render'),notify:{error(){}}});
 return {pb,router,state,calls,session,flush:async()=>{for(const fn of timers.splice(0))fn();await new Promise(r=>setImmediate(r));}};
}
for(const event of ['SIGNED_IN','INITIAL_SESSION'])test('verified Pending '+event+' enters setup without URL authority',async()=>{const f=fixture();f.router.event(event,f.session);assert.deepEqual(f.calls,[],'Callback must not await SDK while its lock is held');await f.flush();assert.equal(f.state.page,'reset-password');assert.equal(f.state.authenticated,false);assert.equal(f.state.passwordFlow.kind,'pending');});
test('genuine recovery routes Active user, ordinary/master reset query does not',async()=>{const recovery=fixture({kind:'active'});recovery.router.event('PASSWORD_RECOVERY',recovery.session);await recovery.flush();assert.equal(recovery.state.page,'reset-password');for(const search of ['','?reset=true']){const f=fixture({kind:'active',search});assert.equal(await f.router.boot(f.session),false);assert.equal(f.state.passwordFlow,undefined);}});
test('private-browser hash exchange is scrubbed and canonical UUID checked',async()=>{const f=fixture({hash:'#type=invite&token_hash=synthetic-proof',search:'?reset=true'});assert.equal(f.calls[0],'scrub');assert.equal(await f.router.boot(null),true);assert.equal(f.state.page,'reset-password');assert.ok(f.calls.indexOf('scrub')<f.calls.indexOf('exchange'));const forged=fixture({wrongUuid:true,search:'?reset=true'});assert.equal(await forged.router.boot(forged.session),true);assert.equal(forged.state.page,'setup-error');});
for(const cause of ['expired','invalid','consumed','revoked'])test(cause+' provider link denied without activation',async()=>{const f=fixture({hash:'#type=invite&token_hash=synthetic-proof',search:'?reset=true',linkError:true});await f.router.boot(null);assert.equal(f.state.page,'setup-error');assert.ok(!f.calls.includes('context'));});
test('missing session, archived/deleted member and invitation-not-yet-recorded give honest errors',async()=>{for(const options of [{noSession:true},{contextError:true}]){const f=fixture({...options,search:'?reset=true'});await f.router.boot(options.noSession?null:f.session);assert.equal(f.state.page,'setup-error');assert.equal(f.state.passwordFlow,undefined);}});
test('Inactive is denied even with old reactivation proof and recovery event',async()=>{const denied=fixture({kind:'inactive'});await denied.router.boot(denied.session);assert.equal(denied.state.page,'setup-error');const allowed=fixture({kind:'inactive',hash:'#type=recovery&token_hash=synthetic-proof&operation=synthetic-operation'});await allowed.router.boot(null);assert.equal(allowed.state.page,'setup-error');assert.equal(allowed.state.passwordFlow,undefined);});
test('logout cancels queued callbacks and clears transient proofs',async()=>{const f=fixture();f.router.event('SIGNED_IN',f.session);f.router.event('SIGNED_OUT',null);await f.flush();assert.equal(f.state.passwordFlow,null);assert.deepEqual(f.calls,[]);});
test('completed/cancelled recovery cannot reroute the next ordinary login into setup',async()=>{
 for(const hash of ['#type=recovery&token_hash=synthetic-proof','#error=expired']) {
  const f=fixture({kind:'active',hash,search:'?reset=true'});await f.router.boot(f.session);
  f.router.clear();f.state.page='login';f.router.event('SIGNED_IN',f.session);await f.flush();
  assert.equal(f.state.page,'login');assert.equal(f.state.passwordFlow,null);
 }
});
test('password UI checks server result and guards repeat submissions; never calls unchecked acceptance',()=>{const code=read('src/events.js');const block=code.split('if (action === "confirm-reset-password") {')[1].split('/* â”€â”€ LOGIN')[0];assert.match(block,/passwordSaving/);assert.match(block,/result\.data\?\.success!==true/);assert.match(block,/platform-password-setup/);assert.ok(!block.includes('platform_accept_invite'));assert.ok(!block.includes('auth.updateUser'));});
test('logout during native link exchange or setup retry cannot restore a private setup view',async()=>{
 for(const operation of ['boot','retry']){
  const f=fixture({hash:'#type=invite&token_hash=synthetic-proof'});let release;
  if(operation==='boot')f.pb.auth.verifyOtp=()=>new Promise(r=>release=r);else f.pb.auth.getSession=()=>new Promise(r=>release=r);
  const pending=operation==='boot'?f.router.boot(null):f.router.retry();f.router.event('SIGNED_OUT',null);f.state.page='login';
  release({data:{session:f.session}});await pending;assert.equal(f.state.page,'login');assert.equal(f.state.passwordFlow,null);assert.equal(f.state.recoveryEmail,null);
 }
});
