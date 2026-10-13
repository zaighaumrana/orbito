// Actual pinned CLI, owned disposable PG17 container, real Auth/Vault.
// No hosted URL, project ref, existing container or history repair is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,mkdtempSync,writeFileSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync,execFile} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const cliPath=process.env.ORBITO_BOOTSTRAP_CLI_PATH;
assert.ok(cliPath && isAbsolute(cliPath),'ORBITO_BOOTSTRAP_CLI_PATH must be the absolute pinned CLI 2.120.0 executable path');
const cli=realpathSync(cliPath),version='20261008191709',filename=version+'_production_bootstrap_hardening.sql';
const nonce=randomBytes(8).toString('hex'),container='orbito-bootstrap-atomic-'+nonce,network=container+'-network';
const label='com.retrasell.bootstrap-test',password=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex');
const toolRoot=resolve(root,'node_modules/.bootstrap-tools');
mkdirSync(toolRoot,{recursive:true});
const work=mkdtempSync(join(toolRoot,'atomicity-'));
const read=p=>readFileSync(join(root,p),'utf8'),digest=s=>createHash('sha256').update(s).digest('hex');
const redact=s=>String(s).replaceAll(password,'[local fixture credential]').replaceAll(jwt,'[local fixture credential]');
const env={...process.env};
for(const key of Object.keys(env))if(key.startsWith('SUPABASE_') || key.startsWith('PG'))delete env[key];
env.DO_NOT_TRACK='1';
let ownedContainer=false,ownedNetwork=false,port;
const template='orbito_cli_template_'+nonce,databases=new Set();
function run(file,args,options={}){
 const r=spawnSync(file,args,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024,...options});
 if(r.error)throw Error(redact(r.error.message));
 return r;
}
function must(file,args,options={}){
 const r=run(file,args,options);
 if(r.status!==0)throw Error(redact(r.stderr || r.stdout));
 return r.stdout.trim();
}
function sql(query,database='postgres',variables=[],user='postgres'){
 assert.match(database,/^postgres$|^orbito_(?:cli|bootstrap)_[a-z0-9_]+$/);
 return must('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',database,...variables,'-f','-'],{input:query});
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function cliArgs(db,dir){
 assert.ok(databases.has(db),'CLI may access only databases created by this test');
 assert.match(String(port),/^\d{4,5}$/);
 return ['db','push','--db-url',`postgresql://postgres:${password}@127.0.0.1:${port}/${db}?sslmode=disable`,'--skip-vault','--yes','--workdir',dir];
}
const push=(db,dir)=>run(cli,cliArgs(db,dir),{env});
function pushAsync(db,dir){
 return new Promise(resolveResult=>execFile(cli,cliArgs(db,dir),{env,windowsHide:true,timeout:90000,maxBuffer:8*1024*1024},(error,stdout,stderr)=>resolveResult({status:error?1:0,stdout,stderr})));
}
function successful(result){assert.equal(result.status,0,redact(result.stderr || result.stdout));}
const history=db=>sql(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`,db);
const old='92000000-0000-4000-8000-000000000001';
function canonical(db,id){return sql(`begin;select set_config('request.jwt.claims','${JSON.stringify({sub:id,session_id:id})}',true);select set_config('request.jwt.claim.sub','${id}',true);set local role authenticated;select public.platform_operator_identity()->>'role';rollback;`,db).split('\n').at(-1);}
function snapshot(db){
 const dump=must('docker',['exec',container,'pg_dump','-U','supabase_admin','-d',db,'--schema-only','--schema=public','--schema=platform_private']);
 // pg_dump generates a new psql restriction key on each call; it is not schema.
 const stable=dump.replace(/^\\(?:un)?restrict .*$/gm,'');
 const data=sql(`select jsonb_build_object('config',(select jsonb_agg(to_jsonb(c) order by id) from public.platform_config c),
 'users',(select jsonb_agg(jsonb_build_object('id',id,'email',email,'confirmed',email_confirmed_at,'anonymous',is_anonymous,'deleted',deleted_at,'banned',banned_until) order by id) from auth.users),
 'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.operator_audit a),
 'history',(select jsonb_agg(to_jsonb(h) order by version) from supabase_migrations.schema_migrations h))`,db);
 return {schema:digest(stable),data:digest(data)};
}
function pendingObjectsAbsent(db){
 assert.equal(sql(`select to_regclass('platform_private.master_identity') is null
 and to_regprocedure('platform_private.bind_master(uuid,uuid,text)') is null
 and to_regprocedure('platform_private.initialize_config(text,text)') is null`,db),'t');
 assert.equal(history(db),'0');
}
function injectHistoryFault(db,scenario,mode){
 const app='orbito_history_gate_'+nonce;
 sql(`create function supabase_migrations.bootstrap_history_fault() returns trigger language plpgsql as $$
 declare statement text; normalized text; api_role text;
 begin
 if new.version='${version}' then
  -- Inspect statements produced by the ACTUAL CLI parser, not a replacement runner.
  foreach statement in array new.statements loop
   normalized:=upper(regexp_replace(statement,'^([[:space:]]|--[^\n]*\n)*','','g'));
   if normalized !~ '^(CREATE (OR REPLACE )?(TABLE|FUNCTION) |ALTER TABLE |REVOKE |GRANT |UPDATE |DO[[:space:]])' then
    raise exception 'Unsafe bootstrap batch statement: %',left(normalized,60);
   end if;
  end loop;
  if to_regclass('platform_private.master_identity') is null
   or to_regprocedure('platform_private.bind_master(uuid,uuid,text)') is null
   or to_regprocedure('platform_private.initialize_config(text,text)') is null
   or pg_get_functiondef('platform_private.operator_role()'::regprocedure) not like '%platform_private.master_identity%'
   or exists(select 1 from pg_attrdef where adrelid='public.platform_config'::regclass and adnum in
    (select attnum from pg_attribute where attrelid='public.platform_config'::regclass and attname in ('admin_username','admin_password')))
   or not exists(select 1 from pg_constraint where conrelid='public.platform_config'::regclass and conname='platform_config_no_password') then
   raise exception 'Bootstrap SQL did not finish before history INSERT';
  end if;
  foreach api_role in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(api_role,'platform_private.bind_master(uuid,uuid,text)','EXECUTE')
    or has_function_privilege(api_role,'platform_private.initialize_config(text,text)','EXECUTE')
    or has_table_privilege(api_role,'platform_private.master_identity','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
    raise exception 'Bootstrap grants did not finish before history INSERT';
   end if;
  end loop;
  ${scenario==='staging'?`if not exists(select 1 from platform_private.master_identity where auth_user_id='${old}')
    or exists(select 1 from platform_private.master_bootstrap_approval)
    or not exists(select 1 from public.platform_config where id=1 and admin_username='existing-alias' and admin_password is null)
    or not exists(select 1 from public.operator_audit where action='master_identity_bound') then
    raise exception 'Staging bind/scrub/approval consumption did not finish before history INSERT';end if;`
   :`if exists(select 1 from platform_private.master_identity) or exists(select 1 from public.platform_config) then
    raise exception 'Fresh bootstrap unexpectedly assigned identity/config';end if;`}
  ${mode==='reject'?"raise exception 'Injected history INSERT rejection after completed bootstrap SQL' using errcode='P0001';"
   :`perform set_config('application_name','${app}',true);perform pg_sleep(45);`}
 end if;
 return new;
 end $$;
 create trigger bootstrap_history_fault before insert on supabase_migrations.schema_migrations
 for each row execute function supabase_migrations.bootstrap_history_fault();`,db);
 return app;
}
function removeFault(db){sql('drop trigger bootstrap_history_fault on supabase_migrations.schema_migrations;drop function supabase_migrations.bootstrap_history_fault();',db);}
async function fixture(scenario,kind,workFixture){
 const db='orbito_cli_'+scenario+'_'+kind+'_'+nonce,dir=join(work,scenario+'-'+kind);
 mkdirSync(join(dir,'supabase/migrations'),{recursive:true});
 writeFileSync(join(dir,'supabase/config.toml'),'project_id="orbito-local-atomicity"\n[db]\nmajor_version=17\n[db.seed]\nenabled=false\n');
 const migrations=readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations.filter(f=>f<filename))copyFileSync(join(root,'supabase/migrations',file),join(dir,'supabase/migrations',file));
 sql('create database '+db+' template '+template);databases.add(db);
 try{
  sql(read('supabase/bootstrap/preflight.sql')+read('supabase/bootstrap/fresh-preflight.sql'),db);
  successful(push(db,dir));
  assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',db),'11');
  copyFileSync(join(root,'supabase/migrations',filename),join(dir,'supabase/migrations',filename));
  if(scenario==='staging'){
   sql(read('tests/platform-master-upgrade-before.sql'),db);
   const unapproved=snapshot(db),denied=push(db,dir);
   assert.notEqual(denied.status,0);assert.match(denied.stderr+denied.stdout,/reviewed staging master approval/);
   assert.deepEqual(snapshot(db),unapproved);pendingObjectsAbsent(db);
   sql(read('supabase/bootstrap/approve-staging-master.sql'),db,['-v','master_uuid='+old,'-v','reason=Reviewed local CLI atomicity cutover']);
  }
  await workFixture(db,dir);
 }finally{sql('drop database '+db+' with (force)');databases.delete(db);}
}
function retryAndVerify(db,dir,scenario){
 removeFault(db);successful(push(db,dir));
 assert.equal(history(db),'1');assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',db),'12');
 assert.equal(sql(`select count(*)=1 and bool_and(statements is not null and cardinality(statements)>0) from supabase_migrations.schema_migrations where version='${version}'`,db),'t');
 if(scenario==='staging'){
  assert.equal(canonical(db,old),'master_admin');
  sql(read('supabase/bootstrap/validate.sql'),db);
 }else{
  assert.equal(sql('select not exists(select 1 from public.platform_config) and not exists(select 1 from platform_private.master_identity)',db),'t');
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${old}','fresh-master@example.test',now());
   select platform_private.initialize_config('Fresh CLI fixture','Reviewed disposable fresh CLI binding');
   select platform_private.bind_master('${old}',null,'Reviewed disposable fresh CLI binding');`,db);
  sql(read('supabase/bootstrap/validate.sql'),db);
 }
 const success=snapshot(db);successful(push(db,dir));assert.deepEqual(snapshot(db),success);assert.equal(history(db),'1');
}

test.before(async()=>{
 assert.equal(must(cli,['--version'],{env}),'2.120.0');
 const hash=digest(readFileSync(cli));
 if(process.platform==='win32')assert.equal(hash,'1cbedd6e494581a1c1d90113660113a06798d9967d19c857127b66b8a428e836');
 console.log('Pinned CLI:',cli,'version 2.120.0, SHA256',hash);
 console.log('Disposable fixture scope:',container,network,work);
 assert.equal(must('docker',['version','--format','{{.Server.Os}}']),'linux');
 for(const image of ['public.ecr.aws/supabase/postgres:17.6.1.155','public.ecr.aws/supabase/gotrue:v2.197.0'])must('docker',['image','inspect',image]);
 must('docker',['network','create','--label',label+'='+nonce,network]);ownedNetwork=true;
 must('docker',['run','--rm','-d','--name',container,'--label',label+'='+nonce,'--network',network,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'public.ecr.aws/supabase/postgres:17.6.1.155']);ownedContainer=true;
 let ready=false;
 // The image's temporary init server accepts Unix sockets before its final TCP
 // server starts. Readiness must use the bridge address GoTrue will connect to.
 for(let i=0;i<60;i++){if(run('docker',['exec',container,'pg_isready','-h',container,'-U','postgres']).status===0){ready=true;break;}await pause(500);}
 assert.ok(ready,'PG17 readiness timeout');assert.match(sql('show server_version'),/^17\./);
 port=must('docker',['port',container,'5432/tcp']).match(/^127\.0\.0\.1:(\d{4,5})$/)?.[1];assert.ok(port,'Only one loopback port may be published');
 sql(`alter role supabase_auth_admin password '${password}'`,'postgres',[],'supabase_admin');
 must('docker',['run','--rm','--network',network,'-e','GOTRUE_DB_DRIVER=postgres','-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${container}:5432/postgres`,'-e','GOTRUE_SITE_URL=http://localhost:4180','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_JWT_SECRET='+jwt,'public.ecr.aws/supabase/gotrue:v2.197.0','auth','migrate']);
 // The image already records seven Auth baseline versions; this GoTrue pass
 // adds 75, leaving 82 genuine versions (not 75 total history rows).
 assert.equal(sql('select count(*) from auth.schema_migrations'),'82');
 const dump=must('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault']);
 sql('create database '+template+' template template0');databases.add(template);
 sql(dump,template,[],'supabase_admin');sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;',template);
});
test.after(()=>{
 try{
  if(ownedContainer){
   assert.equal(must('docker',['inspect','--format',`{{index .Config.Labels "${label}"}}`,container]),nonce);
   for(const db of databases)sql('drop database if exists '+db+' with (force)');
   must('docker',['stop',container]);ownedContainer=false;
  }
 }finally{
  if(ownedNetwork){assert.equal(must('docker',['network','inspect','--format',`{{index .Labels "${label}"}}`,network]),nonce);must('docker',['network','rm',network]);}
  const target=realpathSync(work),inside=relative(realpathSync(toolRoot),target);
  assert.ok(inside && inside!=='..' && !inside.startsWith('..'+sep) && !isAbsolute(inside),'Cleanup must remain in owned ignored workspace directory');
  rmSync(target,{recursive:true});
 }
});

for(const scenario of ['fresh','staging']){
 test('actual CLI history INSERT rejection rolls back completed '+scenario+' SQL and permits genuine retry',()=>fixture(scenario,'reject',dbAndDir));
 function dbAndDir(db,dir){
  const before=snapshot(db);injectHistoryFault(db,scenario,'reject');
  const result=push(db,dir);
  assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/Injected history INSERT rejection after completed bootstrap SQL/);
  pendingObjectsAbsent(db);assert.deepEqual(snapshot(db),before);
  if(scenario==='staging'){
   assert.equal(canonical(db,old),'master_admin');
   assert.equal(sql(`select exists(select 1 from platform_private.master_bootstrap_approval where auth_user_id='${old}')`,db),'t');
  }
  retryAndVerify(db,dir,scenario);
 }
 test('actual CLI backend termination at '+scenario+' history INSERT rolls back completed SQL and permits retry',()=>fixture(scenario,'interrupt',async(db,dir)=>{
  const before=snapshot(db),app=injectHistoryFault(db,scenario,'pause'),running=pushAsync(db,dir);
  let pid='';
  for(let i=0;i<40;i++){
   pid=sql(`select pid from pg_stat_activity where datname='${db}' and application_name='${app}' and wait_event='PgSleep'`,'postgres',[],'supabase_admin');
   if(pid)break;await pause(250);
  }
  assert.match(pid,/^\d+$/,'CLI must reach the post-SQL history gate before termination');
  assert.equal(sql(`select pg_terminate_backend(pid) from pg_stat_activity where pid=${pid} and datname='${db}' and application_name='${app}'`,'postgres',[],'supabase_admin'),'t');
  const result=await running;assert.notEqual(result.status,0);
  pendingObjectsAbsent(db);assert.deepEqual(snapshot(db),before);
  if(scenario==='staging'){assert.equal(canonical(db,old),'master_admin');assert.equal(sql(`select exists(select 1 from platform_private.master_bootstrap_approval where auth_user_id='${old}')`,db),'t');}
  retryAndVerify(db,dir,scenario);
 }));
}
test('pipeline-flush negative control proves a temporary VACUUM copy is unsafe and rejected by the statement guard',()=>fixture('fresh','flush',(db,dir)=>{
 writeFileSync(join(dir,'supabase/migrations',filename),read('supabase/migrations/'+filename)+'\nvacuum;\n');
 injectHistoryFault(db,'fresh','reject');const result=push(db,dir);
 assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/Unsafe bootstrap batch statement: VACUUM/);
 assert.equal(history(db),'0');
 // Deliberately unsafe TEST COPY: a flush committed preceding SQL before the
 // rejected history INSERT. The production file must never acquire this shape.
 assert.equal(sql("select to_regclass('platform_private.master_identity') is not null and to_regprocedure('platform_private.bind_master(uuid,uuid,text)') is not null",db),'t');
}));
test('rerun the six real database groups against the same owned PG17/Auth/Vault infrastructure',t=>{
 const childEnv={...env,ORBITO_BOOTSTRAP_TEST_CONTAINER:container};
 // A nested Node runner must not inherit NODE_TEST_CONTEXT=child-v8; otherwise
 // it can exit without an independent report or running the requested suite.
 for(const key of Object.keys(childEnv))if(key.startsWith('NODE_TEST_'))delete childEnv[key];
 const result=run(process.execPath,['--test','--test-reporter=tap',join(root,'tests/production-bootstrap.test.mjs')],{cwd:root,env:childEnv,timeout:180000});
 successful(result);assert.match(result.stdout,/pass 6/);assert.match(result.stdout,/fail 0/);assert.match(result.stdout,/skipped 0/);
 t.diagnostic(redact(result.stdout));
});

// Forward feature coverage uses the same actual CLI, isolation and cleanup.
// The six historical bootstrap/history tests above retain their original behavior.
for(const scenario of ['fresh','staging'])test('team lifecycle CLI history rejection, full rollback and retry: '+scenario,()=>fixture(scenario,'team_forward',(db,dir)=>{
 successful(push(db,dir));
 if(scenario==='fresh')sql(`insert into auth.users(id,email,email_confirmed_at) values('${old}','fresh-master@example.test',now());select platform_private.initialize_config('Fresh fixture','Reviewed fixture');select platform_private.bind_master('${old}',null,'Reviewed fixture');`,db);
 assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',db),'12');
 sql(`insert into auth.sessions(id,user_id,created_at,updated_at) values('${old}','${old}',now(),now());`,db);
 // Native supautils from the cached official Supabase PG17 image, using its
 // unchanged provider allowlist. Fixture owners create their own objects;
 // no ownership transfer or internal-role membership is granted to postgres.
 // This database image has no Realtime service bootstrap, so supply its local
 // owner role as fixture metadata only (never a membership or migration caller).
 sql("do $$begin if not exists(select 1 from pg_roles where rolname='supabase_realtime_admin') then create role supabase_realtime_admin login;end if;end$$;",db,[],'supabase_admin');
 sql(`alter role supabase_storage_admin password '${password}';alter role supabase_realtime_admin password '${password}';`,db,[],'supabase_admin');
 const ownerSql=(body,user)=>must('docker',['exec','-i','-e','PGPASSWORD='+password,container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U',user,'-d',db,'-f','-'],{input:body});
 sql('create schema storage authorization supabase_storage_admin;create schema realtime authorization supabase_realtime_admin;',db,[],'supabase_admin');
 ownerSql('create table storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;','supabase_storage_admin');
 ownerSql('create table realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;','supabase_realtime_admin');
 sql(`grant usage on schema storage,realtime to postgres;alter role postgres nosuperuser;`,db,[],'supabase_admin');
 try{
 const authority=()=>sql(`select jsonb_build_object('superuser',(select rolsuper from pg_roles where rolname=current_user),
 'tables',(select jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
 'usage',pg_has_role(current_user,c.relowner,'USAGE'),'set',pg_has_role(current_user,c.relowner,'SET'),'rls',c.relrowsecurity) order by c.oid)
 from pg_class c where c.oid in ('storage.objects'::regclass,'realtime.messages'::regclass)))`,db);
 const originalAuthority=authority(),a=JSON.parse(originalAuthority);
 assert.equal(a.superuser,false);assert.equal(a.tables.length,2);
 assert.ok(a.tables.every(t=>!t.usage && !t.set && t.rls),'Caller must lack BOTH owner USAGE/SET memberships');
 const capability=()=>sql(`select count(*)=1 from pg_settings where name='supautils.policy_grants' and context='sighup'
 and (setting::jsonb->current_user) ?& array['storage.objects','realtime.messages']`,db);
 assert.equal(capability(),'t','Real loaded supautils and provider policy allowlist are required');
 const providerPolicyGrants=sql("select setting from pg_settings where name='supautils.policy_grants'",db);
 const managedSnapshot=()=>digest(must('docker',['exec',container,'pg_dump','-U','supabase_admin','-d',db,'--schema-only','--schema=storage','--schema=realtime']).replace(/^\\(?:un)?restrict .*$/gm,''));
 const policyCount=()=>sql("select count(*) from pg_policies where schemaname in ('storage','realtime') and policyname in ('platform_live_operator','platform_master_read_ceiling')",db);
 // Keep the obsolete guard solely in isolated negative-control copies. This
 // reproduction remains runnable after committing the correction, without
 // depending on Git HEAD still containing the old migration/preflight bytes.
 function obsoleteGuardCopy(file){
  const body=read('supabase/migrations/'+file),start=body.lastIndexOf('do $$ declare t record;');
  assert.ok(start>=0);
  return body.slice(0,start)+body.slice(start).replace('c.relrowsecurity','c.relowner,c.relrowsecurity')
   .replace("  execute format('create policy",`  if not pg_has_role(current_user,t.relowner,'USAGE') and not pg_has_role(current_user,t.relowner,'SET') then raise exception 'Obsolete managed policy owner permission required';end if;
  execute format('create policy`);
 }
 sql(read('supabase/bootstrap/team-lifecycle-preflight.sql')+read('supabase/bootstrap/role-read-preflight.sql'),db);
 const teamVersion='20261010233446',teamFile=teamVersion+'_platform_team_lifecycle_v2.sql',before=snapshot(db);
 const managedBefore=managedSnapshot();
 copyFileSync(join(root,'supabase/migrations',teamFile),join(dir,'supabase/migrations',teamFile));
 // Fault injection affects ONLY this owned container's provider configuration.
 // Keep real supautils loaded, allow Storage but withhold Realtime permission:
 // the first policy can execute, then 42501 must roll back the whole migration.
 function withoutRealtimePolicyGrant(workFixture){
  function configure(value){
   sql(`alter system set supautils.policy_grants='${value.replaceAll("'","''")}';select pg_reload_conf();`,db,[],'supabase_admin');
   let actual='';for(let n=0;n<20 && actual!==value;n++)actual=sql("select setting from pg_settings where name='supautils.policy_grants' and context='sighup'",db);
   assert.equal(actual,value,'Local supautils configuration reload must finish');
  }
  try{configure('{"postgres":["storage.objects"]}');assert.equal(capability(),'f');workFixture();}
  finally{configure(providerPolicyGrants);}
  assert.equal(capability(),'t');
 }
 withoutRealtimePolicyGrant(()=>{
  for(const file of ['team-lifecycle-preflight.sql','role-read-preflight.sql'])assert.throws(()=>sql(read('supabase/bootstrap/'+file),db),/CREATE POLICY permission unverified/);
  const denied=push(db,dir);assert.notEqual(denied.status,0);assert.match(denied.stderr+denied.stdout,/must be owner of table (objects|messages)/);
  assert.deepEqual(snapshot(db),before);assert.equal(managedSnapshot(),managedBefore);assert.equal(policyCount(),'0');assert.equal(authority(),originalAuthority);
 });
 // The obsolete owner requirement fails with real supautils available.
 writeFileSync(join(dir,'supabase/migrations',teamFile),obsoleteGuardCopy(teamFile));
 const legacyDenied=push(db,dir);assert.notEqual(legacyDenied.status,0);assert.match(legacyDenied.stderr+legacyDenied.stdout,/Obsolete managed policy owner permission required/);
 assert.deepEqual(snapshot(db),before);assert.equal(managedSnapshot(),managedBefore);
 copyFileSync(join(root,'supabase/migrations',teamFile),join(dir,'supabase/migrations',teamFile));
 sql(`create function supabase_migrations.team_history_fault() returns trigger language plpgsql as $$declare s text;begin
 if new.version='${teamVersion}' then
  if to_regclass('public.platform_team_archive') is null or to_regprocedure('public.platform_team_password_step(uuid,uuid,text,uuid)') is null
   or has_table_privilege('service_role','public.platform_users','INSERT,UPDATE,DELETE,TRUNCATE')
   or (select count(*) from pg_policies where policyname='platform_live_operator' and schemaname in ('storage','realtime') and permissive='RESTRICTIVE' and roles=array['authenticated']::name[] and cmd='ALL')<>2 then raise exception 'Team SQL did not complete';end if;
  foreach s in array new.statements loop
   s:=upper(regexp_replace(s,'^([[:space:]]|--[^\\n]*\\n)*','','g'));
   if s !~ '^(CREATE (OR REPLACE )?(TABLE|FUNCTION|TRIGGER|POLICY|UNIQUE INDEX) |INSERT INTO |ALTER TABLE |DROP POLICY |REVOKE |GRANT |DO[[:space:]])' then raise exception 'Pipeline-incompatible team statement: %',left(s,70);end if;
  end loop;
  raise exception 'Injected team history rejection after completed SQL';
 end if;return new;end$$;
 create trigger team_history_fault before insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.team_history_fault();`,db);
 const failed=push(db,dir);assert.notEqual(failed.status,0);assert.match(failed.stderr+failed.stdout,/Injected team history rejection after completed SQL/);
 assert.equal(sql("select to_regclass('public.platform_team_archive') is null and to_regprocedure('public.platform_team_password_step(uuid,uuid,text,uuid)') is null",db),'t');
 assert.equal(sql(`select count(*) from supabase_migrations.schema_migrations where version='${teamVersion}'`,db),'0');
 assert.deepEqual(snapshot(db),before);assert.equal(canonical(db,old),'master_admin');
 assert.equal(managedSnapshot(),managedBefore);assert.equal(policyCount(),'0');assert.equal(authority(),originalAuthority);
 sql('drop trigger team_history_fault on supabase_migrations.schema_migrations;drop function supabase_migrations.team_history_fault();',db);
 successful(push(db,dir));assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',db),'13');
 assert.equal(sql(`select count(*)=1 and bool_and(cardinality(statements)>0) from supabase_migrations.schema_migrations where version='${teamVersion}'`,db),'t');
 assert.equal(canonical(db,old),'master_admin');const committed=snapshot(db);successful(push(db,dir));assert.deepEqual(snapshot(db),committed);
 // Additional forward-14 proof. The original bootstrap/history harness above
 // retains its pinned CLI and original six regression scenarios unchanged.
 const readVersion='20261012231226',readFile=readVersion+'_platform_role_read_isolation.sql',beforeReads=snapshot(db);
 const managedBeforeReads=managedSnapshot();
 sql(read('supabase/bootstrap/role-read-preflight.sql'),db);
 copyFileSync(join(root,'supabase/migrations',readFile),join(dir,'supabase/migrations',readFile));
 withoutRealtimePolicyGrant(()=>{
  assert.throws(()=>sql(read('supabase/bootstrap/role-read-preflight.sql'),db),/CREATE POLICY permission unverified/);
  const denied=push(db,dir);assert.notEqual(denied.status,0);assert.match(denied.stderr+denied.stdout,/must be owner of table (objects|messages)/);
  assert.deepEqual(snapshot(db),beforeReads);assert.equal(managedSnapshot(),managedBeforeReads);assert.equal(policyCount(),'2');assert.equal(authority(),originalAuthority);
 });
 writeFileSync(join(dir,'supabase/migrations',readFile),obsoleteGuardCopy(readFile));
 const oldReadDenied=push(db,dir);assert.notEqual(oldReadDenied.status,0);assert.match(oldReadDenied.stderr+oldReadDenied.stdout,/Obsolete managed policy owner permission required/);
 assert.deepEqual(snapshot(db),beforeReads);assert.equal(managedSnapshot(),managedBeforeReads);
 copyFileSync(join(root,'supabase/migrations',readFile),join(dir,'supabase/migrations',readFile));
 sql(`create function supabase_migrations.read_history_fault() returns trigger language plpgsql as $$declare s text;begin
 if new.version='${readVersion}' then
  if to_regprocedure('public.platform_read_page(text,integer)') is null
   or has_function_privilege('authenticated','platform_private.usage_summary()','EXECUTE')
   or (select count(*) from pg_policies where policyname='platform_master_read_ceiling' and schemaname in ('storage','realtime'))<>2
   then raise exception 'Role-isolation SQL did not complete';end if;
  foreach s in array new.statements loop
   s:=upper(regexp_replace(s,'^([[:space:]]|--[^\\n]*\\n)*','','g'));
   if s !~ '^(CREATE (OR REPLACE )?(FUNCTION|POLICY) |ALTER (POLICY|FUNCTION) |REVOKE |GRANT |DO[[:space:]])' then raise exception 'Pipeline-incompatible role-isolation statement: %',left(s,70);end if;
  end loop;
  raise exception 'Injected role-isolation history rejection after completed SQL';
 end if;return new;end$$;
 create trigger read_history_fault before insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.read_history_fault();`,db);
 const failedReads=push(db,dir);assert.notEqual(failedReads.status,0);assert.match(failedReads.stderr+failedReads.stdout,/Injected role-isolation history rejection after completed SQL/);
 assert.equal(sql("select to_regprocedure('public.platform_read_page(text,integer)') is null",db),'t');
 assert.equal(sql(`select count(*) from supabase_migrations.schema_migrations where version='${readVersion}'`,db),'0');
 assert.equal(sql("select has_function_privilege('authenticated','platform_private.usage_summary()','EXECUTE')",db),'t');
 assert.deepEqual(snapshot(db),beforeReads);assert.equal(canonical(db,old),'master_admin');
 assert.equal(managedSnapshot(),managedBeforeReads);assert.equal(policyCount(),'2');assert.equal(authority(),originalAuthority);
 sql('drop trigger read_history_fault on supabase_migrations.schema_migrations;drop function supabase_migrations.read_history_fault();',db);
 successful(push(db,dir));assert.equal(sql('select count(*) from supabase_migrations.schema_migrations',db),'14');
 assert.equal(sql(`select count(*)=1 and bool_and(cardinality(statements)>0) from supabase_migrations.schema_migrations where version='${readVersion}'`,db),'t');
 assert.equal(canonical(db,old),'master_admin');const complete=snapshot(db);successful(push(db,dir));assert.deepEqual(snapshot(db),complete);
 sql(read('supabase/bootstrap/validate-role-reads.sql'),db);
 assert.equal(policyCount(),'4');assert.equal(authority(),originalAuthority);
 assert.equal(sql("select bool_and(permissive='RESTRICTIVE' and roles=array['authenticated']::name[] and cmd='ALL' and qual=with_check) from pg_policies where policyname in ('platform_live_operator','platform_master_read_ceiling') and schemaname in ('storage','realtime')",db),'t');
 }finally{
  // Undo only this fixture's stricter caller model before existing runner cleanup.
  sql('alter role postgres superuser',db,[],'supabase_admin');
 }
}));
