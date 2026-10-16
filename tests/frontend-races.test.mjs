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
  notify:Object.fromEntries(['error','success','info','warning'].map(k=>[k,v=>messages.push([k,v])])),render(){calls.push(['render']);},cancelDialogs(){},
  FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values||{});}},validateOwner:(name,email)=>({owner_name:name,owner_email:email}),
  serverConfigOperation:async(_id,_changes,readStatus,send)=>{await readStatus();return send('synthetic-request',_changes);},
  window:{addEventListener(){}},document:{getElementById:()=>null,addEventListener:(name,fn)=>{if(name==='click')click=fn;}},setInterval(){},validateSession(){},rpc:async(...args)=>{calls.push(args);return{};}};
 vm.createContext(ctx);for(const p of ['src/state.js','src/async-context.js','src/team.js','src/team-errors.js','src/supabase.js','src/forms.js','src/events.js','src/provisioning.js'])vm.runInContext(strip(read(p))+(p==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 ctx.initEvents();ctx.pState.authenticated=true;ctx.pState.dataReady=true;ctx.pState.currentUser={auth_user_id:'master',role:'master_admin',session_id:'session-one'};ctx.pState.page='clients';
 return {ctx,calls,messages,pending,submit:(type,values={})=>ctx.handleFormSubmit({preventDefault(){},target:{dataset:{pForm:type},values}}),
  click:async dataset=>{click({target:{closest:s=>s.includes('data-auth-form')?null:{dataset,disabled:false}},preventDefault(){}});await tick();}};
}
function clientWrite(f,result){const original=f.ctx.transport.rpc;f.ctx.transport.rpc=(name,args)=>name==='platform_save_client'?result:original(name,args);}
test('targeted retirement approval and Pending popup dispatch only explicit Master-owned invitations',async()=>{
 const f=fixture();f.ctx.pState.page='settings';f.ctx.pState.data.teamArchive=[{id:'old-employee',email:'again@example.test',deleted_at:'2026-10-13'}];
 f.ctx.pState.modal={type:'add-platform-user',data:{requestId:'fresh-request'}};let approved=false;const sent=[],dialogs=[];
 f.ctx.confirmDialog=async options=>{dialogs.push(options);return approved;};f.ctx.loadPlatform=async()=>{};
 f.ctx.transport.functions={invoke:async(name,args)=>{sent.push([name,args.body]);return {data:{success:true}};}};
 const values={name:'New employee',email:'again@example.test',role:'billing_person'};
 await f.submit('add-platform-user',values);assert.equal(sent.length,0);approved=true;await f.submit('add-platform-user',values);
 assert.equal(sent[0][1].retired_employee_id,'old-employee');assert.equal(sent[0][1].request_id,'fresh-request');
 f.ctx.pState.data.platformUsers=[{id:'pending',auth_user_id:'pending-auth',email:'pending@example.test',name:'Pending employee',role:'billing_person',status:'Pending'}];await f.click({pAction:'invitation-status',pId:'pending'});
 assert.equal(dialogs.at(-1).confirmLabel,'Resend invitation');assert.equal(sent.at(-1)[0],'resend-platform-invitation');assert.equal(sent.at(-1)[1].id,'pending');
 f.ctx.pState.currentUser.role='billing_person';const count=sent.length;await f.click({pAction:'invitation-status',pId:'pending'});assert.equal(sent.length,count);
});
test('targeted deletion response decoding never replaces uncertainty with a late or unverified rejection',async()=>{
 const f=fixture();
 const legacy=await f.ctx.teamErrorMessage(null,{context:{clone:()=>({json:async()=>({code:'deletion_disabled',review_required:false})})}},'request');
 assert.match(legacy,/Deletion is disabled.*earlier attempt may still require reconciliation.*Review request request/);assert.doesNotMatch(legacy,/No (employee )?deletion started/);
 assert.match(await f.ctx.teamErrorMessage({code:'deletion_disabled',review_required:true},null,'request'),/Review request request/);
 assert.match(await f.ctx.teamErrorMessage({code:'unknown',review_required:false},null,'request'),/Review request request/);
});
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
function entitlementFixture(role,outcome='applied'){
 const f=fixture();loaded(f);const client=Object.assign(f.ctx.pState.selectedClient,{onboarding_version:2,lifecycle_state:'Active',infrastructure_state:'present',plan:'Basic',inventory_billable:false,ems_track_breaks:false});
 f.ctx.pState.currentUser.role=role;f.ctx.pState.data.clients=[client];f.ctx.pState.modal={type:'edit-client'};f.ctx.pState.clientData.provisioning=null;
 let unresolved=false;f.requests=[];f.sends=[];
 f.ctx.transport.rpc=async(name,args)=>{f.requests.push([name,args]);return {data:name==='platform_plan_entitlements'?{technician_module_enabled:true,inventory_module_enabled:args.p_inventory}:name==='platform_overhaul_status'?{config_jobs:unresolved?[{request_id:'synthetic-request',state:'uncertain'}]:[]}:name==='platform_save_client'?{...client,...args.p_data}:{}};};
 f.ctx.transport.functions={invoke:async(name,args)=>{f.sends.push([name,args]);unresolved=outcome!=='applied';if(outcome==='rejected')throw Error('Synthetic network failure');return {data:{state:outcome}};}};
 // Use the actual config single-flight, unresolved-intent and RPC helper.
 vm.runInContext(strip(read('src/operations.js')),f.ctx);
 f.ctx.loadPlatform=async()=>{};f.ctx.loadClientData=async()=>true;
 return f;
}
test('name-only edits save Platform changes without resetting customized Shop entitlements',async()=>{
 for(const role of ['portfolio_manager','master_admin']){
  const f=entitlementFixture(role);f.ctx.pState.clientData.config.technician_module_enabled=true;
  await f.submit('edit-client',{currency:'PKR',name:'Renamed client',plan:'Basic'});
  assert.equal(f.requests.filter(c=>c[0]==='platform_save_client').length,1);
  assert.equal(f.requests.filter(c=>c[0]==='platform_plan_entitlements').length,0);assert.equal(f.sends.length,0);
  assert.equal(f.ctx.pState.selectedClient.name,'Renamed client');assert.equal(f.ctx.pState.clientData.config.technician_module_enabled,true);
  assert.equal(f.ctx.pState.modal,null);assert.equal(f.messages.length,0);
 }
});
test('Manager and Master actual plan changes dispatch the saved plan entitlements without private provisioning reads',async()=>{
 for(const role of ['portfolio_manager','master_admin']){
  const f=entitlementFixture(role);await f.submit('edit-client',{currency:'PKR',name:'Client',plan:'Pro'});
  assert.equal(f.requests.filter(c=>c[0]==='platform_save_client').length,1);assert.equal(f.sends.length,1);
  assert.equal(f.requests.find(c=>c[0]==='platform_plan_entitlements')[1].p_plan,'Pro');
  assert.equal(f.sends[0][0],'platform-config');assert.equal(f.sends[0][1].body.client_id,1);assert.equal(f.sends[0][1].body.changes.technician_module_enabled,true);
  assert.equal(f.ctx.pState.modal,null);assert.equal(f.ctx.pState.clientData.provisioning,null);assert.equal(f.messages.length,0);
 }
 const pending=entitlementFixture('portfolio_manager');pending.ctx.pState.selectedClient.lifecycle_state='Provisioning';
 await pending.submit('edit-client',{currency:'PKR',plan:'Pro'});assert.equal(pending.sends.length,0);assert.ok(pending.messages.some(([tone,text])=>tone==='warning' && /verify Shop setup/i.test(text)));
});
test('failed, uncertain or rejected Shop sync reports a committed Platform plan without retrying unresolved writes',async()=>{
 for(const outcome of ['failed','uncertain','rejected']){
  const f=entitlementFixture('portfolio_manager',outcome);await f.submit('edit-client',{currency:'PKR',plan:'Pro'});
  assert.equal(f.requests.filter(c=>c[0]==='platform_save_client').length,1);assert.equal(f.sends.length,1);assert.equal(f.ctx.pState.selectedClient.plan,'Pro');
  assert.equal(f.ctx.pState.modal,null);assert.ok(f.messages.some(([tone,text])=>tone==='warning' && /Platform.*saved.*Shop.*not confirmed/i.test(text)));
  assert.equal(f.messages.some(([tone])=>tone==='success'),false);
  await assert.rejects(f.ctx.updateClientConfig(f.ctx.pState.selectedClient,{technician_module_enabled:true}),/unresolved/);assert.equal(f.sends.length,1);
 }
});
test('Billing rate writes remain authorized; addon changes explicitly require allowed Shop reconciliation without private RPCs',async()=>{
 for(const addon of [false,true]){
  const f=entitlementFixture('billing_person');f.ctx.pState.modal={type:'edit-client-rates'};delete f.ctx.pState.selectedClient.onboarding_version;delete f.ctx.pState.selectedClient.infrastructure_state;
  await f.submit('edit-client-rates',{client_id:'1',event_rate:'6',inventory_rate:'2',inventory_billable:String(addon)});
  assert.equal(f.requests.filter(c=>c[0]==='platform_set_rates').length,1);assert.equal(f.requests.filter(c=>['platform_plan_entitlements','platform_overhaul_status'].includes(c[0])).length,0);assert.equal(f.sends.length,0);
  assert.equal(f.messages.some(([tone,text])=>tone==='warning' && /inventory.*Shop/i.test(text)),addon);assert.equal(f.ctx.pState.modal,null);
 }
 const master=entitlementFixture('master_admin');master.ctx.pState.modal={type:'edit-client-rates'};
 await master.submit('edit-client-rates',{client_id:'1',event_rate:'6',inventory_rate:'2',inventory_billable:'true'});
 assert.equal(master.sends.length,1);assert.equal(master.sends[0][1].body.changes.inventory_module_enabled,true);assert.equal(master.messages.length,0);
});
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
 const destination={client_id:f.ctx.pState.selectedClient.id,origin:'https://shop.example.test',project_ref:'abcdefghijklmnopqrst',client_binding:'fixture',source_id:'99000000-0000-4000-8000-000000000001',revision:'99000000-0000-4000-8000-000000000002'};
 f.ctx.transport.rpc=async()=>({data:destination});let issued=false;f.ctx.transport.functions={invoke:()=>{issued=true;return support.promise;}};vm.runInContext(strip(read('src/support-handoff.js')),f.ctx);
 const open=f.ctx.openShopSupport(f.ctx.pState.selectedClient);await tick();assert.equal(issued,true);f.ctx.clearSensitiveState();support.resolve({data:{token:'a'.repeat(64),shop_url:'https://shop.example.test'}});await open;
 assert.equal(redirected,0);assert.equal(closed,1);
 const reading=fixture();loaded(reading);reading.ctx.transport.functions={invoke:async()=>{throw Error('private network detail');}};await reading.click({pAction:'read-shop-config'});
 assert.equal(reading.ctx.pState.clientData.loading,false);assert.ok(reading.ctx.pState.clientData._error);assert.equal(reading.ctx.clientDataMatches(),false);
 const setup=fixture(),password=deferred();let signouts=0;setup.ctx.pState.authenticated=false;setup.ctx.pState.page='reset-password';setup.ctx.pState.passwordFlow={requestId:'setup'};
 setup.ctx.document.getElementById=id=>id==='reset-status'?{style:{cssText:''},classList:{remove(){}}}:{value:'SyntheticPassword1!'};
 setup.ctx.transport.functions={invoke:()=>password.promise};setup.ctx.transport.auth={signOut:async()=>signouts++};
 await setup.click({pAction:'confirm-reset-password'});setup.ctx.clearSensitiveState();setup.ctx.pState.authenticated=true;setup.ctx.pState.currentUser={auth_user_id:'different',role:'master_admin'};
 password.resolve({data:{success:true}});await tick();assert.equal(signouts,0,'an old setup response must not sign out a new login');assert.equal(setup.ctx.pState.currentUser.auth_user_id,'different');
});


test('explicit plan reconciliation uses current server intent and cancels on a departed view or denied role',async()=>{
 for(const late of [false,true]){
  const f=fixture(),gate=deferred();loaded(f);let writes=0;
  f.ctx.transport.rpc=async name=>name==='platform_config_intent'?gate.promise:{data:{config_jobs:[]}};
  f.ctx.updateClientConfig=async(client,changes)=>{writes++;assert.equal(client.id,1);assert.equal(changes.technician_module_enabled,true);return false;};
  await f.click({pAction:'reconcile-plan-config'});if(late)f.ctx.clearSensitiveState();
  gate.resolve({data:{pending:true,generation:2,changes:{technician_module_enabled:true}}});await tick();assert.equal(writes,late?0:1);
 }
 const denied=fixture();loaded(denied);denied.ctx.pState.currentUser.role='billing_person';
 denied.ctx.transport.rpc=async()=>{throw Error('Billing must never reach intent RPC');};await denied.click({pAction:'reconcile-plan-config'});
});

test('configuration recovery displays unresolved state after an observed but unacknowledged remote outcome',async()=>{
 const f=fixture();loaded(f);let shown;
 f.ctx.showMessage=async message=>shown=message;
 f.ctx.transport.functions={invoke:async()=>({data:{state:'uncertain',config:{technician_module_enabled:true}}})};
 await f.ctx.handleFormSubmit({preventDefault(){},submitter:{value:'retry'},target:{dataset:{pForm:'config-recovery'},elements:{request_id:{value:'synthetic'},reason:{value:'Explicit fixture recovery review'}}}});
 assert.equal(shown.title,'Operation unresolved');assert.match(shown.message,/recorded request is not verified/);
});

test('N1 actual reconciliation cannot borrow a pending suspension operation',async()=>{
 const f=fixture();loaded(f);vm.runInContext(strip(read('src/operations.js')),f.ctx);
 const gate=deferred(),sent=[];
 f.ctx.transport.rpc=async name=>({data:name==='platform_config_intent'?{pending:true,generation:2,changes:{technician_module_enabled:true}}:{config_jobs:[]}});
 f.ctx.transport.functions={invoke:async(_name,{body})=>{sent.push(body.changes);await gate.promise;return {data:{state:'applied'}};}};
 const suspension=f.ctx.updateClientConfig(f.ctx.pState.selectedClient,{suspended:true});await tick();
 await f.click({pAction:'reconcile-plan-config'});
 gate.resolve();await suspension;await tick();
 assert.equal(sent.length,1);assert.equal(sent[0].suspended,true);assert.equal(sent[0].technician_module_enabled,undefined);
 assert.equal(f.messages.some(([tone])=>tone==='success'),false);assert.ok(f.messages.some(([tone,text])=>tone==='warning' && /in progress/.test(text)));
});

test('N1 commercial success requires fresh matching nonpending intent; failed, superseded and stale completions never succeed',async()=>{
 for(const outcome of ['confirmed','pending','newer','overhaul-error','operations-error','failed','uncertain','session','role']){
  const f=fixture();loaded(f);vm.runInContext(strip(read('src/operations.js')),f.ctx);
  let statusReads=0,writes=0;const gate=deferred();
  f.ctx.transport.rpc=async name=>{
   if(name==='platform_config_intent')return {data:{pending:true,generation:2,changes:{technician_module_enabled:true}}};
   if(name==='platform_overhaul_status'){
    statusReads++;if(statusReads>1 && outcome==='overhaul-error')return {error:{message:'Synthetic unavailable status'}};
    return {data:{config_jobs:[],entitlement_intent:{generation:outcome==='newer' && statusReads>1?3:2,pending:outcome==='pending'}}};
   }
   return outcome==='operations-error' && name==='platform_client_operations'?{error:{message:'Synthetic unavailable operations'}}:{data:{}};
  };
  f.ctx.transport.functions={invoke:async(_name,{body})=>{writes++;assert.equal(body.changes.technician_module_enabled,true);await gate.promise;return {data:{state:['failed','uncertain'].includes(outcome)?outcome:'applied'}};}};
  await f.click({pAction:'reconcile-plan-config'});assert.equal(writes,1);
  if(outcome==='session')f.ctx.pState.currentUser.session_id='successor-session';
  if(outcome==='role')f.ctx.pState.currentUser.role='billing_person';
  gate.resolve();await tick();await tick();
  assert.equal(f.messages.filter(([tone])=>tone==='success').length,outcome==='confirmed'?1:0,outcome);
  assert.equal(writes,1,'No automatic retry after '+outcome);
  if(!['confirmed','session','role'].includes(outcome))assert.ok(f.messages.some(([tone])=>tone==='warning'),outcome);
  assert.equal(statusReads,['failed','uncertain','session','role'].includes(outcome)?1:2,outcome);
 }
});
