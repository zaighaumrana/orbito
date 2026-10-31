// Existing in-process PostgreSQL harness and actual forward schema.
// Crypto/Vault substitutes do not certify hosted cryptography or Auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const runtime=new URL('../../Orbitoshopv2-v1/node_modules/.legal-test-runtime/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url);
assert.ok(existsSync(runtime),'Existing isolated PostgreSQL test runtime required');
const {PGlite}=await import(runtime.href);
const read=(root,path)=>readFileSync(new URL(root+'/'+path,import.meta.url),'utf8');
const file='20261031001127_promote_support_v9.sql';
const promotion=read('..','supabase/migrations/'+file);
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

test('v9 control-plane approval: actual schema, immutable customer state and atomic denial',async t=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;'+read('..','tests/local-bootstrap.sql')+cryptoStub+vaultStub);
  for(const name of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<file).sort()){
   try{await db.exec(read('..','supabase/migrations/'+name).replace('create extension if not exists supabase_vault with schema vault;','-- existing in-process Vault substitute'));}
   catch(error){throw Error(name+': '+error.message);}
  }
  const uuid='99000000-0000-4000-8000-000000000088',v8='af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4';
  await db.exec(`insert into auth.users(id,email) values('${uuid}','approval-fixture@example.test');
   insert into public.clients(id,name,status,supabase_url,supabase_anon) values(9988,'Approval fixture','Active','https://abcdefghijklmnopqrst.supabase.co','');
   insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state,plan) values('${uuid}',9988,'${uuid}','managed-setup','{}','complete','{"original":"journal"}');
   insert into platform_private.managed_release_pins(request_id,release_id,release_sha256) values('${uuid}','support-v8','${v8}');
   insert into platform_private.shop_upgrade_jobs(request_id,client_id,mode,project_ref,source_id,client_binding,source_sha256,target_sha256,actor_id,session_id,state,plan,conditions,steps)
    values('${uuid}',9988,'byo','abcdefghijklmnopqrst','${uuid}','fixture-original-binding','${v8}','${v8}','${uuid}','${uuid}','complete','{"original":"plan"}','{"approval":"original"}','{"original":{"state":"passed"}}');
   insert into public.operator_audit(client_id,actor_id,action,detail) values(9988,'${uuid}','approval-fixture','{"preserve":true}');
   create temp table original_catalog as table platform_private.approved_shop_releases;`);
  const catalog=async()=> (await db.query('select * from platform_private.approved_shop_releases order by release_id')).rows;
  const protectedSnapshot=async()=>{
   const rows=[];
   for(const name of ['platform_private.managed_release_pins','platform_private.provision_jobs','platform_private.provision_stages','platform_private.shop_upgrade_jobs','public.operator_audit'])
    rows.push((await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${name} t`)).rows[0].value);
   const guards=(await db.query("select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname='platform_upgrade_prepare') or (n.nspname='platform_private' and p.proname='platform_managed_release_pin_unfenced') order by p.proname")).rows;
   return {rows,guards};
  };
  const before=await protectedSnapshot();
  const reset=()=>db.exec('delete from platform_private.approved_shop_releases;insert into platform_private.approved_shop_releases select * from original_catalog');
  const project=({release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility})=>({release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility});
  await t.test('successful approval matches JSON, preserves v8 pins/jobs/journals/guards and is idempotent',async()=>{
   await db.exec(promotion);
   const expected=JSON.parse(read('..','supabase/releases/approved-shop-releases.json')).map(project).sort((a,b)=>a.release_id.localeCompare(b.release_id));
   assert.deepEqual((await catalog()).map(project),expected);
   assert.deepEqual(await protectedSnapshot(),before);
   await db.exec(promotion);assert.deepEqual((await catalog()).map(project),expected);
   const acl=(await db.query("select relrowsecurity as rls,has_table_privilege('authenticated','platform_private.approved_shop_releases','UPDATE') as browser_write from pg_class where oid='platform_private.approved_shop_releases'::regclass")).rows[0];
   assert.deepEqual(acl,{rls:true,browser_write:false});
  });
  await t.test('historical hash, support policy, unexpected active and existing v9 conflicts fail closed',async()=>{
   for(const change of [
    "update platform_private.approved_shop_releases set sha256=repeat('0',64) where release_id='support-v7'",
    "update platform_private.approved_shop_releases set supported=true where release_id='support-v5'",
    "update platform_private.approved_shop_releases set approved_for_new=(release_id='support-v6')",
    "insert into platform_private.approved_shop_releases(release_id,sha256) values('support-v9',repeat('0',64))",
    "delete from platform_private.approved_shop_releases where release_id='support-v2'",
    "update platform_private.approved_shop_releases set successor='support-v7' where release_id='support-v8'",
    "insert into platform_private.approved_shop_releases(release_id,sha256) values('support-v10',repeat('1',64))"
   ]){
    await reset();await db.exec(change);const original=await catalog();
    await assert.rejects(()=>db.exec(promotion),/conflict|fresh-approved|Unexpected/);
    await db.exec('rollback');assert.deepEqual(await catalog(),original);
    assert.deepEqual(await protectedSnapshot(),before);
   }
  });
  await t.test('final-invariant failure rolls back the v9 insert and every predecessor update',async()=>{
   await reset();const original=await catalog();
   await db.exec(`create function platform_private.test_approval_denial() returns trigger language plpgsql as $$begin if new.release_id='support-v9' then new.approved_for_new:=false;end if;return new;end$$;
    create trigger test_approval_denial before update on platform_private.approved_shop_releases for each row execute function platform_private.test_approval_denial();`);
   await assert.rejects(()=>db.exec(promotion),/Final approved release catalog invariant failed/);
   await db.exec('rollback');assert.deepEqual(await catalog(),original);assert.deepEqual(await protectedSnapshot(),before);
   await db.exec('drop trigger test_approval_denial on platform_private.approved_shop_releases;drop function platform_private.test_approval_denial()');
  });
 }finally{await db.close();}
});
