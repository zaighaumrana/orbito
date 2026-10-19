// Actual PG17, GoTrue schema and Vault. Three isolated databases; no hosted URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync,execFile} from 'node:child_process';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {actor as verifyActor} from '../supabase/functions/platform-support-tickets/protocol.ts';
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
// Keep transactions open over stdin to observe actual overlapping backend locks.
// READY is emitted only after the RPC has returned and acquired its locks.
function connection(name,q,hold=false){
 let out='',err='',readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const child=execFile('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',platform],{windowsHide:true,timeout:25000},(e)=>{if(e)readyReject(Error(err||e.message));});
 const done=new Promise((resolve,reject)=>{child.on('close',code=>code===0?resolve(out):reject(Error(err)));child.on('error',reject);});
 // A rejected backend can exit before the caller reaches ready/done.
 done.catch(()=>{});ready.catch(()=>{});
 child.stdout.on('data',c=>{out+=c;if(out.includes('SUPPORT_READY'))readyResolve();});child.stderr.on('data',c=>err+=c);
 child.stdin.write("begin;set local application_name='"+name+"';set local statement_timeout='20s';"+q+";select 'SUPPORT_READY';\n");
 if(!hold)child.stdin.end('commit;\n');
 return {ready,done,finish:(commit=true)=>{child.stdin.end(commit?'commit;\n':'rollback;\n');return done;}};
}
async function blocked(name){
 const deadline=Date.now()+12000;
 while(Date.now()<deadline){if(sql("select exists(select 1 from pg_stat_activity where application_name='"+name+"' and cardinality(pg_blocking_pids(pid))>0)",platform)==='t')return;await new Promise(r=>setTimeout(r,25));}
 assert.fail('Expected an observed backend lock wait for '+name);
}
test('shared reads overlap; create/revoke/re-pair/config/billing/resolution writers retain client-first fences',async()=>{
 sql('update platform_private.support_ticket_budgets set used=1',platform);
 const held=[];const open=async(name,q)=>{const c=connection(name,q,true);held.push(c);await c.ready;return c;};
 try{
  const r1=await open('support_read_one',readTickets());
  const r2=await open('support_read_two',readTickets());
  assert.equal(sql("select count(*) from pg_stat_activity where application_name in ('support_read_one','support_read_two') and cardinality(pg_blocking_pids(pid))=0",platform),'2','readers coexist in independent backends');
  await r2.finish();held.splice(held.indexOf(r2),1);
  const createWriter=connection('support_create_wait',create(9001));await blocked('support_create_wait');
  await r1.finish();held.splice(held.indexOf(r1),1);await createWriter.done;
  // The existing public configuration/billing mutation boundaries lock client
  // before jobs, cycles or credentials. Use the actual business RPC where safe.
  const cases=[
   ['revoke',"select public.platform_support_credential_command('"+master+"','"+master+"',100,'"+request(100)+"','revoke','{}')"],
   ['repair',"select 1 from public.clients where id=100 for update;update platform_private.shop_credentials set client_binding='race-new-binding' where client_id=100"],
   ['config',claims(master)+"set local role authenticated;select public.platform_begin_config(100,'"+request(9002)+"','{\"suspended\":false}')"],
   ['provision',claims(master)+"set local role authenticated;select public.platform_provision_begin(100,'"+request(9003)+"','verify','{}')"],
   ['billing',claims(billing)+"set local role authenticated;select public.platform_set_rates(100,3,2,false)"],
   ['resolve',claims(master)+"set local role authenticated;select public.platform_resolve_ticket("+sql("select ticket_id from platform_private.support_ticket_context where request_id='"+request(9001)+"'",platform)+")"]
  ];
  for(const [name,q] of cases){
   const reader=await open('support_read_'+name,readTickets());
   // Hold the mutation for rollback: no fixture authority or billing intent changes.
   const writer=connection('support_write_'+name,q,true);held.push(writer);await blocked('support_write_'+name);
   await reader.finish();held.splice(held.indexOf(reader),1);await writer.ready;await writer.finish(false);held.splice(held.indexOf(writer),1);
  }
  // Writer first: after a committed revocation, a queued read revalidates and fails.
  const revoke=await open('support_revoke_first',"select public.platform_support_credential_command('"+master+"','"+master+"',100,'"+request(100)+"','revoke','{}')");
  const queued=connection('support_read_after_revoke',readTickets());await blocked('support_read_after_revoke');await revoke.finish();held.splice(held.indexOf(revoke),1);
  await assert.rejects(queued.done,/denied/);
  // Only fixture owner restores this synthetic key for the remaining campaigns.
  sql("update platform_private.support_ticket_credentials set revoked_at=null,enabled=true where secret_sha256='"+hashes[0]+"'",platform);
  const pairing=await open('support_pair_first',"select 1 from public.clients where id=100 for update;update platform_private.shop_credentials set client_binding='race-new-binding' where client_id=100");
  const afterPair=connection('support_read_after_pair',readTickets());await blocked('support_read_after_pair');const createPair=connection('support_create_after_pair',create(9012));await blocked('support_create_after_pair');await pairing.finish();held.splice(held.indexOf(pairing),1);await assert.rejects(afterPair.done,/denied/);await assert.rejects(createPair.done,/denied/);
  sql("update platform_private.shop_credentials set client_binding='support-client-100' where client_id=100;update platform_private.support_ticket_credentials set revoked_at=null,enabled=true where secret_sha256='"+hashes[0]+"'",platform);
 }finally{for(const c of held)await c.finish(false).catch(()=>{});}
});
test('creation queued behind credential rotation is denied after fresh client-first revalidation',async()=>{
 const data={project_ref:refs[0],source_id:sources[0],client_binding:'support-client-100',shop_public_api_key:'synthetic-approved-public-key',secret_sha256:'9'.repeat(64),scopes:['ticket:create','ticket:read']};
 const command=(action,d={})=>"select public.platform_support_credential_command('"+master+"','"+master+"',100,'"+request(9010)+"','"+action+"',"+literal(d)+")";
 value(service(command('prepare',data)));
 const rotation=connection('support_rotation',command('enable',{capability:'retrasell-support-v1'}),true);await rotation.ready;
 const queued=connection('support_create_after_rotation',create(9011));await blocked('support_create_after_rotation');await rotation.finish();await assert.rejects(queued.done,/denied/);
 assert.equal(sql("select count(*) from platform_private.support_ticket_context where request_id='"+request(9011)+"'",platform),'0');
 value(service(command('revoke')));sql("update platform_private.support_ticket_credentials set enabled=true,revoked_at=null where secret_sha256='"+hashes[0]+"'",platform);
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
 const dispatch={attempt_id:request(301)};
 value(service(cmd('installation_started',dispatch)));
 assert.throws(()=>value(service(cmd('installation_started',{attempt_id:request(302)}))),/External install unresolved/);
 assert.equal(value(service(cmd('status'))).installation_state,'uncertain_or_pending');
 assert.equal(sql("select count(*) from public.operator_audit where action='support_install_dispatched' and detail->>'request_id'='"+request(300)+"'",platform),'1');
 assert.throws(()=>value(service(cmd('installation_acknowledged',{attempt_id:request(302)}))),/Exact dispatch/);
 value(service(cmd('installation_acknowledged',dispatch)));value(service(cmd('installation_acknowledged',dispatch)));
 assert.equal(value(service(cmd('installation_started',{attempt_id:request(302)}))).dispatch,false);
 assert.equal(value(service(cmd('status'))).installation_state,'installed_unverified');
 sql('update platform_private.support_install_fences set acknowledged_at=null where client_id=101',platform);
 assert.throws(()=>value(service(cmd('installation_reconciled',{confirmed:true,reason:'too short',provider_reference:'case-123'}))),/confirmed provider/);
 value(service(cmd('installation_reconciled',{confirmed:true,reason:'Provider confirmed original request completion',provider_reference:'case-123'})));
 const first=value(service(cmd('material'))),retry=value(service(cmd('material')));assert.ok(first.secret===retry.secret,'same enrollment recovers identical protected material');
 assert.equal(first.secret.length,64);assert.ok(createHash('sha256').update(first.secret).digest('hex')===first.secret_sha256,'lookup digest matches recovered material');
 assert.equal(value(service(cmd('prepare',data))).key_id,prepared.key_id);
 value(service(cmd('revoke')));assert.equal(Object.hasOwn(value(service(cmd('material'))),'secret'),false);
 // A pre-migration worker can still write after its key was revoked. Execute
 // the exact forward backfill statement against that historical state.
 sql("update platform_private.support_ticket_credentials set install_acknowledged_at=null where enrollment_id='"+request(300)+"';delete from platform_private.support_install_fences where client_id=101",platform);
 const backfill=read('supabase/migrations/20261019000019_support_automation_release_fences.sql').match(/INSERT INTO platform_private\.support_install_fences\(client_id,enrollment_id,attempt_id,started_at\)[\s\S]*?ORDER BY b\.client_id,k\.install_started_at;/)[0];sql(backfill,platform);
 const replacement=cmd('prepare',data).replace(request(300),request(303));assert.throws(()=>value(service(replacement)),/External install unresolved/);
 const reconciled=value(service(cmd('installation_reconciled',{confirmed:true,reason:'Provider confirmed all prior writes finished',provider_reference:'case-historical'})));assert.equal(reconciled.revoked,true);
 value(service(replacement));value(service(cmd('revoke').replace(request(300),request(303))));
});
test('native release pins retain in-flight legacy work and never change an existing job fingerprint',()=>{
 const job=request(400),candidate=request(401),checksum='c'.repeat(64);
 sql(`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state) values('${job}',101,'${master}','managed-setup','{}','running');insert into platform_private.provision_stages(request_id,name,state,checksum) values('${job}','project-access','passed','${refs[1]}');`,platform);
 const pin=(id,release,hash)=>service(`select public.platform_managed_release_pin('${id}','${release}','${hash}')`);
 const legacy=value(pin(job,'support-v2',checksum));assert.equal(legacy.release_id,'accepted-v1');assert.equal(value(pin(job,'support-v2','d'.repeat(64))).sha256,legacy.sha256);
 sql(`update platform_private.provision_jobs set state='complete' where request_id='${job}';insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state) values('${candidate}',101,'${master}','managed-setup','{}','running');`,platform);
 assert.equal(value(pin(candidate,'support-v2',checksum)).sha256,checksum);assert.equal(value(pin(candidate,'accepted-v1','e'.repeat(64))).release_id,'support-v2');
 sql(`update platform_private.provision_jobs set state='complete' where request_id='${candidate}'`,platform);
});
test('native optional automation uses live Master, completed base jobs, owner health, stable UUID and safe status projection',()=>{
 const baseJob=request(410),pending=request(411);
 sql(`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state) values('${baseJob}',101,'${master}','onboarding-status','{}','complete');update platform_private.support_ticket_credentials set enabled=false,revoked_at=now() where source_id='${sources[1]}';update public.bridge_sources set enabled=true where client_id=101;update platform_private.shop_credentials set health='{}' where client_id=101;`,platform);
 const cmd=(who,action='context',data={})=>service(`select public.platform_support_automation_command('${who}','${who}',101,'${action}',${literal(data)})`);
 assert.throws(()=>value(cmd(manager)),/Master administrator/);
 const waiting=value(cmd(master));assert.equal(waiting.state,'waiting');assert.equal(waiting.ready,false);
 sql(`update platform_private.shop_credentials set health='{"owner_setup":"owner_active","owner_account":"active","onboarding":"onboarding_complete","infrastructure":"ready"}' where client_id=101`,platform);
 const ready=value(cmd(master));assert.equal(ready.ready,true);assert.equal(ready.request_id,waiting.request_id);
 assert.equal(value(cmd(master,'record',{state:'preparing',reason:'enrollment',release_sha256:'a'.repeat(64)})).state,'preparing');
 sql(`insert into platform_private.provision_jobs(request_id,client_id,actor_id,action,params,state) values('${pending}',101,'${master}','onboarding-status','{}','running')`,platform);
 assert.equal(value(cmd(master)).ready,false);sql(`update platform_private.provision_jobs set state='complete' where request_id='${pending}'`,platform);
 const safe=value(user(manager,'select public.platform_support_automation_status(101)'));assert.equal(safe.request_id,waiting.request_id);assert.ok(!Object.keys(safe).some(k=>/secret|token|session|actor/.test(k)));
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`begin;set local role ${role};select * from platform_private.support_automation;commit`,platform),/permission denied/);
 // Restore only this fixture's pre-existing enabled credential for later intake checks.
 sql(`update platform_private.support_ticket_credentials set revoked_at=null,enabled=true where enrollment_id='${request(101)}'`,platform);
});
test('Shop installation proof requires the current confirmed active owner and completed onboarding; browser roles cannot call it',()=>{
 const db=shops[1],probe=()=>value(service('select public.support_ticket_installation_context()'),db);
 assert.throws(probe,/Confirmed active owner/);
 sql(`insert into app_private.owner_bootstrap(request_id,payload,owner_auth_id) values('${request(420)}','{"owner_email":"owner@example.test","platform_client_id":101,"client_binding":"support-client-101"}','${owner}');update public.shop_config set onboarding_completed_at=now(),owner_email='owner@example.test' where id=1;`,db);
 assert.equal(probe().ready,true);
 for(const mutation of ["update auth.users set email_confirmed_at=null where id='"+owner+"'","update auth.users set banned_until=now()+interval '1 day' where id='"+owner+"'","update public.app_users set status='Inactive' where auth_user_id='"+owner+"'","update public.shop_config set onboarding_completed_at=null where id=1"]){assert.throws(()=>sql('begin;'+mutation+';set local role service_role;select public.support_ticket_installation_context();rollback;',db),/Confirmed active owner/);}
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`begin;set local role ${role};select public.support_ticket_installation_context();commit;`,db),/permission denied/);
});
test('staged anonymous closure removes effective table/column/sequence access; private objects have no browser grants',()=>{
 sql(read('supabase/staged-migrations/close_anonymous_support.sql'),platform);
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`begin;set local role ${role};insert into public.support_tickets(client_name,subject,message) values('Forged','Denied','Denied');commit;`,platform),/permission denied/);
 // Closure must retain the narrow server intake and canonical staff workflow.
 const accepted=value(service(create(10000,1)));assert.equal(value(service(readTickets(1,actor(1),accepted.ticket_id))).length,1);
 const tid=sql("select ticket_id from platform_private.support_ticket_context where public_id='"+accepted.ticket_id+"'",platform);
 assert.equal(value(user(manager,"select public.platform_support_ticket_resolve("+tid+",1,'Closure fixture resolved')")).resolved,true);
 assert.ok(value(user(master,'select public.platform_support_ticket_page(0)')).rows.some(t=>t.id===Number(tid)));
 for(const role of ['anon','authenticated']){
  assert.throws(()=>sql('begin;set local role '+role+';'+create(10001,1)+';commit;',platform),/permission denied/);
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_support_ticket_source','platform_support_ticket_create','platform_support_ticket_read','platform_support_credential_command') and has_function_privilege('"+role+"',p.oid,'EXECUTE')",platform),'0');
 }
 assert.equal(sql("select has_any_column_privilege('anon','public.support_tickets','INSERT') or has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE,SELECT,UPDATE')",platform),'f');
 assert.equal(sql("select count(*) from pg_tables where schemaname='platform_private' and tablename like 'support_ticket_%' and not rowsecurity",platform),'0');
 for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`select count(*) from pg_tables where schemaname='platform_private' and tablename like 'support_ticket_%' and has_table_privilege('${role}',schemaname||'.'||tablename,'SELECT,INSERT,UPDATE,DELETE')`,platform),'0');
});

// Real local Auth issues a configured two-hour JWT; real PostgREST verifies it
// before the actual canonical actor RPC. No provider or gateway mock here.
test('real GoTrue two-hour user JWT remains valid through Auth and live PostgREST; forged/revoked sessions fail',async()=>{
 const nonce=randomBytes(8).toString('hex'),authName='orbito-support-auth-'+nonce,restName='orbito-support-rest-'+nonce;
 const password=randomBytes(32).toString('hex'),jwtSecret=randomBytes(32).toString('hex'),loginPassword=randomBytes(24).toString('hex');
 const label='com.retrasell.support-auth',url='https://'+refs[0]+'.supabase.co';const owned=[];
 const command=args=>run(args);
 const sign=claims=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role:'authenticated',aud:'authenticated',iss:url+'/auth/v1',exp:Math.floor(Date.now()/1000)+7200,...claims})).toString('base64url');return h+'.'+b+'.'+createHmac('sha256',jwtSecret).update(h+'.'+b).digest('base64url');};
 try{
  // Schema-only fixtures need the matching GoTrue migration ledger before
  // starting Auth; replaying old migrations against upgraded tables is invalid.
  sql(run(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--data-only','--table=auth.schema_migrations']),shops[0],'supabase_admin');
  sql("alter role supabase_auth_admin password '"+password+"';alter role authenticator password '"+password+"'",shops[0],'supabase_admin');
  for(const [name,image,port,vars] of [
   [authName,'public.ecr.aws/supabase/gotrue:v2.197.0','9999',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@'+container+':5432/'+shops[0],GOTRUE_SITE_URL:'http://localhost:4180',API_EXTERNAL_URL:url+'/auth/v1',GOTRUE_JWT_ISSUER:url+'/auth/v1',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'7200',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_LOG_LEVEL:'error'}],
   [restName,'postgrest/postgrest:v13.0.8','3000',{PGRST_DB_URI:'postgres://authenticator:'+password+'@'+container+':5432/'+shops[0],PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_JWT_AUD:'authenticated',PGRST_LOG_LEVEL:'crit'}]
  ]){
   command(['image','inspect',image]);command(['run','-d','--name',name,'--label',label+'='+nonce,'--network',container+'-network','-p','127.0.0.1::'+port,...Object.entries(vars).flatMap(([k,v])=>['-e',k+'='+v]),image]);owned.push(name);
  }
  for(const name of owned){if(command(['inspect','-f','{{.State.Running}}',name])!=='true'){
   const logs=spawnSync('docker',['logs',name],{encoding:'utf8',windowsHide:true,timeout:10000});const diagnostic=(logs.stdout+logs.stderr).replaceAll(password,'[fixture]').replaceAll(jwtSecret,'[fixture]').replaceAll(loginPassword,'[fixture]');throw Error('Owned provider startup: '+diagnostic);
  }}
  const origin=(name,port)=>{const match=command(['port',name,port+'/tcp']).match(/^127\.0\.0\.1:(\d+)$/);assert.ok(match,'Local-only provider port');return 'http://127.0.0.1:'+match[1];};
  const auth=origin(authName,'9999'),rest=origin(restName,'3000');
  for(const target of [auth+'/health',rest+'/']){let ready=false;for(let n=0;n<50;n++){try{if((await fetch(target,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Owned provider startup');}
  // Create the provider login through real Auth, rather than pretending the
  // minimal SQL authorization fixture is a complete GoTrue account.
  const email='native-owner@example.test';
  const signup=await fetch(auth+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:loginPassword})});assert.equal(signup.status,200,'Create synthetic provider user through Auth');
  const registered=await signup.json(),nativeOwner=registered.user?.id||registered.id;assert.match(nativeOwner,/^[a-f0-9-]{36}$/);
  sql("update public.app_users set auth_user_id='"+nativeOwner+"',email='"+email+"' where auth_user_id='"+owner+"'",shops[0]);
  const login=await fetch(auth+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:loginPassword})});assert.equal(login.status,200);
  const session=await login.json(),token=session.access_token,claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  assert.equal(session.expires_in,7200);assert.equal(claims.role,'authenticated');assert.ok(claims.exp-Date.now()/1000>7000);assert.equal(claims.iss,url+'/auth/v1');
  let nativeVerified=false;
  const fetcher=async(target,options)=>{assert.ok(target.startsWith(url+'/auth/v1/')||target.startsWith(url+'/rest/v1/'));const response=await fetch(target.replace(url+'/auth/v1',auth).replace(url+'/rest/v1',rest),options);
   if(!nativeVerified&&target.includes('/rest/v1/')&&!response.ok){const diagnostic=await response.clone().json();console.error('Local actor RPC: '+JSON.stringify({code:diagnostic.code,message:diagnostic.message}).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[fixture JWT]'));}return response;};
  assert.equal((await verifyActor(fetcher,url,'local-public',token)).auth_user_id,nativeOwner);nativeVerified=true;
  for(const invalid of [token.slice(0,-8)+'forged00',sign({...claims,exp:1}),sign({...claims,iss:'https://foreign.invalid/auth/v1'}),sign({...claims,aud:'service_role'}),sign({...claims,session_id:employee}),sign({...claims,sub:employee})])await assert.rejects(()=>verifyActor(fetcher,url,'local-public',invalid));
  sql("delete from auth.sessions where id='"+claims.session_id+"'",shops[0]);await assert.rejects(()=>verifyActor(fetcher,url,'local-public',token));
 }finally{for(const name of owned.reverse()){assert.equal(command(['inspect','-f','{{index .Config.Labels "'+label+'"}}',name]),nonce);command(['rm','-f',name]);}}
});
