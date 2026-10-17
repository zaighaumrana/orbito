// Actual frontend handlers with explicit Auth/DOM doubles; no hosted writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv');
const identity={auth_user_id:'master-uuid',email:'actual-auth@example.test',role:'master_admin',password_verification_safe:true};
function authFixture({failure,stale,role='master_admin',afterRole=role,mismatch=false,cleanupError=false,continuityApproved=true}={}) {
 const calls=[],options=[],messages=[],writes=[];let verified=0;
 const initialContext=vm.createContext({localStorage:{getItem:()=>null},navigator:{onLine:true}});
 vm.runInContext(strip(read('src/state.js'))+'\nglobalThis.initialState=pState;',initialContext);
 const initialState=initialContext.initialState;
 Object.assign(initialState,{authenticated:true,dataReady:true,page:'settings',turnstileToken:'fresh-captcha',currentUser:{...identity,username:'original',sessionToken:'original-session-marker'}});
 Object.assign(initialState.data,{teamArchive:[],teamOperations:[]}); // Loaded Master datasets.
 const original={auth:{signInWithPassword:async()=>{calls.push(['original-signin']);throw Error('Original session must not be replaced');},signOut:async()=>{calls.push(['original-signout']);throw Error('Original session must not be revoked');},getUser:async()=>{verified++;return stale?{error:{status:401},data:{}}:{data:{user:{id:identity.auth_user_id}}};}},rpc:async()=>({data:{...identity,password_verification_safe:continuityApproved,role:verified>1?afterRole:role}}),
  from:table=>({update:value=>({eq:()=>({select:()=>({maybeSingle:async()=>{writes.push({table,value});return {data:{id:1,...value}};}})})})})};
 const verifier={auth:{signInWithPassword:async input=>{calls.push(['verify',input]);if(failure==='network')throw new TypeError('offline');return failure?{error:{code:failure},data:{}}:{data:{session:{},user:{id:mismatch?'other-uuid':identity.auth_user_id}}};},signOut:async options=>{calls.push(['cleanup',options]);if(cleanupError==='throw')throw Error('Synthetic cleanup failure');return cleanupError?{error:{}}:{};}}};
 let clients=0;
 const ctx={TypeError,testEnv:{VITE_PLATFORM_URL:'https://example.invalid',VITE_PLATFORM_ANON:'synthetic-public'},createClient:(...args)=>{options.push(args);return clients++?verifier:original;},
  pState:initialState,PCFG:{admin_username:'original'},clearSensitiveState(){ctx.pState.authenticated=false;ctx.pState.currentUser={role:null};},captchaBusy(){},resetTurnstile(){ctx.pState.turnstileToken=null;calls.push(['reset']);},render(){},
  notify:Object.fromEntries(['error','success','info'].map(t=>[t,v=>messages.push([t,v?.userMessage || v])])),cancelDialogs(){},FormData:class{constructor(f){this.f=f;}entries(){return Object.entries(this.f.values);}}};
 vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/team-errors.js')),ctx);vm.runInContext(strip(read('src/supabase.js')),ctx);vm.runInContext(strip(read('src/forms.js')),ctx);
 const form={dataset:{pForm:'change-username'},values:{current:'synthetic-password',new_username:'new-alias'},reset(){calls.push(['form-reset']);}};
 return {ctx,calls,options,messages,writes,original,submit:()=>ctx.handleFormSubmit({target:form,preventDefault(){}})};
}
test('unapproved continuity prevents username verification grant and database write',async()=>{const f=authFixture({continuityApproved:false});await f.submit();assert.equal(f.writes.length,0);assert.ok(!f.calls.some(c=>c[0]==='verify'));assert.equal(f.ctx.pState.currentUser.sessionToken,'original-session-marker');assert.match(f.messages[0][1],/continuity/);});
test('fresh CAPTCHA, actual Auth email, stable master and memory-only local verification preserve original session',async()=>{
 const f=authFixture();await f.submit();assert.equal(f.writes.length,1);assert.equal(f.ctx.PCFG.admin_username,'new-alias');
 assert.equal(f.ctx.pState.currentUser.username,'new-alias');assert.equal(f.ctx.pState.currentUser.auth_user_id,identity.auth_user_id);assert.equal(f.ctx.pState.currentUser.email,identity.email);assert.equal(f.ctx.pState.currentUser.sessionToken,'original-session-marker');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])),{email:identity.email,password:'synthetic-password',options:{captchaToken:'fresh-captcha'}});
 assert.equal(f.options[1][2].auth.persistSession,false);assert.equal(f.options[1][2].auth.autoRefreshToken,false);assert.equal(f.options[1][2].auth.detectSessionInUrl,false);
 assert.equal(f.options[1][2].auth.storageKey,'platform-password-verification');assert.equal(f.calls[1][1].scope,'local');
 assert.equal(f.calls.filter(c=>c[0].startsWith('original-')).length,0);assert.equal(f.messages[0][0],'success');assert.equal(f.ctx.pState.turnstileToken,null);
 await f.ctx.reauthenticateMaster('synthetic-password','another-fresh-captcha');assert.equal(f.options.length,2,'reuse the isolated client without duplicate SDK listeners/storage-key warnings');
});
test('wrong password, expired CAPTCHA, network, stale session, ordinary roles and authority changes never write or report success',async()=>{
 for(const [config,match] of [[{failure:'invalid_credentials'},/password is incorrect/],[{failure:'captcha_failed'},/fresh verification/],[{failure:'network'},/connection/],[{stale:true},/session has expired/],[{role:'portfolio_manager'},/Only the verified master/],[{role:'billing_person'},/Only the verified master/],[{afterRole:'billing_person'},/not authorized/],[{mismatch:true},/not authorized/],[{cleanupError:true},/verification could not be completed/],[{cleanupError:'throw'},/verification could not be completed/]]){
  const f=authFixture(config);await f.submit();assert.equal(f.writes.length,0);assert.equal(f.ctx.PCFG.admin_username,'original');assert.equal(f.ctx.pState.currentUser.username,'original');assert.equal(f.ctx.pState.currentUser.sessionToken,'original-session-marker');assert.equal(f.calls.filter(c=>c[0].startsWith('original-')).length,0);assert.ok(f.calls.filter(c=>c[0]==='cleanup').every(c=>c[1].scope==='local'));assert.equal(f.messages.length,1);assert.equal(f.messages[0][0],'error');assert.match(f.messages[0][1],match);assert.equal(f.ctx.pState.reauthLoading,false);
 }
 const missing=authFixture();missing.ctx.pState.turnstileToken=null;await missing.submit();assert.equal(missing.calls.filter(c=>c[0]==='verify').length,0);assert.equal(missing.writes.length,0);assert.match(missing.messages[0][1],/fresh verification/);
});
test('failed or zero-row username update never updates the cached alias or displays success',async()=>{
 for(const result of [{error:{message:'internal secret'}},{data:null},{data:{id:1,admin_username:'unexpected'}}]){
  const f=authFixture();f.original.from=()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:async()=>result})})})});await f.submit();
  assert.equal(f.ctx.PCFG.admin_username,'original');assert.equal(f.ctx.pState.currentUser.username,'original');assert.equal(f.messages[0][0],'error');assert.match(f.messages[0][1],/could not be confirmed/);assert.doesNotMatch(f.messages[0][1],/internal secret/);
 }
});
test('late confirmed username result cannot refill identity after local revocation',async()=>{
 const f=authFixture();let release;f.original.from=()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:()=>new Promise(r=>release=r)})})})});
 const pending=f.submit();while(!release)await new Promise(r=>setTimeout(r,0));f.ctx.clearSensitiveState();release({data:{id:1,admin_username:'new-alias'}});await pending;
 assert.equal(f.ctx.pState.currentUser.username,undefined);assert.equal(f.ctx.PCFG.admin_username,'original');assert.ok(!f.messages.some(m=>m[0]==='success'));
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
  await submit({newpass:'StrongSynthetic1!',confirm:'StrongSynthetic1!'});assert.equal(updates,0);assert.equal(signouts,0);
  f.original.auth.updateUser=async values=>{assert.equal(values.current_password,'wrong-current');return {error:{code:'current_password_mismatch'}};};await submit({current:'wrong-current',newpass:'StrongSynthetic1!',confirm:'StrongSynthetic1!'});assert.equal(signouts,0);assert.equal(f.ctx.pState.authenticated,true);
  f.original.auth.updateUser=async values=>{assert.equal(values.current_password,'correct-current');updates++;return{};};await submit({current:'correct-current',newpass:'StrongSynthetic1!',confirm:'StrongSynthetic1!'});assert.equal(updates,1);assert.equal(signouts,1);assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.page,'login');
 }
});
test('team invitation/edit handlers retain server boundaries, role denial and idempotent invitation messaging',async()=>{
 const f=authFixture();const invocations=[];f.original.functions={invoke:async(name,{body})=>{invocations.push({name,body});return {data:{success:true,already_invited:true}};}};f.ctx.loadPlatform=async()=>{};
 const submit=(type,values)=>f.ctx.handleFormSubmit({target:{dataset:{pForm:type},values},preventDefault(){}});
 for(const role of ['portfolio_manager','billing_person']){f.ctx.pState.currentUser={role};await submit('add-platform-user',{});await submit('edit-platform-user',{});}assert.equal(invocations.length,0);
 f.ctx.pState.currentUser=identity;f.ctx.pState.modal={data:{requestId:'synthetic-request'}};await submit('add-platform-user',{email:'fixture@example.test',name:'Fixture',role:'billing_person'});assert.equal(invocations[0].name,'create-platform-user');assert.match(f.messages.at(-1)[1],/No new invitation email/);
 f.ctx.pState.modal={data:{requestId:'synthetic-edit-request'}};await submit('edit-platform-user',{id:'row-42',name:'Fixture',email:'fixture@example.test',role:'portfolio_manager'});assert.equal(invocations[1].name,'update-platform-user');assert.equal(invocations[1].body.id,'row-42');
});
test('F3 invitation fixture uses real initial state and only confirms the latest retired predecessor',async()=>{
 for(const kind of ['ordinary','retired-approved','retired-cancelled','live-duplicate','wrong-predecessor','unloaded-malformed']){
  const f=authFixture(),sent=[],confirmed=[];const email='fixture@example.test';
  const archive=[{id:'latest-retired',email,deleted_at:'2026-10-14'},{id:'older-retired',email:email.toUpperCase(),deleted_at:'2026-10-13'}];
  if(kind==='wrong-predecessor')archive[0].id='stale-predecessor';
  f.ctx.pState.modal={data:{requestId:'synthetic-request'}};f.ctx.loadPlatform=async()=>{};
  if(kind.startsWith('retired') || kind==='wrong-predecessor')f.ctx.pState.data.teamArchive=structuredClone(archive);
  if(kind==='live-duplicate')f.ctx.pState.data.platformUsers=[{id:'live',email,status:'Active'}];
  if(kind==='unloaded-malformed'){f.ctx.pState.dataReady=false;delete f.ctx.pState.data;}
  f.ctx.confirmDialog=async options=>{confirmed.push(options);return kind!=='retired-cancelled';};
  f.original.functions={invoke:async(name,{body})=>{
   sent.push({name,body});
   const denied=kind==='live-duplicate' || (kind==='wrong-predecessor' && body.retired_employee_id!=='latest-retired');
   return denied?{data:{code:'invitation_unavailable',review_required:false}}:{data:{success:true}};
  }};
  await f.ctx.handleFormSubmit({target:{dataset:{pForm:'add-platform-user'},values:{email,name:'Fixture',role:'billing_person'}},preventDefault(){}});
  if(['retired-cancelled','unloaded-malformed'].includes(kind)){assert.equal(sent.length,0);continue;}
  assert.equal(sent.length,1);assert.equal(sent[0].name,'create-platform-user');assert.equal(sent[0].body.request_id,'synthetic-request');
  if(kind==='ordinary' || kind==='live-duplicate'){assert.equal(confirmed.length,0);assert.equal(sent[0].body.retired_employee_id,undefined);}
  else{assert.equal(confirmed.length,1);assert.equal(confirmed[0].confirmLabel,'Invite fresh employee');assert.equal(sent[0].body.retired_employee_id,kind==='wrong-predecessor'?'stale-predecessor':'latest-retired');assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.pState.data.teamArchive)),archive);}
  assert.equal(f.messages.some(m=>m[0]==='success'),!['live-duplicate','wrong-predecessor'].includes(kind));
  if(['live-duplicate','wrong-predecessor'].includes(kind))assert.match(f.messages.at(-1)[1],/Review request/);
 }
});
function removalFixture() {
 let click,resolve,calls=0;const element={dataset:{pAction:'delete-platform-user',pId:'row-42'},isConnected:true,disabled:false};
 const state={authenticated:true,currentUser:identity,data:{platformUsers:[{id:'row-42',name:'Fixture',email:'fixture@example.test',role:'billing_person'}]}};
 const ctx={pState:state,crypto:{randomUUID:()=> 'synthetic-request'},window:{addEventListener(){}},document:{getElementById:()=>null,addEventListener:(type,fn)=>{if(type==='click')click=fn;}},setInterval(){},notify:{error(){},success(){}},deleteUserDialog:()=>new Promise(r=>resolve=r),loadOperatorIdentity:async()=>identity,loadPlatform:async()=>{},render(){},pb:{functions:{invoke:async()=>{calls++;return {data:{success:true}};}}}};
 vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();
 const event={target:{closest:selector=>selector.includes('data-auth-form')?null:element},preventDefault(){}};
 return {ctx,element,click:()=>click(event),finish:value=>resolve(value),calls:()=>calls};
}
test('permanent deletion waits for custom password/CAPTCHA dialog, blocks repeated clicks and cancels safely',async()=>{
 for(const accept of [false,true]){
  const f=removalFixture();f.click();f.click();assert.equal(f.element.disabled,true);assert.equal(f.calls(),0);await new Promise(r=>setImmediate(r));f.finish(accept?{password:'Synthetic1!',captchaToken:'synthetic',acknowledged:true}:null);await new Promise(r=>setImmediate(r));assert.equal(f.calls(),accept?1:0);assert.equal(f.element.disabled,false);
 }
 const denied=removalFixture();denied.ctx.loadOperatorIdentity=async()=>({role:'billing_person'});denied.click();await new Promise(r=>setImmediate(r));assert.equal(denied.calls(),0);
});
test('activation and rotation await decisions without changing request identities or sending cancelled operations',async()=>{
 for(const [action,accepted] of [['activate',false],['rotate',false],['rotate',true],['resume',true]]){
  let resolve;const calls=[],button={disabled:false,isConnected:true};const job={action:'rotate',request_id:'original-request',params:{}};
  const ctx={pState:{authenticated:true,currentUser:identity,clientRequestGeneration:0,selectedClient:{id:42},clientData:{clientId:42,requestGeneration:0,config:{id:42},provisioning:{job}}},notify:{error(){}},confirmDialog:()=>new Promise(r=>resolve=r),crypto:{randomUUID:()=> 'new-request'},loadClientData:async()=>{},render(){},pb:{functions:{invoke:async(name,{body})=>{calls.push(body);return{};}}}};
  vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/provisioning.js')),ctx);
  const form={elements:{confirmed:{checked:true},note:{value:'Approved test-only cutover'}},querySelectorAll:()=>[button]};const promise=ctx.submitProvisioning(form,action);assert.equal(button.disabled,true);assert.equal(calls.length,0);resolve(accepted);await promise;
  assert.equal(calls.length,accepted?1:0);assert.equal(button.disabled,false);if(accepted)assert.equal(calls[0].request_id,action==='resume'?'original-request':'new-request');
 }
});
test('billing confirmation cancellation never prints and confirmation prints once',()=>{
 const handlers={};let prints=0;const client={id:42,currency_symbol:'USD'},invoice={id:7,client_id:42};
 const ctx={pState:{authenticated:true,currentUser:{role:'billing_person',auth_user_id:'synthetic-billing',session_id:'synthetic-session'},dataReady:true,data:{clients:[client],usage:[],payments:[]}},esc:String,getInvoicePayments:()=>[],getInvoicePaidTotal:()=>0,buildInvoiceHTML:()=>'<p>Synthetic preview</p>',printInNewWindow:()=>prints++,
  registerPrivateDialog:()=>()=>{},document:{getElementById:selector=>({addEventListener:(type,fn)=>handlers[selector]=fn}),createElement:()=>({style:{},addEventListener(){},remove(){}}),body:{appendChild(){}}}};
 vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);const source=read('src/billing.js');vm.runInContext(source.slice(source.indexOf('function showInvoiceConfirmModal')),ctx);
 ctx.showInvoiceConfirmModal(invoice);handlers['invoice-confirm-cancel']();assert.equal(prints,0);ctx.showInvoiceConfirmModal(invoice);handlers['invoice-confirm-print']();assert.equal(prints,1);
});
test('complete application sources contain no native alert, confirm or prompt calls or dynamic wrappers',()=>{
 const files=readdirSync(new URL('../src',import.meta.url),{recursive:true}).filter(p=>/\.(js|html)$/.test(p));
 for(const file of files){const s=read('src/'+file);assert.doesNotMatch(s,/\b(?:alert|confirm|prompt)\s*\(/,file);assert.doesNotMatch(s,/window\s*\[\s*['"](?:alert|confirm|prompt)['"]/ ,file);}
});

test('client suspension/reactivation retain the canonical lifecycle RPC, reason and selected target',async()=>{
 for(const action of ['suspend','reactivate']){
  const f=authFixture();const calls=[];f.ctx.pState.selectedClient={id:42};f.ctx.pState.clientRequestGeneration=0;f.ctx.pState.clientData={clientId:42,requestGeneration:0,config:{id:42}};f.ctx.rpc=async(name,args)=>calls.push({name,args});f.ctx.loadPlatform=async()=>{};f.ctx.loadClientData=async()=>{};
  await f.ctx.handleFormSubmit({preventDefault(){},submitter:{value:action},target:{dataset:{pForm:'client-lifecycle'},elements:{reason:{value:'Approved fixture reason'}}}});
  assert.equal(calls.length,1);assert.equal(calls[0].name,'platform_client_lifecycle');assert.equal(calls[0].args.p_client,42);assert.equal(calls[0].args.p_action,action);assert.equal(calls[0].args.p_reason,'Approved fixture reason');
 }
});
test('unresolved recovery requires acknowledgment before refresh and preserves the original recovery request',async()=>{
 const f=authFixture();let acknowledge,refreshes=0;const calls=[];f.ctx.pState.clientRequestGeneration=0;f.ctx.pState.selectedClient={id:42};f.ctx.pState.clientData={clientId:42,requestGeneration:0,config:{id:42}};
 f.original.functions={invoke:async(name,args)=>{calls.push({name,args});return{data:{state:'unresolved'}};}};
 f.ctx.showMessage=()=>new Promise(r=>acknowledge=r);f.ctx.loadPlatform=async()=>refreshes++;f.ctx.loadClientData=async()=>{};
 const promise=f.ctx.handleFormSubmit({preventDefault(){},submitter:{value:'reconcile'},target:{dataset:{pForm:'config-recovery'},elements:{request_id:{value:'original-request'},reason:{value:'Read-back reconciliation'}}}});
 await new Promise(r=>setImmediate(r));assert.equal(refreshes,0);assert.equal(calls.length,1);assert.equal(calls[0].args.body.request_id,'original-request');acknowledge(true);await promise;assert.equal(refreshes,1);assert.equal(calls.length,1);
});
