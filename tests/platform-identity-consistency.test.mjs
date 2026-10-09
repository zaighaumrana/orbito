import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const identity={auth_user_id:'existing-uuid',email:'existing-master@example.test',username:'existing-alias',role:'master_admin',isMember:false};
const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');
const clickBlock=action=>read('src/events.js').split(`if (action === "${action}") {`)[1].split('\n    /*')[0];

test('existing real-email master login and alias login use Auth credentials then server identity',async()=>{
 for(const [name,aliasEmail,success] of [[identity.email,undefined,true],['existing-alias',identity.email,true],['wrong-alias',identity.email,false]]){
  const attempts=[],errorEl={classList:{add(){},remove(){}},textContent:''};
  const ctx={action:'do-login',PLATFORM_AUTH_EMAIL:aliasEmail,navigator:{onLine:true},crypto:{randomUUID:()=> 'session'},
   pState:{turnstileToken:'public-test-token',loginLoading:false},captchaBusy(){},render(){},_loginFail(){},
   document:{getElementById:id=>id==='platform-username'?{value:name}:id==='platform-pin'?{value:'Auth-only-password'}:errorEl},
   loadOperatorIdentity:async()=>identity,loadConfig:async()=>{},loadPlatform:async()=>{},
   pb:{auth:{signOut:async()=>{},signInWithPassword:async input=>{attempts.push(input);return {data:{session:{user:{id:identity.auth_user_id}}}};}}}};
  ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);
  const block=clickBlock('do-login');
  await vm.runInContext('async function login(){'+block+'\nlogin()',ctx);
  assert.equal(attempts[0].email,identity.email);assert.equal(Boolean(ctx.pState.authenticated),success);
  if(success){assert.equal(ctx.pState.currentUser.auth_user_id,identity.auth_user_id);assert.equal(ctx.pState.currentUser.role,'master_admin');}
 }
});

test('restored real-email master session uses verified identity without VITE alias inference',async()=>{
 let checked=0;
 const ctx={URLSearchParams,window:{location:{search:'',pathname:'/settings'},addEventListener(){}},document:{addEventListener(){}},
  pState:{page:'login',authenticated:false},render(){},initEvents(){},validateSession:async()=>{},loadConfig:async()=>{},loadPlatform:async()=>{},
  loadOperatorIdentity:async()=>{checked++;return identity;},alert:message=>{throw Error(message)},
  pb:{auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:identity.auth_user_id,email:identity.email}}}}),signOut:async()=>{}}}};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);await vm.runInContext(strip(read('src/main.js')),ctx);
 assert.equal(checked,1);assert.equal(ctx.pState.authenticated,true);assert.equal(ctx.pState.currentUser.auth_user_id,identity.auth_user_id);assert.equal(ctx.pState.page,'settings');
});

test('alias edit reauthenticates actual Auth email; password changes only use Auth',async()=>{
 const auth=[],writes=[];
 const ctx={pState:{authenticated:true,turnstileToken:'fresh-test-token'},PCFG:{},reauthenticateMaster:async (password,captchaToken)=>{auth.push(['reauth',{email:identity.email,password,captchaToken}]);return identity;},captchaBusy(){},resetTurnstile(){},render(){},alert(){},
  FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values);}},
  pb:{auth:{signInWithPassword:async value=>{auth.push(['reauth',value]);return{};},updateUser:async value=>{auth.push(['password',value]);return{};},signOut:async()=>{}},
   from:table=>({update:value=>({eq:()=>({select:()=>({maybeSingle:async()=>{writes.push({table,value});return{data:{id:1,...value}};}})})})})}};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);vm.runInContext(strip(read('src/forms.js')),ctx);
 const submit=(type,values)=>ctx.handleFormSubmit({preventDefault(){},target:{dataset:{pForm:type},values,reset(){}}});
 await submit('change-username',{current:'Auth-only-password',new_username:'new-alias'});
 assert.equal(auth[0][1].email,identity.email);assert.equal(writes[0].table,'platform_config');assert.deepEqual(Object.keys(writes[0].value),['admin_username']);
 await submit('change-password',{newpass:'NewAuthPassword1!',confirm:'NewAuthPassword1!'});
 assert.equal(auth[1][0],'password');assert.equal(auth[1][1].password,'NewAuthPassword1!');assert.equal(writes.length,1);
});

test('recovery targets entered Auth email and establishes password only in Auth',async()=>{
 const calls=[];const nodes=Object.fromEntries(['forgot-email','forgot-status','reset-newpass','reset-confirm','reset-status'].map(k=>[k,{value:k==='forgot-email'?identity.email:'NewAuthPassword1!',textContent:'',style:{cssText:''},classList:{remove(){}}}]));
 const ctx={navigator:{onLine:true},window:{location:{origin:'https://platform.example.test'}},pState:{turnstileToken:'public-test-token'},document:{getElementById:id=>nodes[id]},render(){},captchaBusy(){},setTimeout(){},
  pb:{auth:{resetPasswordForEmail:async(...args)=>{calls.push(['reset',...args]);return{};},updateUser:async value=>{calls.push(['password',value]);return{};},getUser:async()=>({data:{user:{email:identity.email}}}),signOut:async()=>{}},rpc:async name=>calls.push(['rpc',name])}};
 ctx.cancelDialogs ||= ()=>{}; ctx.notify ||= {error:message=>assert.fail(String(message)),success:()=>{},info:()=>{}}; vm.createContext(ctx);
 await vm.runInContext('async function reset(){'+clickBlock('send-reset-link')+'\nreset()',ctx);
 await vm.runInContext('async function confirm(){'+clickBlock('confirm-reset-password')+'\nconfirm()',ctx);
 assert.equal(calls[0][1],identity.email);assert.equal(calls[1][0],'password');assert.equal(calls[1][1].password,'NewAuthPassword1!');assert.equal(calls[2][1],'platform_accept_invite');
});

test('checkpoint preserves deployed operator_role rather than installing a placeholder master',()=>{
 for(const file of ['20261001100000_onboarding_v2_client_write_grants.sql','20261001120000_onboarding_stabilization.sql']){
  const source=read('supabase/migrations/'+file);assert.doesNotMatch(source,/create(?: or replace)? function platform_private\.operator_role|insert into auth\.users|platformadmin@retailos\.internal/);
 }
 assert.match(read('supabase/migrations/20261001120000_onboarding_stabilization.sql'),/r:=platform_private\.operator_role\(\)/);
});
