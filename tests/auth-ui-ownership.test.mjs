// Actual delegated handlers, SDK callback and canonical revocation, with controlled
// transport timing only. No hosted Auth, email, credential or client mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const baseline=process.env.ORBITO_UI_REVIEW_BASELINE;
assert.ok(!baseline || baseline==='65429db','Only the pinned reviewed baseline is accepted');
const read=p=>baseline?execFileSync('git',['show','65429dba0e19aea6467f1347222e044f5e7549bc:'+p],{encoding:'utf8'}):readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture({boot=Promise.resolve({data:{session:null}})}={}){
 const listeners=new Map(),loads=[],reads=[],messages=[],nodes=new Map();let authChange,signins=0,signouts=0,session=null,denied=false,signInGate;
 for(const id of ['platform-username','platform-pin','platform-pin-error'])nodes.set(id,{value:id==='platform-username'?'master@example.test':'SyntheticPassword1!',textContent:'',classList:{add(){},remove(){}}});
 const ctx={console,URLSearchParams,navigator:{onLine:true},localStorage:{getItem(){},setItem(){},removeItem(){}},crypto:{randomUUID:()=>String(++ctx.nonce)},nonce:0,
  window:{location:{pathname:'/',search:'',hash:'',origin:'https://platform.example.test'},addEventListener(){}},
  document:{addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),getElementById:id=>nodes.get(id)||null},
  setTimeout(){},setInterval(){},render(){reads.push(['render',ctx.pState.page]);},cancelDialogs(){},captchaBusy(){},resetTurnstile(){},mountTurnstile(){},
  notify:Object.fromEntries(['error','success','info'].map(k=>[k,message=>messages.push([k,message])])),PLATFORM_AUTH_EMAIL:'master@example.test',handleFormSubmit(){},
  createSetupRouter:()=>({boot:async()=>false,event(){},clear(){},retry:async()=>{}}),
  loadOperatorIdentity:async()=>({auth_user_id:'master',email:'master@example.test',username:'alias',role:'master_admin',session_id:session?.id}),
  loadConfig:()=>{const gate=deferred();loads.push(gate);return gate.promise;},loadPlatform:async()=>{reads.push(['platform']);},
  pb:{rpc:async name=>({data:name==='platform_session_status'?{authorized:!denied,auth_user_id:'master'}:{kind:'active'}}),
   functions:{invoke:async()=>({data:{}})},auth:{
    onAuthStateChange:fn=>authChange=fn,getSession:()=>boot,
    signOut:async()=>{signouts++;session=null;authChange?.('SIGNED_OUT',null);return{};},
    signInWithPassword:async()=>{signins++;if(signInGate)await signInGate.promise;session={id:'session-'+signins};authChange?.('SIGNED_IN',session);return {data:{session}};},
   }}
 };
 vm.createContext(ctx);
 for(const p of ['src/state.js','src/async-context.js','src/helpers.js','src/events.js'])vm.runInContext(strip(read(p))+(p==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 vm.runInContext(strip(read('src/main.js')),ctx);await tick();
 const click=async dataset=>{const button={dataset,disabled:false,isConnected:true,closest:selector=>selector.includes('data-auth-form')?null:button};for(const fn of listeners.get('click')||[])fn({target:button,preventDefault(){}});await tick();};
 return {ctx,loads,reads,messages,click,get signins(){return signins;},get signouts(){return signouts;},
  login:async()=>{ctx.pState.turnstileToken='synthetic-captcha';await click({pAction:'do-login'});},
  revoke:async()=>{denied=true;await ctx.validateSession(ctx.render);denied=false;},
  emitSignedOut:()=>authChange('SIGNED_OUT',null),holdSignIn:()=>signInGate=deferred(),
 };
}
const settle=async(gate,failure=false)=>{if(failure)gate.reject(Error('Synthetic rejected config'));else gate.resolve();await tick();};

test('canonical revocation during login releases its lock; late config success/failure cannot prevent a fresh login',async()=>{
 for(const failure of [false,true]){
  const f=await fixture();await f.login();assert.equal(f.loads.length,1);assert.equal(f.ctx.pState.authenticated,true);
  await f.revoke();assert.equal(f.ctx.pState.loginLoading,false,'revocation must release the login lock');
  const signouts=f.signouts;await settle(f.loads[0],failure);assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.signouts,signouts);
  await f.login();assert.equal(f.signins,2);await settle(f.loads[1]);assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.page,'overview');assert.equal(f.ctx.pState.loginLoading,false);
 }
});

test('actual SDK SIGNED_OUT cancels login before identity publication and during protected config loading',async()=>{
 for(const stage of ['sign-in','config']){
  const f=await fixture();const gate=stage==='sign-in'?f.holdSignIn():null;await f.login();f.emitSignedOut();
  assert.equal(f.ctx.pState.loginLoading,false);assert.equal(f.ctx.pState.authenticated,false);
  if(gate){gate.resolve();await tick();assert.equal(f.loads.length,0);}else await settle(f.loads[0]);
  assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.page,'login');
 }
});

test('old resolving/rejecting login cannot clear or sign out a successful successor after rapid logout/re-login',async()=>{
 for(const failure of [false,true]){
  const f=await fixture();await f.login();await f.click({pAction:'logout'});assert.equal(f.ctx.pState.loginLoading,false);
  await f.login();await settle(f.loads[1]);const user=f.ctx.pState.currentUser,signouts=f.signouts;
  await settle(f.loads[0],failure);assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.currentUser,user);assert.equal(f.ctx.pState.page,'overview');assert.equal(f.signouts,signouts);assert.equal(f.ctx.pState.loginLoading,false);
 }
});

test('obsolete login completion cannot release the busy flag owned by a pending successor',async()=>{
 for(const failure of [false,true]){
  const f=await fixture();await f.login();await f.revoke();await f.login();assert.equal(f.loads.length,2);
  const owner=f.ctx.pState.loginAttempt,signouts=f.signouts;await settle(f.loads[0],failure);
  assert.equal(f.ctx.pState.loginLoading,true);assert.equal(f.ctx.pState.loginAttempt,owner);assert.equal(f.signouts,signouts);
  await settle(f.loads[1]);assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.loginLoading,false);
 }
});

test('current login failure clears only its own authority and releases the lock; the initial local SIGNED_OUT does not cancel normal login',async()=>{
 const f=await fixture();await f.login();
 const cleanup=deferred(),signOut=f.ctx.pb.auth.signOut;
 f.ctx.pb.auth.signOut=async()=>{await cleanup.promise;return signOut();};
 await settle(f.loads[0],true);assert.equal(f.ctx.pState.loginLoading,true,'cleanup holds its own lock');
 await f.login();assert.equal(f.signins,1,'successor cannot start while the owned signout is pending');
 cleanup.resolve();await tick();
 assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.loginLoading,false);assert.equal(f.signouts,2);assert.equal(f.reads.filter(x=>x[0]==='platform').length,0);
 await f.login();await settle(f.loads[1]);assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.loginLoading,false);
});

test('late startup session success/failure cannot reset a later successful login',async()=>{
 for(const failure of [false,true]){
  const boot=deferred(),f=await fixture({boot:boot.promise});await f.login();await settle(f.loads[0]);
  if(failure)boot.reject(Error('Synthetic startup failure'));else boot.resolve({data:{session:null}});await tick();
  assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.page,'overview');assert.equal(f.messages.length,0);
 }
});

const loaded=f=>{const s=f.ctx.pState;s.authenticated=true;s.currentUser={auth_user_id:'master',session_id:'client-session',role:'master_admin'};s.page='client-detail';s.selectedClient={id:1,name:'Client'};s.clientData={clientId:1,requestGeneration:s.clientRequestGeneration,config:{id:1},operations:{client:1}};};
test('Shop-config read completes across Edit Client open/close on success, API error or rejected transport',async()=>{
 for(const outcome of ['success','api-error','rejected'])for(const close of [false,true]){
  const f=await fixture(),gate=deferred();loaded(f);f.ctx.pb.functions.invoke=()=>gate.promise;
  await f.click({pAction:'read-shop-config'});await f.click({pModal:'edit-client'});const modal=f.ctx.pState.modal;
  if(close)await f.click({pClose:''});
  if(outcome==='rejected')gate.reject(Error('Synthetic transport failure'));else gate.resolve(outcome==='success'?{data:{config:{id:999,ems_enabled:true}}}:{error:{message:'Synthetic API failure'}});await tick();
  assert.equal(f.ctx.pState.clientData.loading,false,outcome);assert.equal(f.ctx.pState.modal,close?null:modal);
  assert.equal(f.ctx.clientDataMatches(),outcome==='success');
  if(outcome==='success')assert.equal(f.ctx.pState.clientData.config.id,1,'Shop singleton id must never replace Platform client id');else {
   assert.ok(f.ctx.pState.clientData._error);
   // Existing Refresh status delegates to the actual detail loader, not a copy.
   const source=strip(read('src/supabase.js'));
   vm.runInContext(source.slice(source.indexOf('async function loadClientData('),source.indexOf('async function updateClientConfig(')),f.ctx);
   await f.click({pAction:'refresh-operations'});assert.equal(f.ctx.clientDataMatches(),true);assert.equal(f.ctx.pState.clientData._error,undefined);
  }
 }
});

test('cancelled Shop-config reads cannot publish into another client or logged-out/revoked state; owned cancellation releases Loading',async()=>{
 for(const change of ['client','logout','revoked','role']){
  const f=await fixture(),gate=deferred();loaded(f);f.ctx.pb.functions.invoke=()=>gate.promise;await f.click({pAction:'read-shop-config'});
  if(change==='client'){f.ctx.selectClient({id:2});f.ctx.pState.clientData={clientId:2,requestGeneration:f.ctx.pState.clientRequestGeneration,config:{id:2},operations:{client:2}};}
  else if(change==='logout')await f.click({pAction:'logout'});else if(change==='revoked')await f.revoke();else f.ctx.pState.currentUser.role='billing_person';
  gate.resolve({data:{config:{id:999,private:'old-client'}}});await tick();
  assert.notEqual(f.ctx.pState.clientData.loading,true);assert.notEqual(f.ctx.pState.clientData.config?.private,'old-client');
  if(change==='client')assert.equal(f.ctx.pState.clientData.config.id,2);else if(change==='role')assert.equal(f.ctx.clientDataMatches(),false);else assert.equal(Object.keys(f.ctx.pState.clientData).length,0);
 }
});
