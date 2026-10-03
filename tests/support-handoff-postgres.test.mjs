// Opt-in real concurrency test. Only a disposable localhost cluster is allowed.
// ORBITO_LOCAL_SUPPORT_TEST_PORT selects the cluster; no hosted URL is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFile} from 'node:child_process';
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
  for(const role of ['anon','authenticated','service_role'])await sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
  await sql(read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;
   create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
   create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
   create function vault.create_secret(new_secret text) returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret) values(new_secret) returning id into v;return v;end$$;
   create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`);
  for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await sql(read('supabase/migrations/'+file).replace('create extension if not exists supabase_vault with schema vault;','-- local Vault substitute'));
  await sql(read('tests/support-handoff.sql'));
  const hash='a'.repeat(64),actor='99000000-0000-4000-8000-000000000001';
  await sql(`set role service_role;select public.platform_support_issue(9900,'${actor}','${hash}','ukbhyerxshteyetwomqy');`);
  const consume=`select public.platform_support_consume('${hash}',sc.secret_sha256,9900,s.project_ref,s.client_binding,b.source_id) from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900`;
  // Hold the client lock in one backend while the competing backend waits.
  // Both execute the real definer RPC and commit their own transaction.
  const a=sql(`set application_name='orbito-support-concurrency';begin;select id from public.clients where id=9900 for update;select pg_sleep(2);${consume};commit;`);
  let locked=false;
  for(let i=0;i<20;i++){locked=await sql("select exists(select 1 from pg_stat_activity where application_name='orbito-support-concurrency' and wait_event='PgSleep')")==='t';if(locked)break;await new Promise(resolve=>setTimeout(resolve,25));}
  const b=sql(`begin;${consume};commit;`);
  const results=(await Promise.all([a,b])).map(out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{'))));
  assert.equal(locked,true,'first backend held the row lock while the competing transaction started');
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>!r.ok).length,1);
  assert.equal(JSON.parse(await sql(consume)).ok,false,'subsequent replay denied');
  assert.equal(await sql("select count(*) from public.operator_audit where client_id=9900 and action='support_grant_consumed'"),'1');
  assert.equal(await sql("select count(*) from platform_private.support_grants where consumed_at is not null"),'1');
 }finally{await sql('drop database '+database,'postgres');}
});
