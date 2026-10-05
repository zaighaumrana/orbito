// In-process PostgreSQL, no server/listening socket/cache or hosted connection.
// Crypto/Vault substitutes validate SQL behavior/ACLs, NOT encryption or bcrypt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const runtime=new URL('../../Orbitoshopv2-v1/node_modules/.legal-test-runtime/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url);
const {PGlite}=existsSync(runtime)?await import(runtime.href):{};
const read=(root,path)=>readFileSync(new URL(root+'/'+path,import.meta.url),'utf8');
const cryptoStub=`create schema extensions;
 create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
 create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat(md5(gen_random_uuid()::text),ceil(n/16.0)::integer),'hex')::bytea $$;
 create function extensions.digest(s text,algorithm text) returns bytea language sql as $$select decode(md5(s)||md5(s),'hex')$$;
 create function extensions.gen_salt(algorithm text,cost integer default 12) returns text language sql as $$select 'local-test-salt'::text$$;
 create function extensions.crypt(s text,salt text) returns text language sql as $$select md5(s)$$;`;
const vaultStub=`create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
 create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(new_secret text) returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret) values(new_secret) returning id into v;return v;end$$;
 create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`;
async function migrations(db,root){for(const file of readdirSync(new URL(root+'/supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
 try{await db.exec(read(root,'supabase/migrations/'+file).replace('create extension if not exists supabase_vault with schema vault;','-- in-process Vault substitute'));}catch(error){throw Error(file+': '+error.message);}
}}
test('Platform full forward chain: lifecycle, unknown operations, stage retry, RBAC and retained history',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;'+read('..','tests/local-bootstrap.sql')+cryptoStub+vaultStub);
  await migrations(db,'..');await db.exec(read('..','tests/platform-overhaul.sql'));await db.exec(read('..','tests/support-access.sql'));
  const {rows}=await db.query("select has_function_privilege('anon','public.platform_client_lifecycle(integer,text,text,text)','EXECUTE') as allowed");assert.equal(rows[0].allowed,false);
  await verifySupportHandoff(db);
 }finally{await db.close();}
});
async function verifySupportHandoff(db){
 await db.exec(read('..','tests/support-handoff.sql'));
 const actor='99000000-0000-4000-8000-000000000001',manager='99000000-0000-4000-8000-000000000002';
 const row=(await db.query(`select s.project_ref,s.client_binding,b.source_id,sc.secret_sha256 from platform_private.shop_credentials s join public.bridge_sources b using(client_id) join platform_private.source_credentials sc using(source_id) where s.client_id=9900`)).rows[0];
 const issue=async(hash,user=actor)=>(await db.query('select public.platform_support_issue(9900,$1,$2,$3) as result',[user,hash,'ukbhyerxshteyetwomqy'])).rows[0].result;
 const consume=async(hash,overrides={})=>{
  const values={hash,secret:row.secret_sha256,client:9900,project:row.project_ref,binding:row.client_binding,source:row.source_id,...overrides};
  return (await db.query('select public.platform_support_consume($1,$2,$3,$4,$5,$6) as result',Object.values(values))).rows[0].result;
 };
 const snapshot=()=>db.query(`select to_jsonb(c) as client,(select to_jsonb(s) from platform_private.shop_credentials s where client_id=9900) as credentials,(select jsonb_agg(to_jsonb(j)) from platform_private.provision_jobs j where client_id=9900) as jobs from public.clients c where id=9900`);
 const before=(await snapshot()).rows;
 await db.exec('set role service_role');
 assert.equal((await issue('a'.repeat(64))).shop_url,'https://shop.example.test','Suspended grants allowed');
 await assert.rejects(()=>issue('b'.repeat(64),manager),/Verified master/);
 await db.exec('reset role');
 const stored=(await db.query('select token_hash,actor_id,extract(epoch from expires_at-issued_at)::integer as seconds from platform_private.support_grants')).rows[0];
 assert.equal(stored.seconds,90);assert.equal(stored.actor_id,actor);assert.equal(stored.token_hash,'a'.repeat(64));
 for(const override of [{client:9901},{project:'abcdefghijklmnopqrst'},{binding:'wrong-binding'},{source:'99000000-0000-4000-8000-000000000099'},{secret:'f'.repeat(64)}])assert.equal((await consume('a'.repeat(64),override)).ok,false);
 const results=await Promise.all([consume('a'.repeat(64)),consume('a'.repeat(64))]);
 assert.equal(results.filter(r=>r.ok).length,1,'two concurrent submissions of actual SQL consume yield exactly one assertion');
 const success=results.find(r=>r.ok);assert.equal(success.platform_user_id,actor);assert.equal(success.platform_email,'canonical-master@example.test');
 assert.equal((await consume('a'.repeat(64))).ok,false,'replay denied');
 await issue('b'.repeat(64));await db.exec("update platform_private.support_grants set issued_at=statement_timestamp()-interval '100 seconds',expires_at=statement_timestamp()-interval '10 seconds' where token_hash=repeat('b',64)");
 assert.equal((await consume('b'.repeat(64))).ok,false,'expiry denied');
 await issue('c'.repeat(64));await db.exec("update auth.users set email=null where id='99000000-0000-4000-8000-000000000001'");
 assert.equal((await consume('c'.repeat(64))).ok,false,'canonical actor rechecked at consumption');
 await db.exec("update auth.users set email='canonical-master@example.test' where id='99000000-0000-4000-8000-000000000001'");
 await assert.rejects(()=>db.query('select public.platform_support_issue(9901,$1,$2,$3)',[actor,'f'.repeat(64),'ukbhyerxshteyetwomqy']),/Eligible paired/);
 for(const state of ['Archived','destroyed','decommissioned']){
  await db.exec('begin');
  await issue('d'.repeat(64));
  const column=state==='Archived'?'lifecycle_state':'infrastructure_state';
  await db.query(`update public.clients set ${column}=$1 where id=9900`,[state]);
  await db.exec('savepoint denied');
  await assert.rejects(()=>issue('e'.repeat(64)),/Eligible paired/);
  await db.exec('rollback to savepoint denied');
  assert.equal((await consume('d'.repeat(64))).ok,false,'retired or unsupported client denied at exchange');
  await db.exec('rollback');
 }
 await db.exec("update public.clients set lifecycle_state='Active' where id=9900");assert.ok((await issue('e'.repeat(64))).expires_at);
 await db.exec("update public.clients set lifecycle_state='Suspended' where id=9900");
 assert.deepEqual((await snapshot()).rows,before,'support does not change lifecycle/billing/pairing/provisioning');
 for(const role of ['anon','authenticated']){
  const acl=(await db.query(`select has_table_privilege($1,'platform_private.support_grants','SELECT') as table_read,has_function_privilege($1,'public.platform_support_issue(integer,uuid,text,text)','EXECUTE') as issue,has_function_privilege($1,'public.platform_support_consume(text,text,integer,text,text,uuid)','EXECUTE') as consume`,[role])).rows[0];
  assert.deepEqual(acl,{table_read:false,issue:false,consume:false});
 }
 const audits=(await db.query("select action,detail from public.operator_audit where action like 'support_grant_%' and client_id=9900")).rows;
 assert.ok(audits.some(a=>a.action==='support_grant_issued'));assert.ok(audits.some(a=>a.action==='support_grant_consumed'));assert.ok(audits.some(a=>a.detail.reason==='expired'));assert.ok(audits.some(a=>a.detail.reason==='replayed'));
 assert.doesNotMatch(JSON.stringify(audits),/[a-f0-9]{64}|secret|token_hash|canonical-master/);
}
test('Shop full forward chain: durable configuration replay preserves later settings and ACLs',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
  await db.exec(read('../../Orbitoshopv2-v1','tests/phase4-local-bootstrap.sql').replace('create extension pgcrypto with schema extensions;','')+cryptoStub.replace('create schema extensions;','')+`alter table auth.users add column invited_at timestamptz,add column email_confirmed_at timestamptz,add column raw_user_meta_data jsonb,add column encrypted_password text;`);
  await migrations(db,'../../Orbitoshopv2-v1');await db.exec(read('../../Orbitoshopv2-v1','tests/config-journal.sql'));
  const policy=await db.query('select published,required_revision from app_private.legal_policy where singleton');
  assert.equal(policy.rows[0].published,false);assert.equal(policy.rows[0].required_revision,'2026-10-03.1');
 }finally{await db.close();}
});
test('actual managed migration envelopes atomically apply the approved Shop chain and replay once',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
  await db.exec(read('../../Orbitoshopv2-v1','tests/phase4-local-bootstrap.sql').replace('create extension pgcrypto with schema extensions;','')+cryptoStub.replace('create schema extensions;','')+`alter table auth.users add column invited_at timestamptz,add column email_confirmed_at timestamptz,add column raw_user_meta_data jsonb,add column encrypted_password text;`);
  const ctx=vm.createContext({});vm.runInContext(stripTypeScriptTypes(read('..','supabase/functions/_shared/managed-setup.ts').replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
  const release=JSON.parse(read('..','supabase/functions/_shared/shop-release.json'));
  for(const m of release.migrations){try{await db.exec(ctx.managedMigrationQuery(m));}catch(e){throw Error(m.version+': '+e.message);}}
  for(const m of release.migrations)await db.exec(ctx.managedMigrationQuery(m));
  const history=await db.query('select count(*)::integer as count from supabase_migrations.schema_migrations');assert.equal(history.rows[0].count,release.migrations.length);
  const ownershipQuery="select sc.onboarding_version,sc.platform_client_id,bc.client_binding,b.payload->>'request_id' as owner_request,exists(select 1 from public.app_users where role='Business Owner') as has_owner from public.shop_config sc cross join app_private.bridge_config bc left join app_private.owner_bootstrap b on b.singleton where sc.id=1 and bc.singleton";
  assert.deepEqual((await db.query(ownershipQuery)).rows,[{onboarding_version:0,platform_client_id:null,client_binding:null,owner_request:null,has_owner:false}]);
  const payload={request_id:'97000000-0000-4000-8000-000000000001',platform_client_id:42,client_binding:'orbito-client-42',business_name:'Test Shop',owner_name:'Test Owner',owner_email:'owner@example.test',billing_currency:'PKR',shop_url:'https://shop.example.test',modules:{repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:false,live_tracking_enabled:false,ems_enabled:false,ems_track_breaks:false},paper_resupply_enabled:false,onboarding_version:2};
  await db.query("select public.bridge_onboarding('reserve',$1::jsonb)",[JSON.stringify(payload)]);
  assert.deepEqual((await db.query(ownershipQuery)).rows,[{onboarding_version:2,platform_client_id:42,client_binding:payload.client_binding,owner_request:payload.request_id,has_owner:false}]);
  await db.exec(read('../../Orbitoshopv2-v1','tests/config-journal.sql'));
 }finally{await db.close();}
});
