// Actual diagnostic/identity source with synthetic Auth boundaries. Native
// provider policy and hosted refresh behavior require separate acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(options={}){
 const calls=[],identity={auth_user_id:'synthetic-master',role:'master_admin',email:'master@example.test',session_id:'original-session',password_verification_safe:false};
 const original={auth:{getUser:async()=>({data:{user:{id:identity.auth_user_id}}}),refreshSession:async()=>{calls.push('original-refresh');return options.refreshError || options.duringRefreshError && !calls.includes('temporary-cleanup')?{error:{}}:{data:{session:{user:{id:identity.auth_user_id}}}};},signInWithPassword(){throw Error('Original sign-in forbidden');},signOut(){throw Error('Original signout forbidden');}},rpc:async name=>{calls.push(name);if(name==='platform_account_access_notice')return {data:{auth_user_id:options.noticeMismatch?'other':identity.auth_user_id,inactive:options.inactive===true}};return options.canonicalDenied || options.singleSession && calls.includes('temporary-signin')?{error:{}}:{data:{...identity,role:options.role || 'master_admin'}};}};
 const temporary={auth:{signInWithPassword:async()=>{calls.push('temporary-signin');if(options.gate)await options.gate;return options.error?{error:{code:options.error}}:{data:{session:{},user:{id:options.wrongUser?'other':identity.auth_user_id}}};},signOut:async args=>{assert.equal(args.scope,'local');calls.push('temporary-cleanup');return {error:options.cleanupError?{}:null};}},rpc:async()=>({data:{...identity,session_id:'temporary-session'}})};
 let count=0;
 const ctx={TypeError,localStorage:{getItem(){}},navigator:{onLine:true},testEnv:{VITE_PLATFORM_URL:'https://fixture.invalid',VITE_PLATFORM_ANON:'synthetic-public'},createClient:(_url,_key,config)=>{calls.push(config || 'original-client');return count++?temporary:original;}};
 vm.createContext(ctx);for(const file of ['src/state.js','src/async-context.js','src/supabase.js'])vm.runInContext(strip(read(file))+(file==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 Object.assign(ctx.pState,{authenticated:true,currentUser:{...identity}});
 return {ctx,calls,identity,original,run:()=>ctx.diagnoseMasterSession('Synthetic1!','fresh-captcha')};
}
test('diagnostic works with deletion policy OFF, cleans only its separate session, then verifies original refresh and canonical session',async()=>{
 const f=fixture();assert.equal((await f.run()).success,true);
 const options=f.calls.find(c=>typeof c==='object');assert.equal(options.auth.persistSession,false);assert.equal(options.auth.autoRefreshToken,false);assert.equal(options.auth.detectSessionInUrl,false);
 assert.ok(f.calls.indexOf('original-refresh')<f.calls.indexOf('temporary-cleanup'));
 assert.ok(f.calls.indexOf('temporary-cleanup')<f.calls.lastIndexOf('original-refresh'));
 assert.equal(f.ctx.pState.currentUser.session_id,'original-session');assert.equal(f.ctx.pState.currentUser.password_verification_safe,false);
 assert.equal(f.calls.filter(c=>c==='original-refresh').length,2);
});
test('diagnostic rejects wrong password/CAPTCHA, wrong identity, cleanup failure, single-session revocation, refresh failure and ordinary roles',async()=>{
 for(const options of [{error:'invalid_credentials'},{error:'captcha_failed'},{wrongUser:true},{cleanupError:true},{singleSession:true},{duringRefreshError:true},{refreshError:true},{role:'portfolio_manager'},{role:'billing_person'}]){
  const f=fixture(options);await assert.rejects(f.run());
  const started=f.calls.includes('temporary-signin');
  assert.equal(f.calls.includes('temporary-cleanup'),started&&!options.error);
  assert.equal(f.ctx.pState.currentUser.password_verification_safe,false);
 }
});
test('logout/successor while temporary sign-in is pending still cleans its session and cannot refresh or alter the successor',async()=>{
 let release;const f=fixture({gate:new Promise(r=>release=r)}),pending=f.run();
 while(!f.calls.includes('temporary-signin'))await new Promise(r=>setImmediate(r));
 f.ctx.clearSensitiveState();f.ctx.pState.authenticated=true;f.ctx.pState.currentUser={...f.identity,session_id:'successor-session'};
 release();await assert.rejects(pending);assert.ok(f.calls.includes('temporary-cleanup'));assert.ok(!f.calls.includes('original-refresh'));
 assert.equal(f.ctx.pState.currentUser.session_id,'successor-session');assert.equal(f.ctx.pState.authenticated,true);
});
test('specific suspension notice requires verified matching own identity; unknown/mismatched status stays generic',async()=>{
 for(const [options,expected] of [[{canonicalDenied:true,inactive:true},'suspended'],[{canonicalDenied:true},'authority'],[{canonicalDenied:true,inactive:true,noticeMismatch:true},'authority']]){
  const f=fixture(options);await assert.rejects(f.ctx.loadOperatorIdentity(),e=>e.code===expected);
 }
 const f=fixture({inactive:true});f.original.auth.getUser=async()=>({error:{},data:{}});await assert.rejects(f.ctx.loadOperatorIdentity(),e=>e.code==='session');assert.ok(!f.calls.includes('platform_account_access_notice'));
});
