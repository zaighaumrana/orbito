// Creates fresh disposable databases ONLY on loopback. Never reads Supabase env.
// Usage: node tests/run-onboarding-local.mjs [local-port] [Shop-repository-path]
// Requires a running local PostgreSQL server with trust auth for postgres.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
const port=process.argv[2] || '55439';
if(!/^\d{4,5}$/.test(port) || Number(port)>65535) throw Error('Local test port required');
const shop=resolve(process.argv[3] || '../Orbitoshopv2-v1');
const platform=resolve('.');
const prefix=`onboarding_test_${Date.now()}`;
const read=p=>readFileSync(p,'utf8');
function sql(db,text){
 const result=spawnSync(process.env.PSQL || 'psql',['-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-X','-q','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'});
 if(result.error || result.status) throw Error(result.error?.message || result.stderr);
}
function database(suffix){const db=prefix+'_'+suffix;sql('postgres',`create database ${db};`);return db;}
function migrations(root){return readdirSync(resolve(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();}
const shopAuth=read(resolve(shop,'tests/phase4-local-bootstrap.sql'))+`
alter table auth.users add column invited_at timestamptz,add column email_confirmed_at timestamptz,
 add column raw_user_meta_data jsonb,add column encrypted_password text;
`;
const fresh=database('shop');sql(fresh,shopAuth);
for(const f of migrations(shop)) sql(fresh,read(resolve(shop,'supabase/migrations',f)));
sql(fresh,read(resolve(shop,'tests/onboarding-v2.sql')));
sql(fresh,read(resolve(shop,'tests/manual-owner-activation.sql')));
sql(fresh,read(resolve(shop,'tests/onboarding-stabilization.sql')));
console.log('PASS Shop: full migration chain + bootstrap/recovery/conflict/completion SQL assertions');
for(const fixture of ['phase4-usage.sql','phase4-bridge.sql','phase4-thermal.sql','phase4-pin.sql']) sql(fresh,read(resolve(shop,'tests',fixture)));
console.log('PASS Shop: existing usage, repair billing, bridge, thermal and PIN SQL regressions');
const existing=database('existing');sql(existing,shopAuth);
const shopMigrations=migrations(shop);
for(const f of shopMigrations.filter(f=>f<'20260929090000_onboarding_v2.sql'))sql(existing,read(resolve(shop,'supabase/migrations',f)));
sql(existing,`insert into auth.users(id,email) values('60000000-0000-4000-8000-000000000001','existing@example.test');
 insert into public.app_users(auth_user_id,email,display_name,role) values('60000000-0000-4000-8000-000000000001','existing@example.test','Existing Owner','Business Owner');
 create table public.test_before as select to_jsonb(sc) as config from public.shop_config sc;
`);
for(const f of shopMigrations.filter(f=>f>='20260929090000_onboarding_v2.sql'))sql(existing,read(resolve(shop,'supabase/migrations',f)));
sql(existing,`do $$ begin
 if not exists(select 1 from public.shop_config sc,public.test_before b where sc.onboarding_version=0 and sc.onboarding_completed_at is not null
  and to_jsonb(sc)-array['onboarding_version','onboarding_completed_at','shop_email','paper_resupply_enabled']=b.config)
 then raise exception 'Existing Shop changed or requires onboarding'; end if;
 end $$;`);
console.log('PASS Existing Shop: same legacy-looking name and real owner retain every previous config field; no wizard');
for(const [label,seed] of [
 ['catalog',"insert into public.quick_items(name) values('Configured catalog item');"],
 ['pin',"select public.set_override_pin('4829');"],
 ['brand',"update public.shop_config set shop_name='Configured business' where id=1;"],
 ['support',"insert into auth.users(id,email) values('70000000-0000-4000-8000-000000000001','support@example.test'); insert into public.app_users(auth_user_id,email,display_name,role) values('70000000-0000-4000-8000-000000000001','support@example.test','Support','Orbito Support');"],
]) {
 const preserved=database(label);sql(preserved,shopAuth);
 for(const f of shopMigrations.filter(f=>f<'20260929090000_onboarding_v2.sql'))sql(preserved,read(resolve(shop,'supabase/migrations',f)));
 sql(preserved,seed+"create table public.test_before as select to_jsonb(sc) as config,(select override_pin_hash from public.shop_security where id=1) as pin from public.shop_config sc;");
 for(const f of shopMigrations.filter(f=>f>='20260929090000_onboarding_v2.sql'))sql(preserved,read(resolve(shop,'supabase/migrations',f)));
 sql(preserved,"do $$ begin if not exists(select 1 from public.shop_config sc,public.test_before b where sc.onboarding_completed_at is not null and to_jsonb(sc)-array['onboarding_version','onboarding_completed_at','shop_email','paper_resupply_enabled']=b.config and (select override_pin_hash from public.shop_security where id=1) is not distinct from b.pin) then raise exception 'Configured Shop or PIN modified'; end if; end $$;");
 console.log('PASS Migration preserves '+label+'-only setup');
}

const db=database('platform');
// Supabase Vault is not available in stock PostgreSQL. This substitute tests
// function contracts/ACLs/idempotency, not Vault encryption or hosted Auth SMTP.
const platformBootstrap=read(resolve(platform,'tests/local-bootstrap.sql'))+`
create schema extensions;create extension pgcrypto with schema extensions;
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text) returns uuid language plpgsql as $$ declare v uuid;begin insert into vault.secrets(secret) values(new_secret) returning id into v; return v; end $$;
create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$ update vault.secrets set secret=new_secret where id=secret_id $$;
`;
sql(db,platformBootstrap);
for(const f of migrations(platform))sql(db,read(resolve(platform,'supabase/migrations',f)).replace('create extension if not exists supabase_vault with schema vault;','-- disposable local Vault substitute'));
sql(db,read(resolve(platform,'tests/onboarding-v2.sql')));
sql(db,read(resolve(platform,'tests/manual-owner-activation.sql')));
sql(db,read(resolve(platform,'tests/onboarding-stabilization.sql')));
for(const fixture of ['control-plane.sql','currencies-boundaries.sql']) sql(db,read(resolve(platform,'tests',fixture)));
console.log('PASS Platform: full migrations, 12 plan/Inventory/Paper combinations with break variants, onboarding SQL, control plane and currency regressions');
// Reproduce the observed hosted upgrade shape using synthetic identity only:
// an existing real-email master authorized by UUID, with no platform_users row.
const upgrade=database('platform_identity_upgrade');sql(upgrade,platformBootstrap);
for(const f of migrations(platform).filter(f=>f<'20261001100000'))sql(upgrade,read(resolve(platform,'supabase/migrations',f)).replace('create extension if not exists supabase_vault with schema vault;','-- disposable local Vault substitute'));
sql(upgrade,read(resolve(platform,'tests/platform-master-upgrade-before.sql')));
for(const f of migrations(platform).filter(f=>f>='20261001100000'))sql(upgrade,read(resolve(platform,'supabase/migrations',f)));
sql(upgrade,read(resolve(platform,'tests/platform-master-upgrade.sql')));
console.log('PASS Platform upgrade: existing real-email UUID master, unchanged Auth/alias/authorization, RPC/RLS and no placeholder takeover');
console.log('Disposable local databases: '+[fresh,existing,db].join(', '));

// Two real database sessions race against the same Shop reservation.
const payload=JSON.parse(read(resolve(shop,'tests/onboarding-v2.sql')).match(/declare p jsonb:='([^']+)'/)[1]);
let reservationReady;
const ready=new Promise(resolve=>reservationReady=resolve);
const race=spawn(process.env.PSQL || 'psql',['-h','127.0.0.1','-p',port,'-U','postgres','-d',fresh,'-X','-q','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
let raceOutput='',raceError='';
race.stdout.on('data',data=>{raceOutput+=data;if(raceOutput.includes('reservation-held'))reservationReady();});
race.stderr.on('data',data=>raceError+=data);
const raceDone=new Promise((resolve,reject)=>{race.on('error',reject);race.on('close',status=>status?reject(Error(raceError)):resolve());});
race.stdin.end("begin; select public.bridge_onboarding('claim','"+JSON.stringify(payload)+"'); select 'reservation-held'; select pg_sleep(1); commit;");
await Promise.race([ready,raceDone.then(()=>{throw Error('Reservation was not observed');})]);
sql(fresh,"do $$ declare blocked boolean:=false;begin begin perform public.bridge_onboarding('claim','"+JSON.stringify(payload)+"'); exception when others then if sqlerrm='Bootstrap in progress' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'Concurrent duplicate got an invite lease';end if;end $$;");
await raceDone;
sql(fresh,"do $$ begin if (select count(*) from app_private.owner_bootstrap)<>1 or exists(select 1 from public.app_users where role='Business Owner') or exists(select 1 from public.employees) then raise exception 'Concurrent reservation duplicated identity';end if;end $$;");
console.log('PASS Two actual concurrent Shop sessions: only one invitation lease and reservation');
// Accepted invitation committed while the first response/finish is lost.
sql(fresh,"insert into auth.users(id,email,invited_at,email_confirmed_at,raw_user_meta_data) values('80000000-0000-4000-8000-000000000001','owner@example.test',now(),now(),jsonb_build_object('orbito_bootstrap_request','"+payload.request_id+"'));update app_private.owner_bootstrap set lease_until=now()-interval '1 second';do $$ declare r jsonb;begin r:=public.bridge_onboarding('claim','"+JSON.stringify(payload)+"');if r->>'owner_invite'<>'owner_invite_accepted' or not(r->>'already_provisioned')::boolean or (select count(*) from public.app_users where role='Business Owner' and employee_id is null)<>1 then raise exception 'Accepted invite could not be recovered';end if;end $$;");
console.log('PASS Invite acceptance before finish/response recovery: one Auth owner, no employee');

// Race first activation in a separate fresh Shop, not a previously mapped owner.
const manual=database('manual_concurrent');sql(manual,shopAuth);
for(const f of shopMigrations)sql(manual,read(resolve(shop,'supabase/migrations',f)));
sql(manual,"select public.bridge_onboarding('reserve','"+JSON.stringify(payload)+"');insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('82000000-0000-4000-8000-000000000001','owner@example.test',now(),'local-auth-placeholder');");
let activated;const firstActivation=new Promise(resolve=>activated=resolve);
const activation=spawn(process.env.PSQL || 'psql',['-h','127.0.0.1','-p',port,'-U','postgres','-d',manual,'-X','-q','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
let activationOutput='',activationError='';activation.stdout.on('data',data=>{activationOutput+=data;if(activationOutput.includes('activation-held'))activated();});activation.stderr.on('data',data=>activationError+=data);
const activationDone=new Promise((resolve,reject)=>{activation.on('error',reject);activation.on('close',status=>status?reject(Error(activationError)):resolve());});
const manualJWT="select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);set local role authenticated;";
activation.stdin.end("begin;"+manualJWT+"select public.activate_reserved_owner();select 'activation-held';select pg_sleep(1);commit;");
await Promise.race([firstActivation,activationDone.then(()=>{throw Error('Activation not observed');})]);
sql(manual,"begin;"+manualJWT+"select public.activate_reserved_owner();commit;");await activationDone;
sql(manual,"do $$ begin if (select count(*) from public.app_users where role='Business Owner' and employee_id is null)<>1 or (select count(*) from auth.users)<>1 or exists(select 1 from public.employees) or (select owner_auth_id from app_private.owner_bootstrap)<>'82000000-0000-4000-8000-000000000001' then raise exception 'Concurrent manual activation duplicated identity';end if;end $$;");
console.log('PASS Two actual concurrent authenticated first-owner claims: one canonical owner, one Auth user, zero employees');
