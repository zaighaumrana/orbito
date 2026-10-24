// Two small, owned PG17 databases. No hosted targets or caller-supplied container.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const nonce=randomBytes(8).toString('hex'),container='retrasell-final-'+nonce,label='com.retrasell.final-test';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16e6,timeout:180000});if(r.status!==0)throw Error(r.stderr||r.error?.message||'Local Docker failed');return r.stdout.trim()};
const sql=(q,db)=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],q);
const id=n=>'99100000-0000-4000-8000-'+String(n).padStart(12,'0');
const claims=(actor,sid=actor)=>`select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${sid}","role":"authenticated"}',true);set local role authenticated;`;
const platformOnly=process.argv.includes('--platform-only');
let owned=false;
try{
 assert.equal(run(['version','--format','{{.Server.Os}}']),'linux');
 run(['run','-d','--network','none','--name',container,'--label',label+'='+nonce,'-e','POSTGRES_PASSWORD='+randomBytes(24).toString('hex'),'public.ecr.aws/supabase/postgres:17.6.1.155']);owned=true;
 for(let i=0;i<80;i++){try{run(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);break}catch{if(i===79)throw Error('Local PostgreSQL unavailable');await new Promise(r=>setTimeout(r,250))}}
 sql("do $$begin create role authenticator;exception when duplicate_object then null;end$$;",'postgres');
 for(const role of ['anon','authenticated','service_role'])sql(`do $$begin create role ${role} ${role==='service_role'?'bypassrls':''};exception when duplicate_object then null;end$$;`,'postgres');
 const bootstrap=read('tests/local-bootstrap.sql')+`create schema extensions;create extension pgcrypto with schema extensions;
 create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(new_secret text)returns uuid language plpgsql as $$declare v uuid;begin insert into vault.secrets(secret)values(new_secret)returning id into v;return v;end$$;
 create function vault.update_secret(secret_id uuid,new_secret text)returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;`;
 let preserved;
 const snapshot=()=>sql("select jsonb_build_array((select jsonb_agg(to_jsonb(x)) from auth.users x),(select jsonb_agg(to_jsonb(x)) from public.app_users x),(select jsonb_agg(to_jsonb(x)) from public.shop_config x),(select jsonb_agg(to_jsonb(x)) from app_private.bridge_config x),(select jsonb_agg(to_jsonb(x)) from app_private.owner_bootstrap x),(select jsonb_agg(to_jsonb(x)) from public.sales x),(select jsonb_agg(to_jsonb(x)) from public.shop_security x),(select jsonb_agg(to_jsonb(x)) from vault.secrets x))",'final_shop');
 for(const [db,repo] of [['final_shop','../Orbitoshopv2-v1/'],['final_platform','']]){
  if(platformOnly&&db==='final_shop')continue;
  sql('create database '+db,'postgres');sql(bootstrap,db);
  let applied=0;
  for(const file of readdirSync(new URL('../'+repo+'supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
   try{sql(read(repo+'supabase/migrations/'+file).replace('create extension if not exists supabase_vault with schema vault;','-- fixture Vault substitute'),db)}catch(e){throw Error(file+': '+e.message)}
   if(db==='final_shop'&&++applied===34){
    sql(`insert into auth.users(id,email)values('${id(70)}','preserved@example.test');insert into public.app_users(auth_user_id,email,display_name,role,status)values('${id(70)}','preserved@example.test','Preserved Owner','Business Owner','Active');update public.shop_config set onboarding_version=2,onboarding_completed_at=now(),platform_client_id=9970,shop_name='Existing preserved shop' where id=1;update app_private.bridge_config set client_binding='orbito-client-9970' where singleton;insert into app_private.owner_bootstrap(request_id,payload,owner_auth_id)values('${id(71)}','{"request_id":"${id(71)}"}','${id(70)}');insert into public.sales(customer_name,total_bill)values('Synthetic upgrade history',25);select vault.create_secret('synthetic-local-only');`,db);
    preserved=snapshot();
   }
  }
 }
 if(!platformOnly){
 assert.equal(snapshot(),preserved,'v2 additive SQL preserves existing owner/Auth, bootstrap reservation, business data, configuration, PIN hash and Vault bytes');
 console.log('PASS: existing v2 additive SQL preserves owner, reservation, business history and credentials.');
 // Owner and Support are real authenticated SQL roles with live fixture sessions.
 const db='final_shop',owner=id(70),support=id(2),manager=id(3),caseId=id(4),source=id(5);
 sql(`insert into auth.users(id,email)values('${support}','support@example.test'),('${manager}','manager@example.test');
 insert into public.app_users(auth_user_id,email,display_name,role,status)values('${support}','support@example.test','Support','Orbito Support','Active');
 update public.shop_config set onboarding_version=2,onboarding_completed_at=now(),platform_client_id=9900,suspended=false where id=1;
 update app_private.bridge_config set source_id='${source}',client_binding='orbito-client-9900' where singleton;`,db);
 const ownerQuery=q=>sql(`begin;${claims(owner)}${q};commit;`,db).split('\n').at(-1);
 assert.throws(()=>ownerQuery(`select public.support_consent('approve','${caseId}',null,'Investigate a verified customer repair case','AUTHORIZE SUPPORT','${id(6)}')`),/Verified case/);
 sql(`set role service_role;select public.support_case_observe('${caseId}',9900,'${source}','orbito-client-9900');`,db);
 const consent=JSON.parse(ownerQuery(`select public.support_consent('approve','${caseId}',null,'Investigate a verified customer repair case','AUTHORIZE SUPPORT','${id(6)}')`)).approved_id;
 assert.ok(consent);assert.equal(JSON.parse(ownerQuery(`select public.support_consent('approve','${caseId}',null,'Investigate a verified customer repair case','AUTHORIZE SUPPORT','${id(6)}')`)).approved_id,consent);assert.equal(sql('select count(*) from app_private.support_consents',db),'1');assert.throws(()=>sql(`begin;${claims(manager)}select public.support_consent('list');rollback;`,db),/Verified owner/);
 sql(`set role service_role;select public.support_consent_bind('${consent}','${support}','${support}','${id(99)}');`,db);
 assert.equal(sql(`begin;${claims(support)}select public.support_request_guard();select app_private.support_access_allowed();rollback;`,db).split('\n').at(-1),'t');
 assert.throws(()=>sql(`set role service_role;select public.support_consent_bind('${consent}','${support}','${support}','${id(99)}');`,db),/unused owner consent/);
 ownerQuery(`select public.support_consent('revoke',null,'${consent}')`);
 assert.throws(()=>sql(`begin;${claims(support)}select public.support_request_guard();rollback;`,db),/expired or revoked/);
 assert.equal(sql(`begin;${claims(support)}select app_private.support_access_allowed();rollback;`,db).split('\n').at(-1),'f');
 assert.equal(sql(`set role service_role;select public.support_session_authorized('${support}','${support}');`,db).split('\n').at(-1),'f');
 sql(`update app_private.support_consents set revoked_at=null,approved_at=now()-interval '1 hour',expires_at=now()-interval '30 minutes' where id='${consent}'`,db);
 assert.equal(sql(`set role service_role;select public.support_session_authorized('${support}','${support}');`,db).split('\n').at(-1),'f','Expiry denies new privileged operations');
 assert.equal(sql(`select count(*) from app_private.support_consent_events where consent_id='${consent}'`,db),'3');
 assert.equal(sql("select public.support_consent_capability()",db),'t');
 assert.equal(sql("select has_table_privilege('authenticated','app_private.support_consents','INSERT')",db),'f');
 console.log('PASS: Shop forward chain, real owner/Manager isolation, verified case, one-session binding, replay denial, revocation across Data API/RLS helper/Edge authority and immutable event history.');
 }
 const platform='final_platform';sql(read('tests/support-handoff.sql'),platform);
 const master='99000000-0000-4000-8000-000000000001',scope="select set_config('request.jwt.claims','{\"role\":\"service_role\",\"iss\":\"supabase\"}',false);set role service_role;";
 assert.throws(()=>sql(scope+`select public.platform_support_issue(9900,'${master}','${'a'.repeat(64)}','ukbhyerxshteyetwomqy','${master}',null);`,platform),/Owner approval identity/);
 sql(scope+`select public.platform_support_issue(9900,'${master}','${'a'.repeat(64)}','ukbhyerxshteyetwomqy','${master}','${id(9)}');`,platform);
 const sourceHash=sql("select secret_sha256 from platform_private.source_credentials where source_id='99000000-0000-4000-8000-000000000003'",platform);
 const exchanged=JSON.parse(sql(scope+`select public.platform_support_consume('${'a'.repeat(64)}','${sourceHash}',9900,'dexzxxqkbwnpetbsuxxv','orbito-client-9900','99000000-0000-4000-8000-000000000003');`,platform).split('\n').at(-1));
 assert.equal(exchanged.ok,true);assert.equal(exchanged.consent_id,id(9));
 const request='99000000-0000-4000-8000-000000000010';sql(`update platform_private.provision_jobs set state='running' where request_id='${request}'`,platform);
 const pin=(release,sha)=>sql(`set role service_role;select public.platform_managed_release_pin('${request}','${release}','${sha}');`,platform).split('\n').at(-1);
 const {release_id:release,sha256:sha}=JSON.parse(read('supabase/releases/active-shop-release.json'));
 assert.throws(()=>pin(release,'0'.repeat(64)),/Exact approved release/);
 assert.equal(JSON.parse(pin(release,sha)).sha256,sha);
 assert.equal(JSON.parse(pin('support-v2','144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414')).sha256,sha,'Existing pins never silently repin');
 assert.throws(()=>sql(`begin;${claims('99000000-0000-4000-8000-000000000001')}select public.platform_managed_release_pin('${request}','support-v3','${sha}');rollback;`,platform),/permission denied/);
 assert.equal(sql("select has_function_privilege('authenticated','platform_private.platform_support_issue_preconsent(integer,uuid,text,text,uuid)','EXECUTE')",platform),'f');
 assert.throws(()=>sql(read('supabase/staged-migrations/close_legacy_support_after_review.sql'),platform),/compatibility approval required/);
 sql("set retrasell.support_sender_compatibility='approved';\n"+read('supabase/staged-migrations/close_legacy_support_after_review.sql'),platform);
 assert.equal(sql("select has_any_column_privilege('anon','public.support_tickets','INSERT') or has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE')",platform),'f');
 console.log('PASS: Platform forward chain, exact catalog fingerprints, immutable job pins/ACL, consent-only issuance boundary, guarded anonymous closure and column/sequence revocation.');
}catch(error){if(owned){try{console.error(run(['logs','--tail','12',container]))}catch{}}throw error}
finally{if(owned){assert.equal(run(['inspect','-f','{{index .Config.Labels "'+label+'"}}',container]),nonce);run(['rm','-f',container]);}}
