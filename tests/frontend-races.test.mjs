// Execute actual frontend state/loaders/forms with controlled transport timing.
// No hosted requests or simulated copies of the behavior under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const messages=[],calls=[],pending=new Map();let click;
 const ctx={navigator:{onLine:true},localStorage:{getItem(){},removeItem(){}},testEnv:{},crypto:{randomUUID:()=> 'synthetic-request'},
  createClient:()=>ctx.transport,transport:{rpc:async(name,{p_client}={})=>{calls.push([name,p_client]);if(name==='platform_client_operations'){const gate=deferred();pending.set(p_client,[...(pending.get(p_client)||[]),gate]);return gate.promise;}return {data:{}};}},
  notify:Object.fromEntries(['error','success','info'].map(k=>[k,v=>messages.push([k,v])])),render(){calls.push(['render']);},cancelDialogs(){},
  FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values||{});}},validateOwner:(name,email)=>({owner_name:name,owner_email:email}),
  serverConfigOperation:async(_id,_changes,readStatus,send)=>{await readStatus();return send('synthetic-request');},
  window:{addEventListener(){}},document:{getElementById:()=>null,addEventListener:(name,fn)=>{if(name==='click')click=fn;}},setInterval(){},validateSession(){},rpc:async(...args)=>{calls.push(args);return{};}};
 vm.createContext(ctx);for(const p of ['src/state.js','src/async-context.js','src/supabase.js','src/forms.js','src/events.js','src/provisioning.js'])vm.runInContext(strip(read(p))+(p==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 ctx.initEvents();ctx.pState.authenticated=true;ctx.pState.dataReady=true;ctx.pState.currentUser={auth_user_id:'master',role:'master_admin',session_id:'session-one'};ctx.pState.page='clients';
 return {ctx,calls,messages,pending,submit:(type,values={})=>ctx.handleFormSubmit({preventDefault(){},target:{dataset:{pForm:type},values}}),
  click:async dataset=>{click({target:{closest:s=>s.includes('data-auth-form')?null:{dataset,disabled:false}},preventDefault(){}});await tick();}};
}
function clientWrite(f,result){const original=f.ctx.transport.rpc;f.ctx.transport.rpc=(name,args)=>name==='platform_save_client'?result:original(name,args);}
test('client A/B reversed responses cannot replace B details with A data',async()=>{
 const f=fixture(),a={id:1},b={id:2};f.ctx.pState.page='client-detail';const first=f.ctx.loadClientData(a);const second=f.ctx.loadClientData(b);
 f.pending.get(2)[0].resolve({data:{client:2}});await second;f.pending.get(1)[0].resolve({data:{client:1}});await first;
 assert.equal(f.ctx.pState.selectedClient.id,2);assert.equal(f.ctx.pState.clientData.config.id,2);assert.equal(f.ctx.pState.clientData.operations.client,2);
});
test('successful or failed late Add Client after logout never restores private state or starts follow-up reads',async()=>{
 for(const failure of [false,true]){
  const f=fixture(),gate=deferred();clientWrite(f,gate.promise);
  const submit=f.submit('add-client',{name:'Fixture',owner_name:'Owner',owner_email:'private@example.test',plan:'Basic'});
  f.ctx.clearSensitiveState();f.ctx.pState.page='login';gate.resolve(failure?{error:{message:'fixture failure'}}:{data:{id:42,owner_email:'private@example.test'}});await submit;
  assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.selectedClient,null);assert.equal(f.ctx.pState.page,'login');assert.equal(f.calls.length,0);assert.equal(f.messages.length,0);
 }
});
test('module toggles deny mismatched detail/config identity before any backend call',async()=>{
 const f=fixture();f.ctx.pState.page='client-detail';f.ctx.pState.selectedClient={id:2};f.ctx.pState.clientData={clientId:1,config:{id:1,ems_enabled:true}};
 await f.click({pAction:'toggle-paper'});assert.equal(f.calls.filter(c=>c[0]==='platform_set_paper').length,0);
});
const loaded=(f,id=1)=>{const s=f.ctx.pState;s.page='client-detail';s.selectedClient={id,currency:'PKR'};s.clientData={clientId:id,requestGeneration:s.clientRequestGeneration,config:{id},operations:{}};};
test('newer same-client request wins; navigation cancels pending load; failures clear loading and deny writes',async()=>{
 const f=fixture();f.ctx.pState.page='client-detail';const a=f.ctx.loadClientData({id:1}),b=f.ctx.loadClientData({id:1});
 f.pending.get(1)[1].resolve({data:{version:'new'}});await b;f.pending.get(1)[0].resolve({data:{version:'old'}});await a;
 assert.equal(f.ctx.pState.clientData.operations.version,'new');
 const abandoned=f.ctx.loadClientData({id:1});await f.click({pPage:'clients'});f.pending.get(1)[2].resolve({data:{private:'old'}});await abandoned;
 assert.equal(f.ctx.pState.selectedClient,null);assert.equal(Object.keys(f.ctx.pState.clientData).length,0);
 f.ctx.pState.page='client-detail';const failed=f.ctx.loadClientData({id:2});f.pending.get(2)[0].reject(Error('private backend error'));await failed;
 assert.equal(f.ctx.pState.clientData.loading,false);assert.ok(f.ctx.pState.clientData._error);assert.equal(f.ctx.clientDataMatches(),false);
 await f.click({pAction:'toggle-ems'});assert.equal(f.calls.filter(c=>c[0]==='platform-config').length,0);
 const modal=fixture();modal.ctx.pState.page='client-detail';const loading=modal.ctx.loadClientData({id:3});
 const editing={type:'edit-client'};modal.ctx.pState.modal=editing;modal.pending.get(3)[0].resolve({data:{client:3}});await loading;
 assert.equal(modal.ctx.clientDataMatches(),true,'opening a modal must not strand the current client load in Loading');assert.equal(modal.ctx.pState.modal,editing);
});
test('Add Client responses are discarded on canonical revocation, a different login, same-UUID new session, navigation or modal replacement',async()=>{
 for(const change of ['revoked','new-login','new-session','navigation','modal']){
  const f=fixture(),gate=deferred();clientWrite(f,gate.promise);
  const work=f.submit('add-client',{name:'Fixture',owner_name:'Owner',owner_email:'private@example.test'});
  if(change==='revoked'){
   vm.runInContext(strip(read('src/helpers.js')),f.ctx);f.ctx.transport.rpc=async()=>({data:{authorized:false}});f.ctx.transport.auth={signOut:async()=>({})};await f.ctx.validateSession(()=>{});
  }else if(change==='new-login'){f.ctx.clearSensitiveState();f.ctx.pState.authenticated=true;f.ctx.pState.currentUser={auth_user_id:'different',role:'master_admin',session_id:'other-session'};}
  else if(change==='new-session')f.ctx.pState.currentUser={...f.ctx.pState.currentUser,session_id:'different-session'};
  else if(change==='navigation')await f.click({pPage:'billing'});
  else f.ctx.pState.modal={type:'different'};
  const page=f.ctx.pState.page,modal=f.ctx.pState.modal;gate.resolve({data:{id:42,owner_email:'private@example.test'}});await work;
  assert.equal(f.ctx.pState.selectedClient,null,change);assert.equal(f.ctx.pState.page,page);assert.equal(f.ctx.pState.modal,modal);assert.equal(f.messages.length,0);
 }
});
test('late Edit Client never overwrites another target or starts plan/config follow-ups',async()=>{
 for(const change of ['logout','selection','modal']){
  const f=fixture(),gate=deferred();loaded(f);clientWrite(f,gate.promise);
  const work=f.submit('edit-client',{currency:'PKR',name:'late-private-name'});
  if(change==='logout')f.ctx.clearSensitiveState();else if(change==='selection')f.ctx.selectClient({id:2});else f.ctx.pState.modal={type:'new'};
  gate.resolve({});await work;assert.notEqual(f.ctx.pState.selectedClient?.name,'late-private-name');assert.equal(f.calls.length,0);
 }
});
test('late Shop configuration/public environment reads and provisioning cannot refill departed views or bootstrap after logout',async()=>{
 for(const action of ['read-shop-config','load-public-environment','provision']){
  const f=fixture(),gate=deferred();loaded(f);f.ctx.pState.selectedClient.onboarding_version=2;
  f.ctx.transport.functions={invoke:async(name,args)=>{f.calls.push([name,args]);return gate.promise;}};
  let work;
  if(action==='provision')work=f.ctx.submitProvisioning({elements:{},querySelectorAll:()=>[]},'pair-shop');else await f.click({pAction:action});
  f.ctx.clearSensitiveState();gate.resolve({data:{state:'paired',config:{id:1,private:'synthetic'},public_env:{private:'synthetic'}}});
  if(work)await work;else await tick();assert.equal(Object.keys(f.ctx.pState.clientData).length,0);assert.equal(f.calls.filter(c=>c[0]==='platform-provision').length,action==='read-shop-config'?0:1);
 }
});
test('config preflight cannot dispatch another write after target switch; successful current Add Client still opens its own details once',async()=>{
 const f=fixture(),status=deferred();loaded(f);f.ctx.transport.rpc=()=>status.promise;let sent=0;f.ctx.transport.functions={invoke:async()=>{sent++;return{data:{state:'applied'}};}};
 const work=f.ctx.updateClientConfig(f.ctx.pState.selectedClient,{ems_enabled:true});f.ctx.selectClient({id:2});status.resolve({data:{config_jobs:[]}});
 await assert.rejects(work,/view changed/);assert.equal(sent,0);
 const normal=fixture();normal.ctx.loadPlatform=async()=>{};clientWrite(normal,Promise.resolve({data:{id:42,name:'New'}}));
 const added=normal.submit('add-client',{name:'New',owner_name:'Owner',owner_email:'owner@example.test'});await tick();normal.pending.get(42)[0].resolve({data:{client:42}});await added;
 assert.equal(normal.ctx.pState.page,'client-detail');assert.equal(normal.ctx.pState.clientData.clientId,42);assert.equal(normal.ctx.pState.selectedClient.id,42);
});
test('navigation during username verification releases only its busy flag; late support grant closes its popup; thrown config read clears loading',async()=>{
 const f=fixture(),gate=deferred();f.ctx.reauthenticateMaster=()=>gate.promise;f.ctx.captchaBusy=()=>{};f.ctx.resetTurnstile=()=>{};
 const change=f.submit('change-username',{current:'synthetic',new_username:'alias'});f.ctx.pState.page='overview';gate.resolve({});await change;assert.equal(f.ctx.pState.reauthLoading,false);
 loaded(f);const support=deferred();let redirected=0,closed=0;f.ctx.window.open=()=>({location:{replace:()=>redirected++},close:()=>closed++});f.ctx.URL=URL;
 f.ctx.transport.functions={invoke:()=>support.promise};vm.runInContext(strip(read('src/support-handoff.js')),f.ctx);
 const open=f.ctx.openShopSupport(f.ctx.pState.selectedClient);f.ctx.clearSensitiveState();support.resolve({data:{token:'a'.repeat(64),shop_url:'https://shop.example.test'}});await open;
 assert.equal(redirected,0);assert.equal(closed,1);
 const reading=fixture();loaded(reading);reading.ctx.transport.functions={invoke:async()=>{throw Error('private network detail');}};await reading.click({pAction:'read-shop-config'});
 assert.equal(reading.ctx.pState.clientData.loading,false);assert.ok(reading.ctx.pState.clientData._error);assert.equal(reading.ctx.clientDataMatches(),false);
 const setup=fixture(),password=deferred();let signouts=0;setup.ctx.pState.authenticated=false;setup.ctx.pState.page='reset-password';setup.ctx.pState.passwordFlow={requestId:'setup'};
 setup.ctx.document.getElementById=id=>id==='reset-status'?{style:{cssText:''},classList:{remove(){}}}:{value:'SyntheticPassword1!'};
 setup.ctx.transport.functions={invoke:()=>password.promise};setup.ctx.transport.auth={signOut:async()=>signouts++};
 await setup.click({pAction:'confirm-reset-password'});setup.ctx.clearSensitiveState();setup.ctx.pState.authenticated=true;setup.ctx.pState.currentUser={auth_user_id:'different',role:'master_admin'};
 password.resolve({data:{success:true}});await tick();assert.equal(signouts,0,'an old setup response must not sign out a new login');assert.equal(setup.ctx.pState.currentUser.auth_user_id,'different');
});
