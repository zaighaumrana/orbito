import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const ui={URL,esc};vm.createContext(ui);vm.runInContext(read('src/client-setup.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ui);
const client={id:50,name:'Example Shop',owner_name:'Owner',owner_email:'owner@example.test',onboarding_version:2,pairing_mode:'byo',plan:'Pro',shop_url:'https://shop.example.test',supabase_url:'https://abcdefghijklmnopqrst.supabase.co',technician_module_enabled:true,live_tracking_enabled:true};
const keys=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'];
const health={checks:Object.fromEntries(keys.map(k=>[k,true])),contract:'orbito-onboarding-runtime-v1',owner_account:'missing',infrastructure:'ready',owner_setup:'owner_setup_pending',onboarding:'onboarding_pending'};
const detail=h=>({provisioning:{connection:{health:h,bridge_call_configured:true,client_binding:'orbito-client-50'}},operations:{}});
test('Client Detail has one dominant setup action, six stages and collapsed diagnostics',()=>{
 const html=ui.renderClientSetup(client,detail(health),true);assert.equal((html.match(/class="primary-button"/g)||[]).length,1);
 for(const label of ['Client Created','Shop Connected','Runtime Verified','Owner Reserved','Owner Activated','Shop Setup Complete','Check Owner Account'])assert.match(html,new RegExp(label));
 assert.match(html,/<details class="setup-advanced"><summary>Advanced/);assert.doesNotMatch(html.split('<details')[0],/owner_setup_pending|bootstrap-shop|orbito-client-50|<pre>/);
 assert.match(read('src/pages/clients.js'),/Client #.*copyValue\(c.id/);
});
test('backend preflight wording follows check results independently of observation timestamp',()=>{
 for(const time of [undefined,'2026-10-01T08:00:00Z','invalid']){
  const verified=ui.renderClientSetup(client,{...detail(health),provisioning:{connection:{health,verified_at:time}}},true);
  assert.match(verified,/Backend runtime preflight verified\./);assert.doesNotMatch(verified,/Runtime has not been verified|preflight is pending|Invalid Date/);
  assert.match(verified,/Hosted external checks.*CAPTCHA hostname, DNS\/TLS and browser routing/);
  const pending=ui.runtimeObservation(ui.setupState(client,detail({...health,checks:{...health.checks,authentication:false}})),time);
  assert.doesNotMatch(pending,/preflight verified/);assert.match(pending,/pending|needs attention/);
 }
});
test('primary action follows pairing, runtime gaps, manual account detection and completion',()=>{
 assert.equal(ui.setupState(client,detail({})).action,'byo-setup');
 assert.equal(ui.setupState(client,detail({...health,checks:{...health.checks,owner_reservation:false}})).action,'bootstrap-shop');
 assert.equal(ui.setupState(client,detail({...health,checks:{...health.checks,authentication:false},infrastructure:'pending'})).action,'byo-setup');
 assert.equal(ui.setupState(client,detail(health)).action,'onboarding-status');
 const conflict=ui.setupState(client,detail({...health,owner_account:'conflict',infrastructure:'pending'}));assert.equal(conflict.action,'onboarding-status');assert.match(conflict.message,/Reconcile Shop Auth/);assert.doesNotMatch(conflict.message,/Create one/);
 assert.equal(ui.setupState(client,detail({...health,owner_account:'ready'})).action,'open-login');
 assert.equal(ui.setupState(client,detail({...health,onboarding:'onboarding_complete'})).action,'open-shop');
});
test('BYO guide uses five stages, safe copy values and removable-file warning without secret inputs',()=>{
 const html=ui.byoSetupModal(client,detail(health));assert.equal((html.match(/<li><h3>/g)||[]).length,5);assert.match(html,/Sensitive file/);assert.match(html,/Delete|delete/);assert.match(html,/byo:setup/);assert.doesNotMatch(html,/<input|CALL_SECRET=|SOURCE_SECRET=/);
 const malicious=ui.renderClientSetup({...client,owner_name:'<img src=x onerror=alert(1)>',shop_url:'javascript:alert(1)'},detail(health),true);
 assert.doesNotMatch(malicious,/<img|href="javascript:/);assert.match(malicious,/&lt;img/);
});
const runtime={Object};vm.createContext(runtime);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/onboarding.ts').replace(/^import .*$/gm,'').replace(/^export /gm,'')),runtime);
test('missing, false or outdated runtime attestations cannot claim infrastructure ready',()=>{
 for(const missing of keys){const r=runtime.verifiedRuntime({...health,checks:{...health.checks,[missing]:false}});assert.equal(r.infrastructure,'pending');}
 assert.equal(runtime.verifiedRuntime({...health,checks:undefined}).infrastructure,'pending');
 assert.equal(runtime.verifiedRuntime({...health,contract:'old'}).infrastructure,'pending');
 assert.equal(runtime.verifiedRuntime({...health,owner_account:'conflict'}).infrastructure,'pending');assert.equal(runtime.verifiedRuntime(health).infrastructure,'ready');
});
test('operator identity is verified by server UUID/role independently of optional username email alias',async()=>{
 let user={id:'verified-id'},identity={auth_user_id:'verified-id',role:'master_admin',email:'canonical@example.test',username:'Alias'};
 const ctx={pb:{auth:{getUser:async()=>({data:{user}})},rpc:async()=>({data:identity})}};vm.createContext(ctx);
 const fn=read('src/supabase.js').split('export async function loadOperatorIdentity()')[1].split('export async function loadConfig')[0];vm.runInContext('async function loadOperatorIdentity()'+fn,ctx);
 assert.equal((await ctx.loadOperatorIdentity()).role,'master_admin');identity={...identity,auth_user_id:'wrong-id'};await assert.rejects(ctx.loadOperatorIdentity());
 identity={...identity,auth_user_id:'verified-id',role:'unapproved'};await assert.rejects(ctx.loadOperatorIdentity());user=null;await assert.rejects(ctx.loadOperatorIdentity());
 assert.doesNotMatch(read('src/main.js'),/VITE_PLATFORM_AUTH_EMAIL/);assert.match(read('src/events.js'),/const identity = await loadOperatorIdentity/);
});
// Exercise the complete detail renderer as well as the isolated setup component.
Object.assign(ui,{pState:{currentUser:{role:'master_admin'},data:{invoices:[]}},computeClientBilling:()=>({billCount:0,inventoryCount:0,grandTotal:0}),moduleToggleRow:()=>''});
vm.runInContext(read('src/provisioning.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ui);
vm.runInContext(read('src/pages/clients.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ui);
test('full detail header renders copyable client ID and safe Shop link; legacy Client 1 stays outside V2',()=>{
 ui.pState.selectedClient=client;ui.pState.clientData=detail(health);const html=ui.pageClientDetail();assert.match(html,/Client #50/);assert.match(html,/href="https:\/\/shop.example.test\/"/);assert.doesNotMatch(html,/\/\^https:/);
 ui.pState.selectedClient={...client,id:1,onboarding_version:0};ui.pState.clientData={...detail({connection:'Connected'}),operations:{source:{enabled:true,usage_from_sequence:37},thermal:{}}};
 const legacy=ui.pageClientDetail();assert.match(legacy,/Existing Shop/);assert.doesNotMatch(legacy,/Client Created|bootstrap-shop|Complete BYO Setup|value="pair-shop"/);assert.match(legacy,/<details class="setup-advanced"><summary>Advanced/);
});
