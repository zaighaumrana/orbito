// Actual frontend handlers with explicit Auth/DOM doubles; no hosted writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv');
const identity={auth_user_id:'master-uuid',email:'actual-auth@example.test',role:'master_admin'};
function authFixture({failure,stale,role='master_admin',afterRole=role,mismatch=false,cleanupError=false}={}) {
 const calls=[],options=[],messages=[],writes=[];let verified=0;
 const original={auth:{getUser:async()=>{verified++;return stale?{error:{status:401},data:{}}:{data:{user:{id:identity.auth_user_id}}};}},rpc:async()=>({data:{...identity,role:verified>1?afterRole:role}}),
  from:table=>({update:value=>({eq:()=>({select:()=>({maybeSingle:async()=>{writes.push({table,value});return {data:{id:1,...value}};}})})})})};
 const verifier={auth:{signInWithPassword:async input=>{calls.push(['verify',input]);if(failure==='network')throw new TypeError('offline');return failure?{error:{code:failure},data:{}}:{data:{session:{},user:{id:mismatch?'other-uuid':identity.auth_user_id}}};},signOut:async options=>{calls.push(['cleanup',options]);return cleanupError?{error:{}}:{};}}};
 let clients=0;
 const ctx={TypeError,testEnv:{VITE_PLATFORM_URL:'https://example.invalid',VITE_PLATFORM_ANON:'synthetic-public'},createClient:(...args)=>{options.push(args);return clients++?verifier:original;},
  pState:{turnstileToken:'fresh-captcha',currentUser:identity},PCFG:{admin_username:'original'},captchaBusy(){},resetTurnstile(){ctx.pState.turnstileToken=null;calls.push(['reset']);},render(){},
  notify:Object.fromEntries(['error','success','info'].map(t=>[t,v=>messages.push([t,v?.userMessage || v])])),cancelDialogs(){},FormData:class{constructor(f){this.f=f;}entries(){return Object.entries(this.f.values);}}};
 vm.createContext(ctx);vm.runInContext(strip(read('src/supabase.js')),ctx);vm.runInContext(strip(read('src/forms.js')),ctx);
 const form={dataset:{pForm:'change-username'},values:{current:'synthetic-password',new_username:'new-alias'},reset(){calls.push(['form-reset']);}};
 return {ctx,calls,options,messages,writes,original,submit:()=>ctx.handleFormSubmit({target:form,preventDefault(){}})};
}
test('fresh CAPTCHA, actual Auth email, stable master and memory-only local verification preserve original session',async()=>{
 const f=authFixture();await f.submit();assert.equal(f.writes.length,1);assert.equal(f.ctx.PCFG.admin_username,'new-alias');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])),{email:identity.email,password:'synthetic-password',options:{captchaToken:'fresh-captcha'}});
 assert.equal(f.options[1][2].auth.persistSession,false);assert.equal(f.options[1][2].auth.autoRefreshToken,false);assert.equal(f.options[1][2].auth.detectSessionInUrl,false);
 assert.equal(f.options[1][2].auth.storageKey,'platform-password-verification');assert.equal(f.calls[1][1].scope,'local');
 assert.equal(f.original.auth.signInWithPassword,undefined);assert.equal(f.original.auth.signOut,undefined);assert.equal(f.messages[0][0],'success');assert.equal(f.ctx.pState.turnstileToken,null);
 await f.ctx.reauthenticateMaster('synthetic-password','another-fresh-captcha');assert.equal(f.options.length,2,'reuse the isolated client without duplicate SDK listeners/storage-key warnings');
});
test('wrong password, expired CAPTCHA, network, stale session, ordinary roles and authority changes never write or report success',async()=>{
 for(const [config,match] of [[{failure:'invalid_credentials'},/password is incorrect/],[{failure:'captcha_failed'},/fresh verification/],[{failure:'network'},/connection/],[{stale:true},/session has expired/],[{role:'portfolio_manager'},/Only the verified master/],[{role:'billing_person'},/Only the verified master/],[{afterRole:'billing_person'},/not authorized/],[{mismatch:true},/not authorized/],[{cleanupError:true},/verification could not be completed/]]){
  const f=authFixture(config);await f.submit();assert.equal(f.writes.length,0);assert.equal(f.ctx.PCFG.admin_username,'original');assert.equal(f.messages.length,1);assert.equal(f.messages[0][0],'error');assert.match(f.messages[0][1],match);assert.equal(f.ctx.pState.reauthLoading,false);
 }
 const missing=authFixture();missing.ctx.pState.turnstileToken=null;await missing.submit();assert.equal(missing.calls.filter(c=>c[0]==='verify').length,0);assert.equal(missing.writes.length,0);assert.match(missing.messages[0][1],/fresh verification/);
});
test('failed or zero-row username update never updates the cached alias or displays success',async()=>{
 for(const result of [{error:{message:'internal secret'}},{data:null},{data:{id:1,admin_username:'unexpected'}}]){
  const f=authFixture();f.original.from=()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:async()=>result})})})});await f.submit();
  assert.equal(f.ctx.PCFG.admin_username,'original');assert.equal(f.messages[0][0],'error');assert.match(f.messages[0][1],/could not be confirmed/);assert.doesNotMatch(f.messages[0][1],/internal secret/);
 }
});
test('overlapping username submission consumes the challenge once and does not duplicate the mutation',async()=>{
 const f=authFixture();let release;const gate=new Promise(r=>release=r);const real=f.ctx.reauthenticateMaster;
 f.ctx.reauthenticateMaster=async(...args)=>{await gate;return real(...args);};const first=f.submit();await f.submit();assert.equal(f.ctx.pState.reauthLoading,true);release();await first;assert.equal(f.writes.length,1);assert.equal(f.calls.filter(c=>c[0]==='verify').length,1);
});
test('master and own-password validation, successful Auth update/signout and failure behavior remain intact',async()=>{
 for(const type of ['change-password','change-own-password']){
  const f=authFixture();let updates=0,signouts=0;f.original.auth.updateUser=async()=>{updates++;return{};};f.original.auth.signOut=async()=>{signouts++;};
  const submit=values=>f.ctx.handleFormSubmit({target:{dataset:{pForm:type},values},preventDefault(){}});
  await submit({newpass:'StrongSynthetic1!',confirm:'mismatch'});await submit({newpass:'weak',confirm:'weak'});assert.equal(updates,0);
  f.original.auth.updateUser=async()=>({error:{message:'provider internals'}});await submit({newpass:'StrongSynthetic1!',confirm:'StrongSynthetic1!'});assert.equal(signouts,0);
  f.original.auth.updateUser=async()=>{updates++;return{};};await submit({newpass:'StrongSynthetic1!',confirm:'StrongSynthetic1!'});assert.equal(updates,1);assert.equal(signouts,1);assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.page,'login');
 }
});
test('team invitation/edit handlers retain server boundaries, role denial and idempotent invitation messaging',async()=>{
 const f=authFixture();const invocations=[];f.original.functions={invoke:async(name,{body})=>{invocations.push({name,body});return {data:{success:true,already_invited:true}};}};f.ctx.loadPlatform=async()=>{};
 const submit=(type,values)=>f.ctx.handleFormSubmit({target:{dataset:{pForm:type},values},preventDefault(){}});
 for(const role of ['portfolio_manager','billing_person']){f.ctx.pState.currentUser={role};await submit('add-platform-user',{});await submit('edit-platform-user',{});}assert.equal(invocations.length,0);
 f.ctx.pState.currentUser=identity;await submit('add-platform-user',{email:'fixture@example.test',name:'Fixture',role:'billing_person'});assert.equal(invocations[0].name,'create-platform-user');assert.match(f.messages.at(-1)[1],/No new invitation email/);
 await submit('edit-platform-user',{id:'row-42',name:'Fixture',email:'fixture@example.test',role:'portfolio_manager'});assert.equal(invocations[1].name,'update-platform-user');assert.equal(invocations[1].body.id,'row-42');
});
function removalFixture() {
 let click,resolve,calls=0;const element={dataset:{pAction:'remove-platform-user',pId:'row-42'},isConnected:true,disabled:false};
 const state={currentUser:identity};const ctx={pState:state,window:{addEventListener(){}},document:{addEventListener:(type,fn)=>{if(type==='click')click=fn;}},setInterval(){},notify:{error(){}},confirmDialog:()=>new Promise(r=>resolve=r),loadOperatorIdentity:async()=>identity,loadPlatform:async()=>{},render(){},pb:{functions:{invoke:async()=>{calls++;return{};}}}};
 vm.createContext(ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();
 const event={target:{closest:selector=>selector.includes('data-auth-form')?null:element},preventDefault(){}};
 return {ctx,element,click:()=>click(event),finish:value=>resolve(value),calls:()=>calls};
}
test('team removal waits for confirmation, blocks repeated clicks, cancels safely and rechecks authority',async()=>{
 for(const accept of [false,true]){
  const f=removalFixture();f.click();f.click();assert.equal(f.element.disabled,true);assert.equal(f.calls(),0);f.finish(accept);await new Promise(r=>setImmediate(r));assert.equal(f.calls(),accept?1:0);assert.equal(f.element.disabled,false);
 }
 const denied=removalFixture();denied.click();denied.ctx.loadOperatorIdentity=async()=>({role:'billing_person'});denied.finish(true);await new Promise(r=>setImmediate(r));assert.equal(denied.calls(),0);
});
test('activation and rotation await decisions without changing request identities or sending cancelled operations',async()=>{
 for(const [action,accepted] of [['activate',false],['rotate',false],['rotate',true],['resume',true]]){
  let resolve;const calls=[],button={disabled:false,isConnected:true};const job={action:'rotate',request_id:'original-request',params:{}};
  const ctx={pState:{selectedClient:{id:42},clientData:{provisioning:{job}}},notify:{error(){}},confirmDialog:()=>new Promise(r=>resolve=r),crypto:{randomUUID:()=> 'new-request'},loadClientData:async()=>{},render(){},pb:{functions:{invoke:async(name,{body})=>{calls.push(body);return{};}}}};
  vm.createContext(ctx);vm.runInContext(strip(read('src/provisioning.js')),ctx);
  const form={elements:{confirmed:{checked:true},note:{value:'Approved test-only cutover'}},querySelectorAll:()=>[button]};const promise=ctx.submitProvisioning(form,action);assert.equal(button.disabled,true);assert.equal(calls.length,0);resolve(accepted);await promise;
  assert.equal(calls.length,accepted?1:0);assert.equal(button.disabled,false);if(accepted)assert.equal(calls[0].request_id,action==='resume'?'original-request':'new-request');
 }
});
test('billing confirmation cancellation never prints and confirmation prints once',()=>{
 const handlers={};let prints=0;const client={id:42,currency_symbol:'USD'},invoice={id:7,client_id:42};
 const ctx={pState:{data:{clients:[client],usage:[],payments:[]}},esc:String,getInvoicePayments:()=>[],getInvoicePaidTotal:()=>0,buildInvoiceHTML:()=>'<p>Synthetic preview</p>',printInNewWindow:()=>prints++,
  document:{getElementById:selector=>({addEventListener:(type,fn)=>handlers[selector]=fn}),createElement:()=>({style:{},addEventListener(){},remove(){}}),body:{appendChild(){}}}};
 vm.createContext(ctx);const source=read('src/billing.js');vm.runInContext(source.slice(source.indexOf('function showInvoiceConfirmModal')),ctx);
 ctx.showInvoiceConfirmModal(invoice);handlers['invoice-confirm-cancel']();assert.equal(prints,0);ctx.showInvoiceConfirmModal(invoice);handlers['invoice-confirm-print']();assert.equal(prints,1);
});
test('complete application sources contain no native alert, confirm or prompt calls or dynamic wrappers',()=>{
 const files=readdirSync(new URL('../src',import.meta.url),{recursive:true}).filter(p=>/\.(js|html)$/.test(p));
 for(const file of files){const s=read('src/'+file);assert.doesNotMatch(s,/\b(?:alert|confirm|prompt)\s*\(/,file);assert.doesNotMatch(s,/window\s*\[\s*['"](?:alert|confirm|prompt)['"]/ ,file);}
});

test('client suspension/reactivation retain the canonical lifecycle RPC, reason and selected target',async()=>{
 for(const action of ['suspend','reactivate']){
  const f=authFixture();const calls=[];f.ctx.pState.selectedClient={id:42};f.ctx.rpc=async(name,args)=>calls.push({name,args});f.ctx.loadPlatform=async()=>{};f.ctx.loadClientData=async()=>{};
  await f.ctx.handleFormSubmit({preventDefault(){},submitter:{value:action},target:{dataset:{pForm:'client-lifecycle'},elements:{reason:{value:'Approved fixture reason'}}}});
  assert.equal(calls.length,1);assert.equal(calls[0].name,'platform_client_lifecycle');assert.equal(calls[0].args.p_client,42);assert.equal(calls[0].args.p_action,action);assert.equal(calls[0].args.p_reason,'Approved fixture reason');
 }
});
test('unresolved recovery requires acknowledgment before refresh and preserves the original recovery request',async()=>{
 const f=authFixture();let acknowledge,refreshes=0;const calls=[];f.ctx.pState.selectedClient={id:42};f.ctx.pState.clientData={config:{}};
 f.original.functions={invoke:async(name,args)=>{calls.push({name,args});return{data:{state:'unresolved'}};}};
 f.ctx.showMessage=()=>new Promise(r=>acknowledge=r);f.ctx.loadPlatform=async()=>refreshes++;f.ctx.loadClientData=async()=>{};
 const promise=f.ctx.handleFormSubmit({preventDefault(){},submitter:{value:'reconcile'},target:{dataset:{pForm:'config-recovery'},elements:{request_id:{value:'original-request'},reason:{value:'Read-back reconciliation'}}}});
 await new Promise(r=>setImmediate(r));assert.equal(refreshes,0);assert.equal(calls.length,1);assert.equal(calls[0].args.body.request_id,'original-request');acknowledge(true);await promise;assert.equal(refreshes,1);assert.equal(calls.length,1);
});
