// Rendered markup and real delegated handlers; not hosted/browser validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderContext(state={}) {
 const app={innerHTML:''};
 const ctx={pState:{page:'login',authenticated:false,currentUser:{role:'master_admin',email:'master@example.test'},data:{clients:[],support:[],platformUsers:[]},...state},PCFG:{admin_username:'Alias'},esc:escape,
  document:{getElementById:()=>app,documentElement:{dataset:{}}},cleanupTurnstile(){},mountTurnstile(){},tit:()=>'',getNav:()=>[],pModal:()=>'',history:{pushState(){}},window:{location:{pathname:'/'}},
  pageOverview:()=>'',pageClients:()=>'',pageClientDetail:()=>'',pageBilling:()=>'',pageSupport:()=>'',syncModalFocus(){},resetModalFocus(){},teamRoles:{master_admin:'Master Admin',portfolio_manager:'Portfolio Manager',billing_person:'Billing Person'}};
 vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/pages/settings.js')),ctx);vm.runInContext(strip(read('src/render.js')),ctx);
 return {ctx,app};
}
function checkPasswordForms(html) {
 const forms=[...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
 const allPasswords=[...html.matchAll(/<input\b[^>]*type="password"[^>]*>/g)].length;
 let checked=0;
 for(const [,attributes,form] of forms){
  assert.doesNotMatch(form,/<form\b/,'Forms must not be nested');
  const passwords=[...form.matchAll(/<input\b[^>]*type="password"[^>]*>/g)];
  if(!passwords.length)continue;
  assert.match(attributes,/method="post"/,'Native fallback must not put passwords in a URL');
  assert.match(form,/<input\b[^>]*autocomplete="username"/,'Password form needs an account association');
  for(const [input] of passwords){assert.match(input,/name="[^"]+"/);assert.match(input,/autocomplete="(?:current|new)-password"/);
   assert.ok([...form.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].some(([,label])=>label.includes(input)),'Password input needs an accessible label');checked++;}
 }
 assert.equal(checked,allPasswords,'Every password input must belong to a form');assert.ok(checked>0);
}
test('login/PIN and recovery markup have named, labelled password forms without nested forms',()=>{
 const {ctx,app}=renderContext();ctx.render();checkPasswordForms(app.innerHTML);
 assert.match(app.innerHTML,/<form data-auth-form="login"/);assert.match(app.innerHTML,/id="platform-pin"[^>]*aria-describedby="platform-pin-error"/);
 assert.match(app.innerHTML,/id="platform-pin-error"[^>]*role="alert"/);
 assert.equal([...app.innerHTML.matchAll(/type="submit"/g)].length,1);
 ctx.pState.page='reset-password';ctx.pState.recoveryEmail='a"<b@example.test';ctx.render();checkPasswordForms(app.innerHTML);
 assert.match(app.innerHTML,/value="a&quot;&lt;b@example.test"/);assert.doesNotMatch(app.innerHTML,/value="a"<b/);
});
test('master and ordinary Settings password forms associate the actual account without changing submitted authorization',()=>{
 for(const role of ['master_admin','portfolio_manager','billing_person']){
  const {ctx}=renderContext({currentUser:{role,email:'account"@example.test'}});const html=ctx.pageSettings();checkPasswordForms(html);
  assert.match(html,/autocomplete="username" readonly value="account&quot;@example.test"/);
  if(role==='master_admin'){assert.match(html,/data-p-form="change-username"/);assert.match(html,/data-p-form="change-password"/);}
  else assert.match(html,/data-p-form="change-own-password"/);
 }
});

test('confirmed alias state renders consistently in sidebar and Settings as safe text',()=>{
 const alias='<new-alias>';
 const {ctx,app}=renderContext({authenticated:true,page:'settings',currentUser:{role:'master_admin',email:'master@example.test',username:alias}});
 ctx.PCFG.admin_username=alias;ctx.render();
 assert.match(app.innerHTML,/Signed in as[\s\S]*?<strong[^>]*>\s*&lt;new-alias&gt;\s*<\/strong>/);
 assert.match(app.innerHTML,/name="new_username"[^>]*value="&lt;new-alias&gt;"/);
 assert.doesNotMatch(app.innerHTML,/<new-alias>/);
});
test('mouse and native Auth submit each invoke the existing login once; disabled and unrelated forms do not invoke login',async()=>{
 for(const mode of ['click','submit']){
  const listeners={},attempts=[],errorEl={classList:{add(){},remove(){}},textContent:''};let prevented=0;
  const button={disabled:false,dataset:{pAction:'do-login'},closest(){return this;},click(){listeners.click({target:this,preventDefault(){prevented++;}});}};
  const form={dataset:{authForm:'login'},querySelector:()=>button};
  const ctx={pState:{authenticated:false,authorityGeneration:0,turnstileToken:'synthetic-captcha'},navigator:{onLine:true},crypto:{randomUUID:()=> 'synthetic-session'},
   document:{addEventListener:(type,fn)=>listeners[type]=fn,getElementById:id=>id==='platform-username'?{value:'master@example.test'}:id==='platform-pin'?{value:'SyntheticPassword1!'}:errorEl},window:{addEventListener(){}},
   setInterval(){},render(){},captchaBusy(){},resetTurnstile(){},mountTurnstile(){},alert:message=>{throw Error(message)},
   loadConfig:async()=>{},loadPlatform:async()=>{},loadOperatorIdentity:async()=>({role:'master_admin',auth_user_id:'master',email:'master@example.test'}),
   pb:{rpc:async()=>({data:{kind:'active'}}),auth:{signOut:async()=>{},signInWithPassword:async input=>{attempts.push(input);return {data:{session:{}}};}}}};
  ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();
  if(mode==='click')button.click();else listeners.submit({target:form,submitter:button,preventDefault(){prevented++;}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts.length,1);assert.equal(attempts[0].options.captchaToken,'synthetic-captcha');assert.equal(ctx.pState.authenticated,true);assert.ok(prevented>0);
  listeners.keydown({key:'Enter',target:{},preventDefault(){throw Error('Unrelated Enter intercepted');}});
  assert.equal(attempts.length,1,'Tab navigation must not intercept native Auth Enter submission');
  button.disabled=true;listeners.submit({target:form,preventDefault(){}});
  listeners.submit({target:{dataset:{pForm:'change-password'}},preventDefault(){throw Error('Unrelated form intercepted');}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts.length,1);
 }
});
test('main dispatcher leaves Auth submission to its dedicated handler and recovery account comes from the recovery session',async()=>{
 let submit,authChange,calls=0;const createSetupRouter=({state})=>({boot:async()=>false,event:(_event,session)=>{state.recoveryEmail=session.user.email;state.authenticated=false;}});
 const ctx={createSetupRouter,URLSearchParams,window:{location:{search:'',pathname:'/'},addEventListener(){}},document:{addEventListener:(_type,fn)=>submit=fn},pState:{},render(){},initEvents(){},handleFormSubmit:async()=>{calls++;},
  pb:{auth:{onAuthStateChange:fn=>authChange=fn,getSession:async()=>({data:{session:null}})}},alert:message=>{throw Error(message)}};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);await vm.runInContext(strip(read('src/main.js')),ctx);
 await submit({target:{dataset:{authForm:'login'}},preventDefault(){throw Error('Main intercepted Auth form');}});assert.equal(calls,0);
 await submit({target:{dataset:{pForm:'change-password'}},preventDefault(){}});assert.equal(calls,0,'Logged-out forms must not submit');
 ctx.pState.authenticated=true;await submit({target:{dataset:{pForm:'change-password'}},preventDefault(){}});assert.equal(calls,1);
 authChange('PASSWORD_RECOVERY',{user:{email:'recovery@example.test'}});assert.equal(ctx.pState.recoveryEmail,'recovery@example.test');assert.equal(ctx.pState.authenticated,false);
});
test('expired-session timer signs out and renders login using its injected callback',async()=>{
 let timer,renders=0,signouts=0;
 const ctx={pState:{authenticated:true,page:'clients',authorityGeneration:0},PCFG:{},clearSensitiveState(){ctx.pState.authenticated=false;ctx.pState.authorityGeneration++;},pb:{rpc:async()=>({data:{authorized:false}}),auth:{signOut:async options=>{assert.equal(options.scope,'local');signouts++;}}},render(){renders++;},
  document:{addEventListener(){}},window:{addEventListener(){}},setInterval:fn=>timer=fn};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);vm.runInContext(strip(read('src/helpers.js')),ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();await timer();
 assert.equal(signouts,1);assert.equal(renders,1);assert.equal(ctx.pState.page,'login');assert.equal(ctx.pState.authenticated,false);
 await timer();assert.equal(signouts,1);assert.equal(renders,1);
});
test('Cloudflare SPA build has no redundant rewrite or top-level custom 404',()=>{
 assert.equal(existsSync(new URL('../public/_redirects',import.meta.url)),false);
 assert.equal(existsSync(new URL('../public/404.html',import.meta.url)),false);
});

test('invoice presentation uses the official stable logo and retains monetary values and currency',()=>{
 const ctx={esc:escape};vm.createContext(ctx);const source=read('src/billing.js');
 vm.runInContext(source.slice(source.indexOf('function buildInvoiceHTML'),source.indexOf('// ── Print invoice')),ctx);
 const html=ctx.buildInvoiceHTML({name:'Synthetic Client',plan:'Pro',currency_symbol:'USD'},
  {id:7,period_start:'2026-10-01',period_end:'2026-10-14',created_at:'2026-10-14',total_due:123,bill_charge:123,remaining_balance:123,payment_status:'Unpaid'},[],0,[],false);
 assert.match(html,/\/brand\/logos\/retrasell-horizontal-primary.svg/);assert.match(html,/Generated by RetraSell Platform/);assert.doesNotMatch(html,/RetailOS/);
 assert.match(html,/USD 123/);assert.match(html,/INV-7/);assert.match(html,/2026-10-01/);
});

function printFixture({cached=false,emptyFonts=false}={}) {
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 const imageReady=deferred(),fontLoad=deferred(),fontReady=deferred(),timeouts=new Map(),intervals=new Map(),handlers={};let timerId=0;
 const result={prints:0,closes:0,errors:[],html:'',fontRequests:[]};
 const image={complete:cached,naturalWidth:cached?180:0,decode:()=>imageReady.promise};
 const popup={closed:false,document:{open(){},write(value){result.html=value;},close(){},images:[image],fonts:{load(value){result.fontRequests.push(value);return fontLoad.promise.then(()=>emptyFonts?[]:[{status:'loaded'}]);},ready:fontReady.promise}},
  focus(){},print(){result.prints++;},close(){if(!popup.closed){popup.closed=true;result.closes++;handlers.pagehide?.();}},addEventListener(name,fn){handlers[name]=fn;},removeEventListener(name){delete handlers[name];}};
 const ctx={esc:escape,pState:{authenticated:true,currentUser:{role:'billing_person',auth_user_id:'synthetic-billing',session_id:'synthetic-session'}},
  window:{location:{origin:'https://synthetic.example.test'},open:()=>popup,addEventListener(){},removeEventListener(){}},notify:{error(message){result.errors.push(message);}},
  setTimeout(fn){const id=++timerId;timeouts.set(id,fn);return id;},clearTimeout(id){timeouts.delete(id);},
  setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);}};
 vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);const source=read('src/billing.js');vm.runInContext(source.slice(source.indexOf('function printInNewWindow'),source.indexOf('// ── Print invoices')),ctx);
 return {ctx,popup,result,imageReady,fontLoad,fontReady,timeouts,intervals,
  start:()=>ctx.printInNewWindow('<p>Synthetic invoice USD 123</p>'),
  image:()=>{image.naturalWidth=180;imageReady.resolve();},fonts:()=>{fontLoad.resolve();fontReady.resolve();},
  flush:()=>new Promise(r=>setImmediate(r)),poll:()=>{for(const fn of [...intervals.values()])fn();},timeout:()=>{for(const fn of [...timeouts.values()])fn();}};
}
test('invoice print loads the four local Inter weights and waits for fonts and logo in either order, including cached assets',async()=>{
 for(const order of ['fonts-first','image-first','cached']){
  const f=printFixture({cached:order==='cached'});f.start();
  for(const weight of [400,500,600,700])assert.match(f.result.html,new RegExp('https://synthetic\\.example\\.test/brand/fonts/Inter-'+weight+'\\.woff2'));
  assert.equal(f.result.fontRequests.length,4);assert.equal(f.result.prints,0);
  if(order==='image-first')f.image();else f.fonts();await f.flush();
  if(order!=='cached')assert.equal(f.result.prints,0,'One asset group alone cannot print');
  f.image();f.fonts();await f.flush();f.image();f.fonts();f.poll();f.timeout();await f.flush();
  assert.equal(f.result.prints,1);assert.equal(f.result.closes,1);assert.deepEqual(f.result.errors,[]);
  assert.equal(f.timeouts.size+f.intervals.size,0,'All readiness timers are released');
 }
});
test('invoice print asset failures and unresolved font or image readiness have a bounded, single failure',async()=>{
 for(const failure of ['image','font','no-font-face','font-timeout','image-timeout']){
  const f=printFixture({emptyFonts:failure==='no-font-face'});f.start();
  if(failure==='image')f.imageReady.reject(Error('Synthetic decode failure'));else if(failure!=='image-timeout')f.image();
  if(failure==='font')f.fontLoad.reject(Error('Synthetic font failure'));else if(failure!=='font-timeout')f.fonts();
  await f.flush();if(failure.endsWith('timeout'))f.timeout();await f.flush();
  f.image();f.fonts();f.timeout();f.poll();await f.flush();
  assert.equal(f.result.prints,0,failure);assert.equal(f.result.closes,1,failure);assert.equal(f.result.errors.length,1,failure);
  assert.equal(f.timeouts.size+f.intervals.size,0);
 }
});
test('pending invoice printing is cancelled on popup close or lost session, role or identity without touching a successor',async()=>{
 for(const cancellation of ['closed','close-rejection','logout','role','identity']){
  const f=printFixture();f.start();
  if(cancellation==='closed')f.popup.close();
  else if(cancellation==='close-rejection'){f.popup.closed=true;f.result.closes++;f.fontLoad.reject(Error('Closed document'));await f.flush();}
  else if(cancellation==='logout')f.ctx.pState.authenticated=false;
  else if(cancellation==='role')f.ctx.pState.currentUser.role='portfolio_manager';
  else f.ctx.pState.currentUser.auth_user_id='successor';
  f.poll();f.image();f.fonts();await f.flush();
  assert.equal(f.result.prints,0,cancellation);assert.equal(f.result.closes,1,cancellation);assert.deepEqual(f.result.errors,[]);
  assert.equal(f.timeouts.size+f.intervals.size,0);
  if(cancellation==='identity')assert.equal(f.ctx.pState.currentUser.auth_user_id,'successor');
 }
});
