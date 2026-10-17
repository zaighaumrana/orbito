// Actual current server source; reusable fixture imports register no tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fixture,master,target,rowId,requestId} from './helpers/platform-team-fixture.mjs';
import {forbiddenEmailTransport} from './helpers/native-email-guard.mjs';
export {fixture,rowId} from './helpers/platform-team-fixture.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const createBody={name:'New Team',email:'new@example.test',role:'billing_person'};
const privileged=f=>f.calls.filter(c=>c[0]==='client'&&c[1]==='fixture-service');
test('unapproved session continuity blocks deletion before password grant and privileged client',async()=>{const f=fixture({continuityApproved:false}),result=await f.invoke('delete',{id:rowId});assert.equal(result.status,503);assert.equal(result.body.code,'deletion_disabled');assert.equal(result.body.review_required,true);assert.equal(result.body.current_attempt_rejected,true);assert.equal(result.body.operation_state,'unverified');assert.deepEqual(privileged(f),[]);assert.ok(!f.calls.some(c=>c[0]==='password-check'));assert.deepEqual(f.audit,[]);});
for(const role of ['portfolio_manager','billing_person','ordinary','master_admin-forged'])for(const action of ['create','update','delete','deactivate','reactivate'])test(role+' denied '+action+' before privileged client',async()=>{const f=fixture({role});assert.equal((await f.invoke(action,action==='create'?createBody:{id:rowId,name:'Edited'})).status,403);assert.deepEqual(privileged(f),[]);assert.deepEqual(f.audit,[]);});
for(const options of [{user:null},{invalid:true},{user:{id:master,email:'master@example.test'}},{user:{id:master,email:'master@example.test',email_confirmed_at:'2026-10-09',deleted_at:'2026-10-10'}},{user:{id:master,email:'master@example.test',email_confirmed_at:'2026-10-09',banned_until:'2099-01-01'}},{identityError:true},{identity:{auth_user_id:target,role:'master_admin'}}])test('invalid or unconfirmed actor '+JSON.stringify(options),async()=>{const f=fixture(options);assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.deepEqual(privileged(f),[]);});
for(const options of [{passwordError:true},{cleanupError:true},{verifierUser:{id:target,email:'team@example.test',email_confirmed_at:'2026-10-09'}}])test('deletion reauthentication fails closed '+JSON.stringify(options),async()=>{const f=fixture(options);assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.deepEqual(privileged(f),[]);assert.deepEqual(f.audit,[]);});
test('missing password CAPTCHA acknowledgment and reusable flags denied',async()=>{for(const body of [{id:rowId,request_id:requestId},{id:rowId,request_id:requestId,password:'Fixture1!',acknowledged:true},{id:rowId,request_id:requestId,approved:true}]){const f=fixture({raw:true});assert.ok((await f.invoke('delete',body)).status>=400);assert.deepEqual(f.audit,[]);}});
test('confirmed master rechecked after password verification; browser session never replaced',async()=>{let n=0;const f=fixture({identityRpc:()=>++n===1?{data:{auth_user_id:master,role:'master_admin'}}:{error:{}}});assert.equal((await f.invoke('delete',{id:rowId})).status,403);assert.deepEqual(privileged(f),[]);assert.equal(f.calls.filter(c=>c[0]==='cleanup').length,1);});
test('missing drifted or self-target Auth identities denied before command',async()=>{for(const options of [{authUsers:[]},{lookupError:true},{authUsers:[{id:target,email:'other@example.test'}]},{rows:[{id:rowId,auth_user_id:master,role:'billing_person',email:'master@example.test'}]}]){const f=fixture(options);assert.ok((await f.invoke('reactivate',{id:rowId})).status>=400);assert.deepEqual(f.audit,[]);}});
test('database ownership denial prevents clearing independent provider ban',async()=>{const f=fixture({status:'Inactive',authUsers:[{id:target,email:'team@example.test',banned_until:'2099-01-01'}],commandError:'dispatch_provider'});assert.equal((await f.invoke('reactivate',{id:rowId})).status,409);assert.ok(!f.calls.some(c=>c[0]==='auth-update'));});
test('deletion revokes first, dispatches once, archives only after absence',async()=>{const f=fixture();assert.equal((await f.invoke('delete',{id:rowId})).status,200);assert.equal(f.rows.length,0);assert.equal(f.archives.length,1);assert.ok(f.calls.findIndex(c=>c[0]==='rpc'&&c[2]==='begin_delete')<f.calls.findIndex(c=>c[0]==='auth-delete'));assert.ok(!JSON.stringify(f.audit).includes('FixturePassword1!'));});
test('uncertain Auth deletion does not archive or repeat deletion',async()=>{const f=fixture({authError:true});assert.equal((await f.invoke('delete',{id:rowId})).status,503);assert.equal(f.rows[0].status,'Inactive');assert.equal(f.archives.length,0);const retry=fixture({existingStage:'auth_delete_dispatched'});assert.ok((await retry.invoke('delete',{id:rowId})).status>=400);assert.ok(!retry.calls.some(c=>c[0]==='auth-delete'));});
test('targeted deletion error codes distinguish pre-operation denial from provider uncertainty',async()=>{
 for(const code of ['invalid_credentials','captcha_failed']){
  const f=fixture({passwordError:true,passwordCode:code}),r=await f.invoke('delete',{id:rowId});
  assert.equal(r.body.review_required,true);assert.equal(r.body.current_attempt_rejected,true);assert.equal(r.body.code,code==='captcha_failed'?'captcha_failed':'password_invalid');assert.deepEqual(privileged(f),[]);
 }
 const f=fixture({authError:true}),r=await f.invoke('delete',{id:rowId});assert.equal(r.body.review_required,true);assert.equal(f.archives.length,0);
 const missing=fixture({authUsers:[{id:master,email:'master@example.test'}]});assert.equal((await missing.invoke('delete',{id:rowId})).status,200);assert.ok(!missing.calls.some(c=>c[0]==='auth-delete'));
 const conflict=fixture({commandError:'begin_delete',commandCode:'P0001',commandMessage:'Unlinked or inconsistent Auth identity requires review; never adopt or delete by email'}),denied=await conflict.invoke('delete',{id:rowId});assert.equal(denied.body.code,'identity_conflict');assert.equal(denied.body.review_required,true);assert.equal(denied.body.current_attempt_rejected,true);assert.ok(!conflict.calls.some(c=>c[0]==='auth-delete'));
 let n=0;const late=fixture({identityRpc:()=>++n<5?{data:{auth_user_id:master,role:'master_admin'}}:{error:{}}}),uncertain=await late.invoke('delete',{id:rowId});assert.equal(uncertain.body.review_required,true);assert.equal(late.calls.filter(c=>c[0]==='auth-delete').length,1);assert.equal(late.archives.length,0);
});
test('fresh invitation requires the private reservation receipt; unrelated existing Auth is never adopted',async()=>{
 const f=fixture({unrelatedInvite:true}),r=await f.invoke('create',createBody);assert.equal(r.status,503);assert.equal(r.body.review_required,true);assert.ok(!f.calls.some(c=>c[2]==='finish_create'));
});
test('resend renews only the existing Pending identity, preserves confirmed account and never blindly repeats',async()=>{
 for(const confirmed of [false,true]){
  const f=fixture({status:'Pending',authUsers:[{id:target,email:'team@example.test',...(confirmed?{email_confirmed_at:'2026-10-09'}:{})}]}),r=await f.invoke('resend',{id:rowId});
  assert.equal(r.status,200);assert.equal(f.calls.filter(c=>c[0]===(confirmed?'recover':'invite')).length,1);assert.equal(f.rows[0].auth_user_id,target);assert.equal(f.rows[0].status,'Pending');
  await f.invoke('resend',{id:rowId});assert.equal(f.calls.filter(c=>['recover','invite'].includes(c[0])).length,1);
 }
 for(const role of ['portfolio_manager','billing_person']){const f=fixture({role});assert.equal((await f.invoke('resend',{id:rowId})).status,403);assert.deepEqual(privileged(f),[]);}
 const unknown=fixture({status:'Pending',existingStage:'provider_dispatched'});assert.ok((await unknown.invoke('resend',{id:rowId})).status>=400);assert.ok(!unknown.calls.some(c=>['recover','invite'].includes(c[0])));
});
test('required durable start failure prevents provider mutations',async()=>{const f=fixture({commandError:'begin_delete'});assert.ok((await f.invoke('delete',{id:rowId})).status>=400);assert.ok(!f.calls.some(c=>c[0]==='auth-delete'));});
test('password setup verifies provider write before checked activation',async()=>{const f=fixture();assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,200);assert.ok(f.calls.findIndex(c=>c[0]==='http')<f.calls.findIndex(c=>c[1]==='platform_accept_invite'));for(const option of [{saveError:true},{acceptError:true},{passwordStepError:'begin'}]){const denied=fixture(option);const r=await denied.invoke('password',{password:'FixturePassword1!'});assert.ok(r.status>=400);if(option.saveError)assert.ok(!denied.calls.some(c=>c[1]==='platform_accept_invite'));}});
test('saved-password retry resumes activation without repeating provider update',async()=>{const f=fixture({saved:true});assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,200);assert.ok(!f.calls.some(c=>c[0]==='http'));});
test('method CORS malformed data and forged role denied',async()=>{for(const [body,headers] of [['{',{}],[{...createBody,role:'master_admin'},{}],[createBody,{Origin:'https://evil.example.test'}]]){const f=fixture();assert.ok((await f.invoke('create',body,{Authorization:'Bearer fixture-session',...headers})).status>=400);assert.deepEqual(f.audit,[]);}const f=fixture();assert.equal((await f.invoke('create',{}, {},'GET')).status,405);assert.equal((await f.invoke('create',{}, {},'OPTIONS')).status,204);});
test('JWT is enabled on all privileged and setup entrypoints; unused legacy wrapper is absent',()=>{for(const name of ['create-platform-user','update-platform-user','delete-platform-user','deactivate-platform-user','reactivate-platform-user','platform-password-setup'])assert.match(read('supabase/config.toml'),new RegExp('\\[functions\\.'+name+'\\]\\s*verify_jwt = true'));assert.equal(existsSync(new URL('../supabase/functions/_shared/platform-team.ts',import.meta.url)),false);});
test('confirmed master creates invitation and edits through durable server commands',async()=>{
 const invite=fixture();assert.equal((await invite.invoke('create',createBody)).status,200);
 const sent=invite.calls.find(c=>c[0]==='invite');assert.equal(sent[1],'new@example.test');assert.equal(sent[2].redirectTo,'https://platform.example.test/?reset=true');
 assert.ok(invite.calls.some(c=>c[2]==='finish_create'));
 const edit=fixture();assert.equal((await edit.invoke('update',{id:rowId,name:'Edited',role:'billing_person'})).status,200);
 assert.ok(edit.calls.some(c=>c[2]==='finish_edit'));assert.ok(!edit.calls.some(c=>c[0]==='password-check'));
});

test('deactivation bans retained identity after durable revocation; Reactivate restores without email',async()=>{
 const off=fixture();assert.equal((await off.invoke('deactivate',{id:rowId})).status,200);assert.equal(off.rows[0].status,'Inactive');
 assert.ok(off.calls.findIndex(c=>c[2]==='deactivate')<off.calls.findIndex(c=>c[0]==='auth-update'));
 assert.equal(off.calls.find(c=>c[0]==='auth-update')[2].ban_duration,'876000h');
 const on=fixture({status:'Inactive'});assert.equal((await on.invoke('reactivate',{id:rowId})).status,200);assert.equal(on.rows[0].status,'Active');
 assert.equal(on.calls.find(c=>c[0]==='auth-update')[2].ban_duration,'none');
 for(const f of [off,on])assert.ok(!f.calls.some(c=>['generate','invite','http','auth-delete'].includes(c[0])));
});
test('provider suspension failure remains revoked and review required; duplicate dispatch never repeats',async()=>{
 const f=fixture({authError:true});assert.equal((await f.invoke('deactivate',{id:rowId})).status,503);assert.equal(f.rows[0].status,'Inactive');assert.ok(f.calls.some(c=>c[2]==='mark_review'));
 const duplicate=fixture({status:'Inactive',existingStage:'provider_dispatched'});assert.equal((await duplicate.invoke('reactivate',{id:rowId})).status,409);assert.ok(!duplicate.calls.some(c=>c[0]==='auth-update'||c[2]==='mark_review'));
});
test('Inactive and archived password setup are denied before provider/password commands',async()=>{
 for(const kind of ['inactive','archived']){const f=fixture({context:{kind,auth_user_id:master,session_id:master}});assert.equal((await f.invoke('password',{password:'FixturePassword1!'})).status,403);assert.ok(!f.calls.some(c=>c[0]==='http'||c[1]==='platform_team_password_step'));}
});
test('native OTP/recovery AMR eligible; ordinary password session cannot bypass current-password flow',async()=>{
 for(const method of ['otp','recovery','password']){const f=fixture({context:{kind:'active',auth_user_id:master,session_id:master}});const token='synthetic.'+Buffer.from(JSON.stringify({amr:[{method}]})).toString('base64url')+'.synthetic';const r=await f.invoke('password',{password:'FixturePassword1!'},{Authorization:'Bearer '+token});assert.equal(r.status,method==='password'?403:200);assert.equal(f.calls.some(c=>c[0]==='http'),method!=='password');assert.ok(!f.calls.some(c=>c[1]==='platform_accept_invite'));}
});
test('rejected email transport has no runtime or config references',()=>{
 function scan(dir){for(const item of readdirSync(new URL('../'+dir,import.meta.url),{withFileTypes:true})){
  const path=dir+'/'+item.name;if(item.isDirectory())scan(path);else if(/\.(?:js|ts)$/.test(path))assert.deepEqual(forbiddenEmailTransport(read(path)),[],path);
 }}
 scan('src');scan('supabase/functions');
 for(const path of ['supabase/config.toml','package.json'])assert.deepEqual(forbiddenEmailTransport(path.endsWith('.toml')?read(path).replace(/^\s*#.*$/gm,''):read(path)),[],path);
 assert.deepEqual(forbiddenEmailTransport('Resend invitation; inviteUserByEmail(email); resetPasswordForEmail(email)'),[]);
 for(const source of ["import {Resend} from 'resend'", "import('npm:resend@4')", "import {Resend} from 'https://esm.sh/resend@4'", "require('nodemailer')", '"@sendgrid/mail":"1"', 'https://api.resend.com/emails', 'https://api.sendgrid.com/v3/mail/send', 'RESEND_API_KEY', 'PLATFORM_AUTH_EMAIL_GUARD_SECRET', '/functions/v1/platform-password-recovery', 'proof_digest'])assert.ok(forbiddenEmailTransport(source).length,source);
});
test('shared handler fixture import is side-effect-free and registers no tests',()=>{
 const r=spawnSync(process.execPath,['--input-type=module','-e',"import './tests/helpers/platform-team-fixture.mjs'; console.log('fixture-only');"],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'fixture-only');assert.doesNotMatch(r.stdout,/Subtest|tests \d+|TAP version/);
 assert.match(read('tests/platform-team-database.test.mjs'),/from '\.\/helpers\/platform-team-fixture\.mjs'/);
});
