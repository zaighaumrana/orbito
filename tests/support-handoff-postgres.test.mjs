// Opt-in real concurrency test. Only a disposable localhost cluster is allowed.
// ORBITO_LOCAL_SUPPORT_TEST_PORT selects the cluster; no hosted URL is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFile,execFileSync} from 'node:child_process';
const port=process.env.ORBITO_LOCAL_SUPPORT_TEST_PORT;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('real PostgreSQL: two overlapping server transactions atomically consume exactly one support grant',{skip:!port},async()=>{
 assert.match(port,/^\d{4,5}$/);assert.ok(Number(port)>1024 && Number(port)<65536);
 const psql=process.env.ORBITO_LOCAL_PSQL || 'psql';const database='support_handoff_'+process.pid;
 const sql=(query,db=database)=>new Promise((resolve,reject)=>{
  const child=execFile(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-f','-'],{windowsHide:true,maxBuffer:8*1024*1024},(error,stdout,stderr)=>{if(error){error.stderr=stderr;reject(error);}else resolve(stdout.trim());});
  child.stdin.end(query);
 });
 await sql('create database '+database,'postgres');
 try{
  assert.match(await sql('show server_version'),/^17[.]/);
  for(const role of ['anon','authenticated','service_role'])await sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
  await sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;
   create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
   create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
   create function vault.create_secret(new_secret text) returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret) values(new_secret) returning id into v;return v;end$$;
   create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`);
  for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
   const baseline=process.env.ORBITO_SUPPORT_REVIEW_BASELINE==='be43f28';
   const body=baseline && file.startsWith('20261010233446')?execFileSync('git',['show','be43f28b3a2cea0b1d73b2b9611a96818bed810d:supabase/migrations/'+file],{encoding:'utf8'}):read('supabase/migrations/'+file);
   await sql(body.replace('create extension if not exists supabase_vault with schema vault;','-- local Vault substitute'));
  }
  await sql(read('tests/support-handoff.sql'));
  const hash='a'.repeat(64),actor='99000000-0000-4000-8000-000000000001',masterSession='99000000-0000-4000-8000-000000000005';
  await sql(`delete from auth.sessions where id='${actor}';insert into auth.sessions(id,user_id) values('${masterSession}','${actor}');insert into auth.mfa_amr_claims(session_id,authentication_method) values('${masterSession}','password');`);
  const serviceClaims=`select set_config('request.jwt.claims','{"role":"service_role","iss":"supabase"}',true);select set_config('request.jwt.claim.sub','',true);`;
  if(process.env.ORBITO_SUPPORT_REVIEW_BASELINE==='be43f28'){
   assert.equal((await sql(`begin;set local request.jwt.claim.sub='${actor}';set local request.jwt.claims='{"sub":"${actor}","session_id":"${masterSession}"}';set local role authenticated;select public.platform_operator_identity()->>'role';rollback;`)).split('\n').at(-1),'master_admin');
   let issued=true;
   try{await sql(`begin;${serviceClaims}set local role service_role;select public.platform_support_issue(9900,'${actor}','${hash}','ukbhyerxshteyetwomqy');commit;`);}catch{issued=false;}
   // Seed an otherwise eligible preexisting capability as fixture owner only,
   // then exercise the actual baseline consume RPC with service claims/role.
   const scope=JSON.parse(await sql(`select jsonb_build_object('secret',sc.secret_sha256,'project',s.project_ref,'binding',s.client_binding,'source',b.source_id) from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where client_id=9900`));
   const result=await sql(`insert into platform_private.support_grants(token_hash,client_id,actor_id,project_ref,client_binding,source_id,issued_at,expires_at)
    select '${hash}',9900,'${actor}',s.project_ref,s.client_binding,b.source_id,now(),now()+interval '90 seconds' from platform_private.shop_credentials s join public.bridge_sources b using(client_id) where client_id=9900;
    begin;${serviceClaims}set local role service_role;select public.platform_support_consume('${hash}','${scope.secret}',9900,'${scope.project}','${scope.binding}','${scope.source}');rollback;`);
   const consumed=JSON.parse(result.split('\n').find(line=>line.includes('"ok"'))).ok;
   assert.deepEqual({issued,consumed},{issued:true,consumed:true},'be43f28 baseline: live browser Master exists, but service issue/exchange must not require invented user session claims');
   return;
  }
  assert.equal((await sql(`begin;${serviceClaims}select coalesce(platform_private.support_master_identity('${actor}')->>'auth_user_id','DENIED');rollback;`)).split('\n').at(-1),actor,'canonical capability actor must resolve without pretending the service request has a browser session');
  // Edge forwards the canonical session explicitly across its service boundary.
  // The service JWT contains no user claims. SQL rechecks the owned live session.
  await sql(`begin;${serviceClaims}set local role service_role;select public.platform_support_issue(9900,'${actor}','${hash}','ukbhyerxshteyetwomqy','${masterSession}');commit;`);
  const scope=JSON.parse(await sql(`select jsonb_build_object('secret',sc.secret_sha256,'project',s.project_ref,'binding',s.client_binding,'source',b.source_id) from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900`));
  const consume=`select public.platform_support_consume('${hash}','${scope.secret}',9900,'${scope.project}','${scope.binding}','${scope.source}')`;
  // Hold the client lock in one backend while the competing backend waits.
  // Both execute the real definer RPC and commit their own transaction.
  const a=sql(`set application_name='orbito-support-concurrency';begin;${serviceClaims}select id from public.clients where id=9900 for update;select pg_sleep(2);set local role service_role;${consume};commit;`);
  let locked=false;
  for(let i=0;i<20;i++){locked=await sql("select exists(select 1 from pg_stat_activity where application_name='orbito-support-concurrency' and wait_event='PgSleep')")==='t';if(locked)break;await new Promise(resolve=>setTimeout(resolve,25));}
  const b=sql(`begin;${serviceClaims}set local role service_role;${consume};commit;`);
  const results=(await Promise.all([a,b])).map(out=>JSON.parse(out.split('\n').find(line=>line.includes('"ok"'))));
  assert.equal(locked,true,'first backend held the row lock while the competing transaction started');
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>!r.ok).length,1);
  assert.equal(JSON.parse((await sql(`begin;${serviceClaims}set local role service_role;${consume};commit;`)).split('\n').at(-1)).ok,false,'subsequent replay denied');
  assert.equal(await sql("select count(*) from public.operator_audit where client_id=9900 and action='support_grant_consumed'"),'1');
  assert.equal(await sql("select count(*) from platform_private.support_grants where consumed_at is not null"),'1');
  const issue=(value,user=actor,session=masterSession)=>sql(`begin;${serviceClaims}set local role service_role;select public.platform_support_issue(9900,'${user}',repeat('${value}',64),'ukbhyerxshteyetwomqy',${session?"'"+session+"'":"null"});commit;`);
  const exchange=(value,override={})=>sql(`begin;${serviceClaims}set local role service_role;select public.platform_support_consume(repeat('${value}',64),'${override.secret || scope.secret}',${override.client || 9900},'${override.project || scope.project}','${override.binding || scope.binding}','${override.source || scope.source}');commit;`).then(out=>JSON.parse(out.split('\n').find(line=>line.includes('"ok"'))));
  await assert.rejects(()=>issue('b','99000000-0000-4000-8000-000000000002'),/Verified master/);
  await assert.rejects(()=>issue('b',actor,''),/Verified master/);
  for(const role of ['anon','authenticated','service_role'])await assert.rejects(()=>sql(`begin;${serviceClaims}set local role ${role};select public.platform_support_issue(9900,'${actor}',repeat('b',64),'ukbhyerxshteyetwomqy');commit;`),/permission denied/);
  for(const role of ['anon','authenticated'])await assert.rejects(()=>sql(`begin;${serviceClaims}set local role ${role};select public.platform_support_issue(9900,'${actor}',repeat('b',64),'ukbhyerxshteyetwomqy','${masterSession}');commit;`),/permission denied/);
  await assert.rejects(()=>issue('b',actor,'99000000-0000-4000-8000-000000000002'),/Verified master/,'wrong owner session');
  await sql(`update auth.sessions set not_after=now()-interval '1 minute' where id='${masterSession}'`);await assert.rejects(()=>issue('b'),/Verified master/);await sql(`update auth.sessions set not_after=null where id='${masterSession}'`);
  await assert.rejects(()=>sql(`begin;set local role authenticated;${consume};commit;`),/permission denied/);
  await issue('b');
  for(const override of [{client:9901},{project:'abcdefghijklmnopqrst'},{binding:'wrong'},{source:'99000000-0000-4000-8000-000000000099'},{secret:'f'.repeat(64)}])assert.equal((await exchange('b',override)).ok,false);
  assert.equal((await exchange('b')).ok,true,'failed binding checks must not consume the grant');
  await issue('c');await sql("update platform_private.support_grants set issued_at=now()-interval '100 seconds',expires_at=now()-interval '10 seconds' where token_hash=repeat('c',64)");assert.equal((await exchange('c')).ok,false,'expiry');
  await issue('d');await sql(`update auth.users set banned_until=now()+interval '1 day' where id='${actor}'`);assert.equal((await exchange('d')).ok,false,'revoked Master');await assert.rejects(()=>issue('e'),/Verified master/);
  await sql(`update auth.users set banned_until=null where id='${actor}'`);
  await sql(`update auth.users set email=null where id='${actor}'`);await assert.rejects(()=>issue('f'),/Verified master/);
  await sql(`update auth.users set email='canonical-master@example.test' where id='${actor}'`);
  await issue('9');
  await issue('e');await sql(`delete from auth.sessions where id='${masterSession}'`);await assert.rejects(()=>issue('f'),/Verified master/);
  assert.equal((await exchange('e')).ok,true,'a recorded 90-second capability is distinct from a browser session, while its canonical actor remains valid');
  const replacement='99000000-0000-4000-8000-000000000004';
  await sql(`insert into auth.users(id,email,email_confirmed_at) values('${replacement}','replacement@example.test',now());select platform_private.bind_master('${replacement}','${actor}','Reviewed synthetic support rebinding');`);
  assert.equal((await exchange('9')).ok,false,'outstanding grants of the former bound Master are revoked');
  assert.equal(await sql("select count(*) from public.operator_audit where action='support_grant_failed' and detail->>'reason'='actor_revoked'"),'2');
 }finally{await sql('drop database '+database,'postgres');}
});
