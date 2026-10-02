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
  await migrations(db,'..');await db.exec(read('..','tests/platform-overhaul.sql'));
  const {rows}=await db.query("select has_function_privilege('anon','public.platform_client_lifecycle(integer,text,text,text)','EXECUTE') as allowed");assert.equal(rows[0].allowed,false);
 }finally{await db.close();}
});
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
  await db.exec(read('../../Orbitoshopv2-v1','tests/config-journal.sql'));
 }finally{await db.close();}
});
