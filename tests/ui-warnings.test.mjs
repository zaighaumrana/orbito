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
  pageOverview:()=>'',pageClients:()=>'',pageClientDetail:()=>'',pageBilling:()=>'',pageSupport:()=>''};
 vm.createContext(ctx);vm.runInContext(strip(read('src/pages/settings.js')),ctx);vm.runInContext(strip(read('src/render.js')),ctx);
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
test('mouse and native Auth submit each invoke the existing login once; disabled and unrelated forms do not invoke login',async()=>{
 for(const mode of ['click','submit']){
  const listeners={},attempts=[],errorEl={classList:{add(){},remove(){}},textContent:''};let prevented=0;
  const button={disabled:false,dataset:{pAction:'do-login'},closest(){return this;},click(){listeners.click({target:this,preventDefault(){prevented++;}});}};
  const form={dataset:{authForm:'login'},querySelector:()=>button};
  const ctx={pState:{authenticated:false,turnstileToken:'synthetic-captcha'},navigator:{onLine:true},crypto:{randomUUID:()=> 'synthetic-session'},
   document:{addEventListener:(type,fn)=>listeners[type]=fn,getElementById:id=>id==='platform-username'?{value:'master@example.test'}:id==='platform-pin'?{value:'SyntheticPassword1!'}:errorEl},window:{addEventListener(){}},
   setInterval(){},render(){},captchaBusy(){},resetTurnstile(){},mountTurnstile(){},alert:message=>{throw Error(message)},
   loadConfig:async()=>{},loadPlatform:async()=>{},loadOperatorIdentity:async()=>({role:'master_admin',auth_user_id:'master',email:'master@example.test'}),
   pb:{auth:{signOut:async()=>{},signInWithPassword:async input=>{attempts.push(input);return {data:{session:{}}};}}}};
  ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();
  if(mode==='click')button.click();else listeners.submit({target:form,submitter:button,preventDefault(){prevented++;}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts.length,1);assert.equal(attempts[0].options.captchaToken,'synthetic-captcha');assert.equal(ctx.pState.authenticated,true);assert.ok(prevented>0);
  assert.equal(listeners.keydown,undefined,'Native form behavior replaces global Enter interception');
  button.disabled=true;listeners.submit({target:form,preventDefault(){}});
  listeners.submit({target:{dataset:{pForm:'change-password'}},preventDefault(){throw Error('Unrelated form intercepted');}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts.length,1);
 }
});
test('main dispatcher leaves Auth submission to its dedicated handler and recovery account comes from the recovery session',async()=>{
 let submit,authChange,calls=0;
 const ctx={URLSearchParams,window:{location:{search:'',pathname:'/'},addEventListener(){}},document:{addEventListener:(_type,fn)=>submit=fn},pState:{},render(){},initEvents(){},handleFormSubmit:async()=>{calls++;},
  pb:{auth:{onAuthStateChange:fn=>authChange=fn,getSession:async()=>({data:{session:null}})}},alert:message=>{throw Error(message)}};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);await vm.runInContext(strip(read('src/main.js')),ctx);
 await submit({target:{dataset:{authForm:'login'}},preventDefault(){throw Error('Main intercepted Auth form');}});assert.equal(calls,0);
 await submit({target:{dataset:{pForm:'change-password'}},preventDefault(){}});assert.equal(calls,1);
 authChange('PASSWORD_RECOVERY',{user:{email:'recovery@example.test'}});assert.equal(ctx.pState.recoveryEmail,'recovery@example.test');assert.equal(ctx.pState.authenticated,false);
});
test('expired-session timer signs out and renders login using its injected callback',async()=>{
 let timer,renders=0,signouts=0;
 const ctx={pState:{authenticated:true,page:'clients'},PCFG:{},pb:{auth:{getUser:async()=>({data:{user:null}}),signOut:async()=>{signouts++;}}},render(){renders++;},
  document:{addEventListener(){}},window:{addEventListener(){}},setInterval:fn=>timer=fn};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(strip(read('src/helpers.js')),ctx);vm.runInContext(strip(read('src/events.js')),ctx);ctx.initEvents();await timer();
 assert.equal(signouts,1);assert.equal(renders,1);assert.equal(ctx.pState.page,'login');assert.equal(ctx.pState.authenticated,false);
 await timer();assert.equal(signouts,1);assert.equal(renders,1);
});
test('Cloudflare SPA build has no redundant rewrite or top-level custom 404',()=>{
 assert.equal(existsSync(new URL('../public/_redirects',import.meta.url)),false);
 assert.equal(existsSync(new URL('../public/404.html',import.meta.url)),false);
});
