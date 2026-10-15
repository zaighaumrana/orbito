// Real pinned GoTrue + PG17, isolated synthetic identities. No hosted environment,
// external SMTP, real CAPTCHA, existing containers or caller-supplied targets.
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const retirementOnly=process.argv.length===3 && process.argv[2]==='--retirement-only';
assert.ok(process.argv.length===2 || retirementOnly,'No external target is accepted');
const nonce=randomBytes(8).toString('hex'),name='orbito-bootstrap-auth-'+nonce,network=name+'-network';
const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),label='com.retrasell.auth-test';
const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('SUPABASE_')||k.startsWith('PG'))delete env[k];
const owned=[];let net=false,origin;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024,env});if(r.error||r.status!==0)throw Error('Local Docker operation failed: '+String(r.error?.message||r.stderr).replaceAll(password,'[fixture]').replaceAll(secret,'[fixture]'));return r.stdout.trim();}
function sql(q){return run(['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],q);}
function jwt(role){const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),head=encode({alg:'HS256',typ:'JWT'}),payload=encode({role,aud:'authenticated',iss:'supabase',exp:Math.floor(Date.now()/1000)+3600});return head+'.'+payload+'.'+createHmac('sha256',secret).update(head+'.'+payload).digest('base64url');}
const service=jwt('service_role');
async function api(path,body,token=service,method='POST'){
 assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);assert.ok(path.startsWith('/')&&!path.startsWith('//'));
 const response=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{data={};}return {status:response.status,data,location:response.headers.get('location')};
}
async function grant(email,pw=password){const r=await api('/token?grant_type=password',{email,password:pw},jwt('anon'));assert.equal(r.status,200,'Synthetic password sign-in failed');return r.data;}
const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
function authority(session){const c=claims(session.access_token);return sql(`begin;select set_config('request.jwt.claims','${JSON.stringify({sub:c.sub,session_id:c.session_id})}',true);select set_config('request.jwt.claim.sub','${c.sub}',true);set local role authenticated;select public.platform_session_status()->>'authorized';commit;`).split('\n').at(-1);}
async function refresh(session){return api('/token?grant_type=refresh_token',{refresh_token:session.refresh_token},jwt('anon'));}
// Actual browser diagnostic, real native password/refresh/logout and canonical
// SQL. Only the SDK/PostgREST transport is adapted; no hosted SDK claim is made.
async function continuityDiagnostic(initial,pw){
 let refreshes=0,cleanups=0;
 const client=(session,temporary=false)=>({get session(){return session;},auth:{
  getUser:async()=>{const r=await api('/user',null,session?.access_token,'GET');return r.status===200?{data:{user:r.data}}:{error:{status:r.status}};},
  signInWithPassword:async values=>{assert.ok(temporary,'Original session must not sign in');const r=await api('/token?grant_type=password',{email:values.email,password:values.password},jwt('anon'));if(r.status!==200)return{error:{status:r.status}};session=r.data;return{data:{session,user:session.user}};},
  refreshSession:async()=>{assert.ok(!temporary);refreshes++;const r=await refresh(session);if(r.status!==200){session=null;return{error:{status:r.status}};}session=r.data;return{data:{session}};},
  signOut:async options=>{assert.ok(temporary);assert.equal(options.scope,'local');const r=await api('/logout?scope=local',null,session.access_token);cleanups++;session=null;return r.status===204?{}:{error:{status:r.status}};}
 },rpc:async command=>{
  assert.ok(['platform_operator_identity','platform_account_access_notice'].includes(command));
  const c=claims(session.access_token);
  try{return{data:JSON.parse(sql(`begin;select set_config('request.jwt.claims','${JSON.stringify({sub:c.sub,session_id:c.session_id})}',true);select set_config('request.jwt.claim.sub','${c.sub}',true);set local role authenticated;select public.${command}();commit;`).split('\n').at(-1))};}catch{return{error:{code:'42501'}};}
 }});
 const original=client(initial),ctx={TypeError,navigator:{onLine:true},localStorage:{getItem(){}},testEnv:{VITE_PLATFORM_URL:origin,VITE_PLATFORM_ANON:jwt('anon')},createClient:(_url,_key,options)=>options?.auth?.storageKey==='platform-continuity-diagnostic'?client(null,true):original};
 vm.createContext(ctx);
 for(const file of ['src/state.js','src/async-context.js','src/supabase.js'])vm.runInContext(read(file).replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv')+(file==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 Object.assign(ctx.pState,{authenticated:true,currentUser:await ctx.loadOperatorIdentity()});
 let success=false,code;
 try{success=(await ctx.diagnoseMasterSession(pw,'synthetic-local-captcha')).success===true;}catch(error){code=error.code;}
 assert.equal(sql('select enabled from platform_private.password_verification_policy'),'f');
 return{success,code,refreshes,cleanups,session:original.session};
}
// Actual password handler, native Auth HTTP and real SQL boundary. This adapter
// substitutes only PostgREST transport; it cannot target a hosted environment.
async function passwordSetup(session,value,request){
 const c=claims(session.access_token),ctx={URL,Request,Response,Date,atob,TextEncoder,Deno:{env:{get:k=>({SUPABASE_URL:origin,SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:service,PLATFORM_TEAM_SITE_URL:'https://synthetic.invalid'})[k]}},createClient(){throw Error('Factory must be injected');},fetch(){throw Error('Native transport must be injected');}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/platform-team-v2.ts').replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'}),ctx);
 const factory=(_url,key)=>({auth:{getUser:async token=>{const r=await api('/user',null,token,'GET');return r.status===200?{data:{user:r.data}}:{error:{status:r.status}};}},rpc:async(name,args)=>{
  let query;
  if(key===service){assert.ok(['platform_team_password_step','platform_accept_invite'].includes(name));query=name==='platform_accept_invite'?`select public.platform_accept_invite('${args.p_user}','${args.p_request}','${args.p_session}')`:`select public.platform_team_password_step('${args.p_user}','${args.p_request}','${args.p_step}','${args.p_session}')`;query='begin;set local role service_role;'+query+';commit;';}
  else{assert.equal(name,'platform_team_setup_context');query=`begin;select set_config('request.jwt.claims','${JSON.stringify({sub:c.sub,session_id:c.session_id})}',true);select set_config('request.jwt.claim.sub','${c.sub}',true);set local role authenticated;select public.platform_team_setup_context();commit;`;}
  try{return {data:JSON.parse(sql(query).split('\n').at(-1))};}catch{return {error:{code:'42501'}};}
 }});
 const transport=async(url,init)=>{assert.equal(url,origin+'/auth/v1/user');const r=await api('/user',JSON.parse(init.body),init.headers.Authorization.slice(7),'PUT');return Response.json(r.data,{status:r.status});};
 return ctx.passwordHandler(factory,transport)(new Request(origin+'/functions/v1/platform-password-setup',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:JSON.stringify({password:value,request_id:request})}));
}
async function startAuth(single){
 const authName=name+(single?'-single':'-multi');
 run(['run','--rm','-d','--name',authName,'--label',label+'='+nonce,'--network',network,'-p','127.0.0.1::9999',
  '-e','GOTRUE_DB_DRIVER=postgres','-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${name}:5432/postgres`,
  '-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_SITE_URL=http://localhost:4180',
  '-e','GOTRUE_JWT_SECRET='+secret,'-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated',
  '-e','GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true','-e','GOTRUE_SESSIONS_SINGLE_PER_USER='+single,
  '-e','GOTRUE_MAILER_OTP_EXP=3600','-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','public.ecr.aws/supabase/gotrue:v2.197.0','auth']);owned.push(authName);
 const mapping=run(['port',authName,'9999/tcp']);assert.match(mapping,/^127\.0\.0\.1:\d+$/);origin='http://'+mapping;
 for(let n=0;n<80;n++){try{const r=await api('/health',null,service,'GET');if(r.status===200)return authName;}catch{}await new Promise(r=>setTimeout(r,250));}
 throw Error('Local GoTrue readiness failed');
}
try{
 assert.equal(run(['version','--format','{{.Server.Os}}']),'linux');
 for(const image of ['public.ecr.aws/supabase/postgres:17.6.1.155','public.ecr.aws/supabase/gotrue:v2.197.0'])run(['image','inspect',image]);
 run(['network','create','--label',label+'='+nonce,network]);net=true;
 run(['run','--rm','-d','--name',name,'--label',label+'='+nonce,'--network',network,'-e','POSTGRES_PASSWORD='+password,'public.ecr.aws/supabase/postgres:17.6.1.155']);owned.push(name);
 for(let n=0;n<80;n++){try{run(['exec',name,'pg_isready','-h',name,'-U','postgres']);break;}catch{if(n===79)throw Error('PG17 TCP readiness failed');await new Promise(r=>setTimeout(r,250));}}
 run(['exec','-i',name,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-f','-'],`alter role supabase_auth_admin password '${password}';`);
 run(['run','--rm','--network',network,'-e','GOTRUE_DB_DRIVER=postgres','-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${name}:5432/postgres`,'-e','GOTRUE_SITE_URL=http://localhost:4180','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_JWT_SECRET='+secret,'public.ecr.aws/supabase/gotrue:v2.197.0','auth','migrate']);
 run(['exec','-i',name,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-f','-'],"create extension if not exists pgcrypto with schema extensions;create extension if not exists supabase_vault with schema vault;create schema if not exists storage;create table if not exists storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;create schema if not exists realtime;create table if not exists realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;do $$declare t record;begin for t in select distinct pg_get_userbyid(relowner) as owner from pg_class where oid in(to_regclass('storage.objects'),to_regclass('realtime.messages')) loop execute format('grant %I to postgres',t.owner);end loop;end$$;");
 console.log('Local managed Auth FK inventory:',sql("select json_agg(json_build_object('table',n.nspname||'.'||t.relname,'constraint',c.conname,'owner',pg_get_userbyid(t.relowner),'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and c.confrelid='auth.users'::regclass"));
 for(const f of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
  const source=read('supabase/migrations/'+f);sql(/^begin;/i.test(source.replace(/^\s*--.*$/gm,'').trim())?source:'begin;'+source+'commit;');
 }
 const multi=await startAuth(false);
 if(retirementOnly){
  // Generate native links locally without a sender; never print the transient
  // token/link response. This tests GoTrue OTP retirement, not email delivery.
  const address='retirement@example.test';
  const generated=await api('/admin/generate_link',{type:'invite',email:address});assert.equal(generated.status,200);
  const oldId=generated.data.id || generated.data.user?.id,oldToken=generated.data.hashed_token;
  assert.ok(oldId && oldToken);
  assert.equal((await api('/admin/users/'+oldId,null,service,'DELETE')).status,200);
  assert.equal((await api('/admin/users/'+oldId,null,service,'GET')).status,404);
  const fresh=await api('/admin/generate_link',{type:'invite',email:address});assert.equal(fresh.status,200);
  const newId=fresh.data.id || fresh.data.user?.id;assert.ok(newId && newId!==oldId);
  const obsolete=await api('/verify',{type:'invite',token_hash:oldToken},jwt('anon'));assert.ok(obsolete.status>=400);
  const current=await api('/verify',{type:'invite',token_hash:fresh.data.hashed_token},jwt('anon'));assert.equal(current.status,200);assert.equal(current.data.user.id,newId);
  const recovery=await api('/admin/generate_link',{type:'recovery',email:address});assert.equal(recovery.status,200);
  const recoveryToken=recovery.data.hashed_token;
  assert.equal((await api('/admin/users/'+newId,null,service,'DELETE')).status,200);
  const third=await api('/admin/generate_link',{type:'invite',email:address});assert.equal(third.status,200);
  assert.ok((third.data.id || third.data.user?.id)!==newId);
  assert.ok((await api('/verify',{type:'recovery',token_hash:recoveryToken},jwt('anon'))).status>=400);
  console.log('PASS: one focused real GoTrue group: hard Auth deletion, fresh UUID reinvitation, rejected retired invite/recovery links, valid current invite; no emails sent.');
  console.log('SKIP: SMTP delivery, hosted CAPTCHA/session continuity and expired-link wall-clock timing.');
 }else{
 const create=async email=>{const r=await api('/admin/users',{email,password,email_confirm:true});assert.equal(r.status,200,'Synthetic Auth creation failed');return r.data.id;};
 const master=await create('master@example.test'),team=await create('team@example.test');
 sql(`select platform_private.initialize_config('Local Auth fixture','Reviewed isolated fixture');select platform_private.bind_master('${master}',null,'Reviewed isolated fixture');begin;select set_config('platform.team_transition','trusted',true);insert into public.platform_users(id,auth_user_id,name,email,role,status) values('${team}','${team}','Synthetic','team@example.test','portfolio_manager','Active');commit;`);
 let original=await grant('master@example.test');assert.equal(authority(original),'true');
 const diagnostic=await continuityDiagnostic(original,password);assert.equal(diagnostic.success,true);assert.equal(diagnostic.refreshes,2);assert.equal(diagnostic.cleanups,1);original=diagnostic.session;
 console.log('PASS: actual diagnostic succeeds on native multi-session Auth, checks refresh during/after the temporary grant, cleans it once and leaves deletion policy disabled.');
 // Before/during/after independent verification, including slow local cleanup.
 for(let n=0;n<2;n++){
  let r=await refresh(original);assert.equal(r.status,200);original=r.data;
  const verifier=await grant('master@example.test');r=await refresh(original);assert.equal(r.status,200);original=r.data;
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(authority(original),'true');
  assert.equal((await api('/logout?scope=local',null,verifier.access_token)).status,204);
  r=await refresh(original);assert.equal(r.status,200);original=r.data;assert.equal(authority(original),'true');
 }
 assert.ok((await api('/token?grant_type=password',{email:'master@example.test',password:'wrong-synthetic'},jwt('anon'))).status>=400);
 assert.equal(authority(original),'true');
 console.log('PASS: real Auth multi-session password verification, refresh before/during/after local cleanup, repeated/slow cleanup and wrong-password isolation.');
 for(const payload of [{password:'Replacement1!'},{current_password:'wrong-synthetic',password:'Replacement1!'}]){
  const r=await api('/user',payload,original.access_token,'PUT');assert.equal(r.status,400);assert.equal(r.data.error_code,payload.current_password?'current_password_invalid':'current_password_required');assert.equal(authority(original),'true');
  assert.equal((await grant('master@example.test')).user.id,master,'Rejected update must preserve original password');const unchanged=await refresh(original);assert.equal(unchanged.status,200);original=unchanged.data;
 }
 assert.equal((await api('/user',{current_password:password,password:'Replacement1!'},original.access_token,'PUT')).status,200);
 assert.equal((await grant('master@example.test','Replacement1!')).user.id,master);
 assert.ok((await api('/token?grant_type=password',{email:'master@example.test',password},jwt('anon'))).status>=400,'Only the successful verified update replaces the original password');
 console.log('PASS: native current-password setting rejects missing/wrong current password and accepts correct password without identity replacement.');
 original=await grant('master@example.test','Replacement1!');const old=await grant('team@example.test');const m=claims(original.access_token);
 const request='98000000-0000-4000-8000-000000000001';
 const command=(action,data={})=>sql(`begin;set local role service_role;select public.platform_team_command('${master}','${request}','${action}','${team}','${JSON.stringify(data)}','${m.session_id}');commit;`);
 command('deactivate');assert.equal(authority(old),'false');command('dispatch_provider');
 const banned=await api('/admin/users/'+team,{ban_duration:'876000h'},service,'PUT');assert.equal(banned.status,200);
 command('finish_deactivate',{provider_ban:banned.data.banned_until});
 assert.ok((await refresh(old)).status>=400);assert.ok((await api('/token?grant_type=password',{email:'team@example.test',password},jwt('anon'))).status>=400);
 const restore='98000000-0000-4000-8000-000000000002';
 const restoreCommand=action=>sql(`begin;set local role service_role;select public.platform_team_command('${master}','${restore}','${action}','${team}','{}','${m.session_id}');commit;`);
 restoreCommand('begin_reactivate');restoreCommand('dispatch_provider');assert.equal((await api('/admin/users/'+team,{ban_duration:'none'},service,'PUT')).status,200);restoreCommand('finish_reactivate');
 assert.equal(authority(old),'false');const renewedOld=await refresh(old);if(renewedOld.status===200)assert.equal(authority(renewedOld.data),'false');
 assert.equal(authority(await grant('team@example.test')),'true');
 console.log('PASS: real provider ban denies password/refresh; unchanged original employee/password works after Reactivate; pre-deactivation JWT/session stays unauthorized even if provider refresh resumes.');
 // Recovery is native and password changes cannot activate an Inactive row.
 const link=await api('/admin/generate_link',{type:'recovery',email:'team@example.test'});assert.equal(link.status,200);
 const verified=await api('/verify',{type:'recovery',token_hash:link.data.hashed_token},jwt('anon'));assert.equal(verified.status,200);
 assert.ok(claims(verified.data.access_token).amr.some(a=>['otp','recovery'].includes(a.method)),'Native recovery AMR must match server eligibility');
 const reused=await api('/verify',{type:'recovery',token_hash:link.data.hashed_token},jwt('anon'));assert.ok(reused.status>=400);
 assert.equal((await passwordSetup(verified.data,'Recovered1!','98000000-0000-4000-8000-000000000008')).status,200);
 assert.equal((await passwordSetup(await grant('team@example.test','Recovered1!'),'Bypass1!','98000000-0000-4000-8000-000000000007')).status,403);
 console.log('PASS: actual password handler accepts native recovery AMR and password API, denies ordinary password-session bypass; recovery link is single-use.');
 const expired=await api('/admin/generate_link',{type:'recovery',email:'team@example.test'});assert.equal(expired.status,200);
 sql(`update auth.users set recovery_sent_at=now()-interval '2 hours' where id='${team}'`);
 assert.ok((await api('/verify',{type:'recovery',token_hash:expired.data.hashed_token},jwt('anon'))).status>=400);
 // Native invite link creation/consumption exercises GoTrue without SMTP or mail.
 const invitation=await api('/admin/generate_link',{type:'invite',email:'pending@example.test'});assert.equal(invitation.status,200);
 const pending=invitation.data.id;assert.match(pending,/^[0-9a-f-]{36}$/);
 sql(`begin;select set_config('platform.team_transition','trusted',true);insert into public.platform_users(id,auth_user_id,name,email,role,status) values('${pending}','${pending}','Pending','pending@example.test','billing_person','Pending');commit;`);
 const invited=await api('/verify',{type:'invite',token_hash:invitation.data.hashed_token},jwt('anon'));assert.equal(invited.status,200);assert.equal(authority(invited.data),'false');
 const prequest='98000000-0000-4000-8000-000000000009';
 assert.equal((await passwordSetup(invited.data,'Invited1!',prequest)).status,200);
 assert.equal(authority(await grant('pending@example.test','Invited1!')),'true');
 assert.ok((await api('/verify',{type:'invite',token_hash:invitation.data.hashed_token},jwt('anon'))).status>=400);
 console.log('PASS: expired native recovery and reused native invite links denied; real invite session remains Pending until successful native first-password write and server verification. No invitation email delivery was tested.');
 // Single-session behavior must be a release blocker, never declared safe by mocks.
 run(['rm','-f',multi]);owned.splice(owned.indexOf(multi),1);await startAuth(true);
 original=await grant('master@example.test','Replacement1!');const verifier=await grant('master@example.test','Replacement1!');
 const during=await refresh(original);assert.ok(during.status>=400,'Single-session refresh was unexpectedly accepted');
 // GoTrue leaves that session row until later cleanup. Row existence does not
 // prove single-session refresh continuity; the default-off approval is essential.
 const originalClaims=claims(original.access_token);
 assert.throws(()=>sql(`begin;set local role service_role;select public.platform_team_command('${master}','98000000-0000-4000-8000-000000000003','begin_delete','${team}','{}','${originalClaims.session_id}');commit;`),/continuity is not approved/);
 assert.equal((await api('/logout?scope=local',null,verifier.access_token)).status,204);
 const after=await refresh(original);assert.equal(after.status,200);assert.equal(after.data.user.id,master);
 console.log('PASS: real single-session policy rejects original refresh DURING verification and resumes AFTER local cleanup; a browser may already discard its session on that rejection. Default-off database gate blocks destructive operations. BLOCKED: destructive rollout until staging continuity configuration is verified.');
 const unsafeDiagnostic=await continuityDiagnostic(after.data,'Replacement1!');assert.equal(unsafeDiagnostic.success,false);assert.equal(unsafeDiagnostic.code,'diagnostic_uncertain');assert.equal(unsafeDiagnostic.refreshes,1);assert.equal(unsafeDiagnostic.cleanups,1);
 console.log('PASS: actual diagnostic rejects native single-session refresh loss before reporting success, cleans the temporary session and never enables deletion. SDK event handling/hosted behavior remain separate gates.');
 console.log('SKIP: real SMTP/invitation email delivery, hosted CAPTCHA, PostgREST JWT gateway, provider timebox/inactivity settings and hosted session continuity. No external connection or email was attempted.');
 }
} finally {
 for(const item of owned.reverse()){assert.equal(run(['inspect','-f','{{index .Config.Labels "'+label+'"}}',item]),nonce);run(['rm','-f',item]);}
 if(net){assert.equal(run(['network','inspect','-f','{{index .Labels "'+label+'"}}',network]),nonce);run(['network','rm',network]);}
}
