// Actual PG17, GoTrue schema and Vault. Three isolated databases; no hosted URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container||'',/^orbito-bootstrap-team-[a-f0-9]{16}$/);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,timeout:120000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=(q,db='postgres',user='postgres')=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',db,'-f','-'],q);
const base='support_'+process.pid,platform=base+'_platform',shops=[base+'_shop_a',base+'_shop_b'];
const master='96000000-0000-4000-8000-000000000001',manager='96000000-0000-4000-8000-000000000002',billing='96000000-0000-4000-8000-000000000003';
const owner='97000000-0000-4000-8000-000000000001',employee='97000000-0000-4000-8000-000000000002',otherManager='97000000-0000-4000-8000-000000000003';
const sources=['98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002'];
const refs=['abcdefghijklmnopqrst','bcdefghijklmnopqrstu'],hashes=['a'.repeat(64),'b'.repeat(64)];
const claims=(id)=>`select set_config('request.jwt.claim.sub','${id}',true);select set_config('request.jwt.claims','{"sub":"${id}","session_id":"${id}","role":"authenticated"}',true);`;
const user=(id,q)=>`begin;${claims(id)}set local role authenticated;${q};commit;`;
const service=q=>`begin;set local role service_role;${q};commit;`;
const value=(q,db=platform)=>JSON.parse(sql(q,db).split('\n').findLast(l=>l.startsWith('{')||l.startsWith('[')));
const actor=(i=0,who=owner,role='Business Owner')=>({auth_user_id:who,session_id:who,role,employee_id:role==='Manager'?1:null,source_id:sources[i],client_binding:'support-client-'+(100+i),platform_client_id:100+i});
const fields={subject:'<script>text only</script>',category:'technical',message:"Scanner disconnects; SELECT * FROM clients;"};
const request=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
const literal=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const create=(n=1,i=0,a=actor(i),f=fields)=>`select public.platform_support_ticket_create('${hashes[i]}',${literal({source_id:sources[i],project_ref:refs[i],client_binding:'support-client-'+(100+i)})},'${request(n)}',${literal(f)},${literal(a)},clock_timestamp())`;
const readTickets=(i=0,a=actor(i),id=null)=>`select public.platform_support_ticket_read('${hashes[i]}',${literal(a)},clock_timestamp(),${id?"'"+id+"'":'null'},0)`;
function chain(repo,db){const files=readdirSync(new URL('../'+repo+'supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
 const batch=files.map(f=>{const body=read(repo+'supabase/migrations/'+f);return '-- MIGRATION '+f+'\n'+(/^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;\n'+body+'\ncommit;');}).join('\n');
 sql(batch,db);
}

test.before(()=>{
 const dump=run(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault']);
 for(const db of [platform,...shops]){
  sql('create database '+db+' template template0');sql(dump,db,'supabase_admin');
  sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;',db);
  sql('create schema storage;create table storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;create schema realtime;create table realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;',db);
  chain(db===platform?'':'../Orbitoshopv2-v1/',db);
 }
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${master}','master@example.test',now()),('${manager}','staff@example.test',now()),('${billing}','billing@example.test',now());
  insert into auth.sessions(id,user_id,created_at) values('${master}','${master}',now()),('${manager}','${manager}',now()),('${billing}','${billing}',now());
  select platform_private.initialize_config('Fixture master','Isolated Support acceptance');select platform_private.bind_master('${master}',null,'Isolated Support acceptance');
  begin;select set_config('platform.team_transition','trusted',true);
  insert into public.platform_users(auth_user_id,name,email,role,status) values('${manager}','Staff','staff@example.test','portfolio_manager','Active'),('${billing}','Billing','billing@example.test','billing_person','Active');commit;`,platform);
 for(let i=0;i<2;i++){
  sql(`insert into public.clients(id,name,status,supabase_url,supabase_anon,onboarding_version,lifecycle_state,infrastructure_state,pairing_mode,plan,owner_name,owner_email,shop_url,currency) values(${100+i},'Synthetic ${i}','Active','https://${refs[i]}.supabase.co','',2,'Active','present','${i===0?'byo':'managed'}','Basic','Synthetic Owner','owner@example.test','https://shop.example.test','PKR');
   update public.clients set lifecycle_state='Active' where id=${100+i};
   insert into platform_private.shop_credentials(client_id,project_ref,client_binding) values(${100+i},'${refs[i]}','support-client-${100+i}');
   insert into public.bridge_sources(source_id,client_id,client_binding) values('${sources[i]}',${100+i},'support-client-${100+i}');
   insert into platform_private.support_ticket_credentials(enrollment_id,source_id,project_ref,client_binding,secret_sha256,shop_public_api_key,created_by,enabled) values('${request(100+i)}','${sources[i]}','${refs[i]}','support-client-${100+i}','${hashes[i]}','synthetic-public-key','${master}',true);`,platform);
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.test',now()),('${employee}','employee@example.test',now()),('${otherManager}','manager2@example.test',now());
   insert into auth.sessions(id,user_id,created_at) values('${owner}','${owner}',now()),('${employee}','${employee}',now()),('${otherManager}','${otherManager}',now());
   insert into public.employees(id,name,email,role,status) values(1,'Manager','employee@example.test','Manager','Active'),(2,'Manager 2','manager2@example.test','Manager','Active');
   insert into public.app_users(auth_user_id,employee_id,email,display_name,role,status) values('${owner}',null,'owner@example.test','Owner','Business Owner','Active'),('${employee}',1,'employee@example.test','Manager','Manager','Active'),('${otherManager}',2,'manager2@example.test','Manager 2','Manager','Active');
   insert into public.shop_config(id) values(1) on conflict do nothing;
   update public.shop_config set suspended=false,onboarding_version=2,platform_client_id=${100+i} where id=1;
   update app_private.bridge_config set source_id='${sources[i]}',client_binding='support-client-${100+i}' where singleton;`,shops[i]);
 }
});
test.after(()=>{for(const db of [platform,...shops])sql('drop database if exists '+db+' with (force)');});
test('native full migration chains and live canonical Shop role/session/employee/lifecycle checks',()=>{
 for(let i=0;i<2;i++)assert.deepEqual(value(user(owner,'select public.support_ticket_actor_context()'),shops[i]),actor(i));
 assert.equal(value(user(employee,'select public.support_ticket_actor_context()'),shops[0]).role,'Manager');
 const denied=q=>assert.throws(()=>sql(q,shops[0]),/denied|permission denied/);
 for(const role of ['Cashier','Technician','Orbito Support']){
  sql(`begin;update public.app_users set role='${role}',employee_id=${role==='Orbito Support'?'null':'1'} where auth_user_id='${employee}';commit;`,shops[0]);
  denied(user(employee,'select public.support_ticket_actor_context()'));
 }
 sql(`update public.app_users set role='Manager',employee_id=1 where auth_user_id='${employee}';update public.employees set status='Inactive' where id=1;`,shops[0]);denied(user(employee,'select public.support_ticket_actor_context()'));
 sql("update public.employees set status='Active',email='wrong@example.test' where id=1",shops[0]);denied(user(employee,'select public.support_ticket_actor_context()'));
 sql("update public.employees set email='employee@example.test' where id=1;update public.shop_config set suspended=true where id=1",shops[0]);denied(user(owner,'select public.support_ticket_actor_context()'));
 sql("update public.shop_config set suspended=false where id=1",shops[0]);
 sql(`delete from auth.sessions where id='${owner}'`,shops[0]);denied(user(owner,'select public.support_ticket_actor_context()'));
 sql(`insert into auth.sessions(id,user_id,created_at) values('${owner}','${owner}',now());update public.app_users set status='Inactive' where auth_user_id='${employee}'`,shops[0]);denied(user(employee,'select public.support_ticket_actor_context()'));
 sql(`update public.app_users set status='Active' where auth_user_id='${employee}'`,shops[0]);
 for(const role of ['anon','service_role'])denied(`begin;set local role ${role};select public.support_ticket_actor_context();commit;`);
});
test('atomic create, exact retry, conflicting actor/payload, source isolation and Manager privacy',()=>{
 const first=value(service(create()));assert.equal(first.accepted,true);assert.equal(value(service(create())).ticket_id,first.ticket_id);
 assert.throws(()=>sql(service(create(1,0,actor(0),{...fields,message:'changed'})),platform),/conflict/);
 assert.throws(()=>sql(service(create(1,0,actor(0,employee,'Manager'))),platform),/conflict/);
 value(service(create(2,0,actor(0,employee,'Manager'))));value(service(create(3,0,actor(0,otherManager,'Manager'))));
 assert.equal(value(service(readTickets(0,actor(0,employee,'Manager')))).length,1);
 assert.equal(value(service(readTickets(0))).length,3);
 assert.equal(value(service(readTickets(1,actor(1),first.ticket_id))).length,0);
 assert.equal(value(service(create(1,1))).accepted,true,'same request and user UUID in another project remain distinct');
 assert.throws(()=>sql(service(create(4,0,{...actor(),platform_client_id:101})),platform),/denied/);
 assert.throws(()=>sql(service(create(4,0,actor(),{...fields,client_id:101})),platform),/Invalid ticket/);
 sql(`create function platform_private.fixture_audit_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure';end$$;create trigger fixture_fail before insert on platform_private.support_ticket_events for each row execute function platform_private.fixture_audit_fail();`,platform);
 const sideEffects=sql("select jsonb_build_array((select count(*) from public.payments),(select count(*) from public.billing_cycles),(select count(*) from public.bridge_events),(select count(*) from platform_private.provision_jobs))",platform);
 assert.throws(()=>sql(service("select public.platform_ingest('"+hashes[0]+"','{}'::jsonb)"),platform),/authorized|credential|source|envelope/i);
 assert.equal(sql("select jsonb_build_array((select count(*) from public.payments),(select count(*) from public.billing_cycles),(select count(*) from public.bridge_events),(select count(*) from platform_private.provision_jobs))",platform),sideEffects);
 const before=sql('select count(*) from public.support_tickets',platform);
 assert.throws(()=>sql(service(create(4)),platform),/fixture audit failure/);assert.equal(sql('select count(*) from public.support_tickets',platform),before);
 sql('drop trigger fixture_fail on platform_private.support_ticket_events',platform);
 assert.equal(sql("select count(*) from platform_private.support_ticket_budgets where bucket='actor:"+sources[0]+':'+owner+"' and used=1",platform),'1','failed creates and replays do not charge quotas');
});
test('staff live authority, optimistic audited resolution, legacy wrapper and customer projection',()=>{
 const first=value(service(create()));const id=sql(`select ticket_id from platform_private.support_ticket_context where public_id='${first.ticket_id}'`,platform);
 assert.throws(()=>sql(user(billing,`select public.platform_support_ticket_page(0)`),platform),/not authorized/);
 const resolve=`select public.platform_support_ticket_resolve(${id},1,'Please reconnect the scanner.')`;
 sql("create function platform_private.fixture_resolution_fail() returns trigger language plpgsql as $$begin if new.action='support_ticket_resolved' then raise exception 'fixture resolution audit failure';end if;return new;end$$;create trigger fixture_resolution_fail before insert on public.operator_audit for each row execute function platform_private.fixture_resolution_fail();",platform);
 assert.throws(()=>sql(user(manager,resolve),platform),/fixture resolution audit failure/);
 assert.equal(sql("select status||':'||support_revision from public.support_tickets where id="+id,platform),'Open:1');
 assert.equal(sql("select count(*) from platform_private.support_ticket_events where action='resolved' and ticket_id="+id,platform),'0');
 sql('drop trigger fixture_resolution_fail on public.operator_audit',platform);
 assert.equal(value(user(manager,resolve)).revision,2);assert.equal(value(user(manager,resolve)).revision,2);
 assert.equal(sql(`select count(*) from platform_private.support_ticket_events where ticket_id=${id} and action='resolved'`,platform),'1');
 assert.equal(sql(`select count(*) from public.operator_audit where action='support_ticket_resolved' and detail->>'ticket_id'='${id}'`,platform),'1');
 assert.throws(()=>sql(user(master,`select public.platform_support_ticket_resolve(${id},1,'Changed')`),platform),/changed/);
 const customer=value(service(readTickets(0,actor(),first.ticket_id)))[0];assert.equal(customer.resolution,'Please reconnect the scanner.');assert.equal(Object.hasOwn(customer,'actor_user_id'),false);
 sql("insert into public.support_tickets(subject,message) values('Historical','Unverified')",platform);
 const legacy=value(user(master,'select public.platform_support_ticket_page(0)')).rows.find(t=>t.subject==='Historical');assert.equal(legacy.verified,false);
 sql(user(manager,`select public.platform_resolve_ticket(${legacy.id})`),platform);
 assert.throws(()=>sql(user(master,`update public.support_tickets set status='Open' where id=${id}`),platform),/permission denied/);
});
test('concurrent duplicates converge and quotas reject extra creates without charging accepted retries',async()=>{
 const command=service(create(5));
 const parallel=()=>new Promise((resolve,reject)=>{const c=execFile('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',platform],{windowsHide:true},(e,out,err)=>e?reject(Error(err)):resolve(out));c.stdin.end(command);});
 const results=await Promise.all([parallel(),parallel()]);const ids=results.map(s=>JSON.parse(s.split('\n').find(l=>l.startsWith('{'))).ticket_id);assert.equal(ids[0],ids[1]);
 sql(`update platform_private.support_ticket_budgets set used=10 where bucket='actor:${sources[0]}:${owner}'`,platform);
 assert.equal(value(service(create(5))).ticket_id,ids[0]);assert.throws(()=>sql(service(create(6)),platform),/quota/);
 sql(`update platform_private.support_ticket_budgets set used=1;update platform_private.support_ticket_budgets set used=50 where bucket='source:${sources[0]}'`,platform);
 assert.throws(()=>sql(service(create(6,0,actor(0,employee,'Manager'))),platform),/quota/);
});
test('Master-only disabled enrollment, recovery identity, rotation, revocation and re-pair invalidation',()=>{
 const data={project_ref:refs[0],source_id:sources[0],client_binding:'support-client-100',shop_public_api_key:'synthetic-approved-public-key',secret_sha256:'c'.repeat(64),scopes:['ticket:create','ticket:read']};
 const cmd=(who,action,d={},req=request(200))=>`select public.platform_support_credential_command('${who}','${who}',100,'${req}','${action}',${literal(d)})`;
 assert.throws(()=>sql(service(cmd(manager,'prepare',data)),platform),/Master administrator/);
 let prepared=value(service(cmd(master,'prepare',data)));assert.equal(prepared.enabled,false);assert.equal(value(service(cmd(master,'prepare',data))).key_id,prepared.key_id);
 assert.throws(()=>sql(service(cmd(master,'prepare',{...data,scopes:['ticket:read']})),platform),/conflict/);
 value(service(cmd(master,'enable',{capability:'retrasell-support-v1'})));
 assert.throws(()=>sql(service("select public.platform_support_ticket_source('"+hashes[0]+"','create')"),platform),/denied/);
 assert.equal(value(service("select public.platform_support_ticket_source('"+'c'.repeat(64)+"','create')")).source_id,sources[0]);
 const readOnly={...data,secret_sha256:'d'.repeat(64),scopes:['ticket:read']};
 value(service(cmd(master,'prepare',readOnly,request(201))));value(service(cmd(master,'enable',{capability:'retrasell-support-v1'},request(201))));
 assert.throws(()=>sql(service("select public.platform_support_ticket_source('"+'d'.repeat(64)+"','create')"),platform),/denied/);
 assert.equal(value(service("select public.platform_support_ticket_source('"+'d'.repeat(64)+"','list')")).source_id,sources[0]);
 value(service(cmd(master,'revoke',{},request(201))));assert.throws(()=>sql(service("select public.platform_support_ticket_source('"+'d'.repeat(64)+"','list')"),platform),/denied/);
 const replacement={...data,secret_sha256:'e'.repeat(64)};value(service(cmd(master,'prepare',replacement,request(202))));value(service(cmd(master,'enable',{capability:'retrasell-support-v1'},request(202))));
 for(const change of ["lifecycle_state='Suspended',status='Suspended'","lifecycle_state='Archived',status='Archived'","infrastructure_state='destroyed'","infrastructure_state='decommissioned'"]){assert.throws(()=>sql("begin;update public.clients set "+change+" where id=100;set local role service_role;select public.platform_support_ticket_source('"+'e'.repeat(64)+"','create');rollback;",platform),/denied/);}
 sql("update platform_private.shop_credentials set client_binding='new-binding' where client_id=100",platform);
 assert.equal(sql("select revoked_at is not null from platform_private.support_ticket_credentials where enrollment_id='"+request(202)+"'",platform),'t');
 assert.throws(()=>sql(service("select public.platform_support_ticket_source('"+'c'.repeat(64)+"','create')"),platform),/denied/);
 assert.equal(sql("select count(*) from platform_private.support_ticket_credentials where source_id='"+sources[0]+"' and revoked_at is null",platform),'0');
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`begin;set local role ${role};${cmd(master,'status')};commit;`,platform),/permission denied/);
});
test('managed credentials retain one protected Vault value through uncertain-install recovery',()=>{
 const data={project_ref:refs[1],source_id:sources[1],client_binding:'support-client-101',shop_public_api_key:'synthetic-approved-public-key',scopes:['ticket:create','ticket:read']};
 const cmd=(action,d={})=>"select public.platform_support_credential_command('"+master+"','"+master+"',101,'"+request(300)+"','"+action+"',"+literal(d)+")";
 const prepared=value(service(cmd('prepare',data)));assert.equal(prepared.enabled,false);assert.equal(Object.hasOwn(prepared,'secret'),false);
 value(service(cmd('installation_started')));value(service(cmd('installation_started')));
 assert.equal(value(service(cmd('status'))).installation_state,'uncertain_or_pending');
 assert.equal(sql("select count(*) from public.operator_audit where action='support_install_dispatched' and detail->>'request_id'='"+request(300)+"'",platform),'1');
 value(service(cmd('installation_acknowledged')));value(service(cmd('installation_acknowledged')));
 assert.equal(value(service(cmd('status'))).installation_state,'installed_unverified');
 const first=value(service(cmd('material'))),retry=value(service(cmd('material')));assert.ok(first.secret===retry.secret,'same enrollment recovers identical protected material');
 assert.equal(first.secret.length,64);assert.ok(createHash('sha256').update(first.secret).digest('hex')===first.secret_sha256,'lookup digest matches recovered material');
 assert.equal(value(service(cmd('prepare',data))).key_id,prepared.key_id);
 value(service(cmd('revoke')));assert.equal(Object.hasOwn(value(service(cmd('material'))),'secret'),false);
});
test('staged anonymous closure removes effective table/column/sequence access; private objects have no browser grants',()=>{
 sql(read('supabase/staged-migrations/close_anonymous_support.sql'),platform);
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`begin;set local role ${role};insert into public.support_tickets(client_name,subject,message) values('Forged','Denied','Denied');commit;`,platform),/permission denied/);
 assert.equal(sql("select has_any_column_privilege('anon','public.support_tickets','INSERT') or has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE,SELECT,UPDATE')",platform),'f');
 assert.equal(sql("select count(*) from pg_tables where schemaname='platform_private' and tablename like 'support_ticket_%' and not rowsecurity",platform),'0');
 for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`select count(*) from pg_tables where schemaname='platform_private' and tablename like 'support_ticket_%' and has_table_privilege('${role}',schemaname||'.'||tablename,'SELECT,INSERT,UPDATE,DELETE')`,platform),'0');
});
