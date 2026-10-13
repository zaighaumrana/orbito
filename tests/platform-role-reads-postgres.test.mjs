// Populated PG17/Auth/Vault fixtures, real SQL RLS and real PostgREST JWT/API.
// Run only via the owned local runner; no hosted target or existing container.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container || '',/^orbito-bootstrap-team-[a-f0-9]{16}$/);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration='20261012231226_platform_role_read_isolation.sql';
const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql') && f<migration).sort();
const template='orbito_read_template_'+process.pid;
const id=n=>'96000000-0000-4000-8000-'+String(n).padStart(12,'0');
const master=id(1),manager=id(2),billing=id(3),pending=id(4),inactive=id(5),archived=id(6),revoked=id(7),expired=id(8),stale=id(9),deleted=id(10);
const sid=who=>who.slice(0,24)+'1'+who.slice(25);
function command(file,args,options={}){const r=spawnSync(file,args,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024,...options});if(r.error || r.status!==0)throw Error(r.error?.message || r.stderr || r.stdout);return r.stdout.trim();}
const sql=(body,db='postgres',user='postgres')=>command('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db,'-f','-'],{input:body});
const claims=(who,session=sid(who),extra={})=>({sub:who,role:'authenticated',session_id:session,...extra});
const asUser=(who,body,session=sid(who),extra={})=>`begin;select set_config('request.jwt.claims','${JSON.stringify(claims(who,session,extra))}',true);select set_config('request.jwt.claim.sub','${who}',true);set local role authenticated;${body};commit;`;
const value=(db,who,body,...args)=>sql(asUser(who,body,...args),db).split('\n').at(-1);
const json=(db,who,body,...args)=>JSON.parse(value(db,who,body,...args));
const page=(db,who,dataset)=>json(db,who,`select public.platform_read_page('${dataset}')`);
const deny=(db,who,body,...args)=>assert.throws(()=>value(db,who,body,...args),/not authorized|permission denied|role|unavailable|Unsupported client fields/i);
const raw=['clients','platform_users','platform_config','usage_logs','billing_cycles','payments','client_credit','pricing_rate_log','support_tickets','bridge_sources','bridge_events','bridge_failures','billing_projections','paper_requests','paper_supplies','operator_audit','config_jobs','platform_team_archive'];
const counts=(db,who)=>json(db,who,'select jsonb_build_object('+raw.map(table=>`'${table}',(select count(*) from public.${table})`).join(',')+')');
test.before(()=>{
 assert.match(sql('show server_version'),/^17\./);
 const dump=command('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault']);
 sql('create database '+template+' template template0');sql(dump,template,'supabase_admin');
 sql(`create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;
 create schema storage;create table storage.objects(id uuid primary key,owner uuid);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;create policy fixture_existing on storage.objects for select to authenticated using(true);
 create schema realtime;create table realtime.messages(id uuid primary key);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;create policy fixture_existing on realtime.messages for select to authenticated using(true);`,template);
 for(const f of files){const body=read('supabase/migrations/'+f);sql(/^begin;/i.test(body.replace(/^\s*--.*$/gm,'').trim())?body:'begin;'+body+'commit;',template);}
 sql(`begin;select set_config('platform.team_transition','trusted',true);
 insert into auth.users(id,email,email_confirmed_at,encrypted_password) values ${[master,manager,billing,pending,inactive,archived,revoked,expired,stale,deleted].map((who,n)=>`('${who}','user${n+1}@example.test',now(),'synthetic')`).join(',')};
 select platform_private.initialize_config('Master fixture','Reviewed synthetic fixture');select platform_private.bind_master('${master}',null,'Reviewed synthetic fixture');
 insert into public.platform_users(id,auth_user_id,name,email,role,status) values ${[manager,billing,pending,inactive,revoked,expired,stale,deleted].map(who=>`('${who}','${who}','Employee ${who.slice(-2)}','user${Number(who.slice(-2))}@example.test','${who===billing?'billing_person':'portfolio_manager'}','${who===pending?'Pending':who===inactive?'Inactive':'Active'}')`).join(',')};
 insert into public.platform_team_archive(id,auth_user_id,name,email,role,joined_at,deleted_at,deleted_by,operation_id,final_status) values('${archived}','${archived}','PRIVATE_ARCHIVE','user6@example.test','portfolio_manager',now(),now(),'${master}','${id(101)}','Auth absence verified');
 insert into auth.sessions(id,user_id,created_at,updated_at) select ('96000000-0000-4000-8000-1'||right(id::text,11))::uuid,id,now(),now() from auth.users;
 insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) select gen_random_uuid(),id,'password',now(),now() from auth.sessions;
 delete from auth.sessions where user_id='${revoked}';update auth.sessions set not_after=now()-interval '1 minute' where user_id='${expired}';
 update public.platform_users set session_not_before=now()+interval '1 second' where auth_user_id='${stale}';update auth.users set deleted_at=now() where id='${deleted}';
 insert into public.clients(id,name,supabase_url,supabase_anon,shop_url,currency,billing_policy,owner_name,owner_email) values(1,'Operational Client','https://abcdefghijklmnopqrst.supabase.co','PRIVATE_ANON','https://shop.example.test','PKR','usage-v1','PRIVATE_OWNER','private-owner@example.test'),(2,'Retained Billing Client','https://bcdefghijklmnopqrstu.supabase.co','PRIVATE_ARCHIVED_ANON','','PKR','usage-v1','PRIVATE_ARCHIVED_OWNER','retired@example.test');
 update public.clients set lifecycle_state='Archived',status='Archived',archived_at=now() where id=2;
 select setval('public.clients_id_seq',2,true);
 insert into public.billing_cycles(client_id,period_start,period_end,total_due,remaining_balance,notes,policy_snapshot,request_id) values(1,'2026-10-01','2026-10-12',123,113,'PRIVATE_INVOICE_NOTE','{"private":"PRIVATE_POLICY"}','${id(102)}'),(2,'2026-10-01','2026-10-12',20,20,'PRIVATE_ARCHIVED_INVOICE_NOTE','{"private":"PRIVATE_POLICY"}','${id(103)}');
 insert into public.payments(invoice_id,client_id,amount,payment_method,payment_date,notes,recorded_by,request_id) values(1,1,10,'Bank','2026-10-12','Financial note','PRIVATE_PAYMENT_ACTOR','${id(104)}');
 insert into public.client_credit(client_id,source_invoice_id,amount_outstanding,is_cleared) values(2,2,0,true);
 insert into public.usage_logs(client_id,module_type,token_count,rate_at_log,metadata) values(1,'BILL',2,5,'{"private":"PRIVATE_USAGE"}'),(2,'BILL',1,3,'{"private":"PRIVATE_ARCHIVED_USAGE"}');
 insert into public.pricing_rate_log(client_id,module_type,old_rate,new_rate,notes) values(1,'BILL',1,2,'PRIVATE_RATE_NOTE');
 insert into public.support_tickets(client_id,client_name,subject,message) values(1,'Operational Client','Required support subject','SUPPORT_CONTENT_SENTINEL');
 insert into public.bridge_sources(source_id,client_id,client_binding,enabled,last_error) values('${id(105)}',1,'PRIVATE_BINDING',true,'PRIVATE_BRIDGE_ERROR');
 insert into platform_private.source_credentials values('${id(105)}',repeat('a',64));
 insert into public.bridge_events(event_id,source_id,source_sequence,client_id,kind,operation,operation_id,envelope) values('${id(106)}','${id(105)}',1,1,'usage','append','${id(107)}','{"private":"PRIVATE_ENVELOPE"}');
 insert into public.bridge_failures(source_id,reason) values('${id(105)}','PRIVATE_FAILURE');
 insert into public.billing_projections(client_id,sync_version,payload) values(1,1,'{"outstanding_total":113,"private":"PRIVATE_PROJECTION"}');
 insert into public.paper_requests(request_id,client_id,source_id,requested_at) values('${id(108)}',1,'${id(105)}',now());
 insert into public.paper_supplies(delivery_id,client_id,reference,roll_count,usable_length_mm,paper_width_mm,delivered_at,recorded_by) values('${id(109)}',1,'Required delivery',1,1000,80,now(),'${master}');
 insert into public.operator_audit(client_id,actor_id,action,detail) values(1,'${master}','sentinel','{"private":"PRIVATE_AUDIT"}');
 insert into public.config_jobs(request_id,client_id,actor_id,changes,state,result) values('${id(110)}',1,'${master}','{"ems_enabled":true,"private":"PRIVATE_CONFIG"}','uncertain','{"private":"PRIVATE_RESULT"}');
 insert into storage.objects values('${id(111)}','${master}');insert into realtime.messages values('${id(112)}');
 alter publication supabase_realtime add table public.platform_team_archive;commit;`,template);
});
test.after(()=>sql('drop database if exists '+template+' with (force)'));
async function fixture(label,work){const db='orbito_read_'+label+'_'+process.pid;sql('create database '+db+' template '+template);try{return await work(db);}finally{sql('drop database '+db+' with (force)');}}
const apply=db=>sql('begin;'+read('supabase/migrations/'+migration)+'commit;',db);

test('populated source leak reproduced before forward migration; Master/full, Manager/summaries and Billing/ledgers isolated afterward',()=>fixture('matrix',db=>{
 assert.equal(value(db,billing,"select message from public.support_tickets"),'SUPPORT_CONTENT_SENTINEL');
 assert.equal(value(db,manager,"select notes from public.billing_cycles where client_id=1"),'PRIVATE_INVOICE_NOTE');
 const before=sql("select jsonb_build_object('clients',(select jsonb_agg(to_jsonb(c) order by id) from public.clients c),'invoices',(select jsonb_agg(to_jsonb(i) order by id) from public.billing_cycles i),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.payments p),'users',(select jsonb_agg(to_jsonb(u) order by id) from public.platform_users u),'audit',(select count(*) from public.operator_audit))",db);
 apply(db);
 assert.equal(sql("select jsonb_build_object('clients',(select jsonb_agg(to_jsonb(c) order by id) from public.clients c),'invoices',(select jsonb_agg(to_jsonb(i) order by id) from public.billing_cycles i),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.payments p),'users',(select jsonb_agg(to_jsonb(u) order by id) from public.platform_users u),'audit',(select count(*) from public.operator_audit))",db),before,'no retained data rewritten');
 sql('create policy fixture_permissive on public.clients for select to public using(true);grant select on public.clients to public;',db);
 assert.throws(()=>sql('set role anon;select owner_name from public.clients',db),/permission denied/,'PUBLIC grant/permissive policy cannot open a raw read path');
 for(const who of [manager,billing])for(const [table,count] of Object.entries(counts(db,who)))assert.equal(count,0,who+' raw '+table);
 assert.equal(value(db,master,'select count(*) from public.clients'),'2');assert.equal(value(db,master,"select notes from public.billing_cycles where client_id=1"),'PRIVATE_INVOICE_NOTE');
 for(const who of [manager,billing])assert.equal(value(db,who,'select count(*) from public.clients c join public.payments p on p.client_id=c.id'),'0');
 const mc=page(db,manager,'clients').rows;assert.equal(mc.length,1);assert.equal(mc[0].shop_url,'https://shop.example.test');assert.equal(mc[0].currency,'PKR');assert.ok(!('owner_email' in mc[0]) && !('supabase_url' in mc[0]) && !('supabase_anon' in mc[0]));
 const mi=page(db,manager,'invoices').rows;assert.deepEqual(Object.keys(mi[0]).sort(),['id','client_id','period_start','period_end','created_at','total_due','status','payment_status'].sort());assert.equal(mi[0].total_due,123);assert.equal(mi.length,1);
 assert.equal(page(db,manager,'support').rows[0].message,'SUPPORT_CONTENT_SENTINEL');deny(db,billing,"select public.platform_read_page('support')");deny(db,manager,"select public.platform_read_page('payments')");
 const bc=page(db,billing,'clients').rows;assert.equal(bc.length,2);assert.ok(bc.every(c=>!('owner_email' in c) && !('shop_url' in c) && !('industry' in c) && !('supabase_url' in c) && !('infrastructure_state' in c)));
 assert.equal(page(db,billing,'invoices').rows.length,2,'archived client financial records are not silently dropped');assert.equal(page(db,billing,'payments').rows[0].amount,10);assert.equal(page(db,billing,'usage').rows[0].token_count,1);assert.equal(page(db,billing,'credits').rows.length,1);assert.equal(page(db,billing,'rateLog').rows[0].new_rate,2);
 for(const who of [manager,billing]){const account=page(db,who,'account').rows;assert.equal(account.length,1);assert.equal(account[0].auth_user_id,who);assert.equal(json(db,who,'select public.platform_dashboard_summary()').open_tickets,1);}
 assert.equal(json(db,manager,'select public.platform_usage_summary()').length,1);assert.equal(json(db,billing,'select public.platform_usage_summary()').length,2);
 const operations=json(db,manager,'select public.platform_client_operations(1)');assert.equal(operations.projection.payload.outstanding_total,113);assert.equal(operations.supplies[0].reference,'Required delivery');assert.equal(operations.requests[0].status,'requested');assert.doesNotMatch(JSON.stringify(operations),/PRIVATE_|recorded_by|source_id|config_jobs|failures/);
 deny(db,billing,'select public.platform_client_operations(1)');deny(db,manager,'select public.platform_client_operations(2)');deny(db,manager,'select public.platform_provision_status(1)');deny(db,billing,'select public.platform_overhaul_status(1)');
 assert.deepEqual(Object.keys(json(db,manager,'select public.platform_overhaul_status(1)')),['config_jobs']);assert.doesNotMatch(JSON.stringify(json(db,manager,'select public.platform_overhaul_status(1)')),/PRIVATE_|actor_id|changes/);
 assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','platform_private') and c.relkind in ('v','m')",db),'0','no privileged view/materialized-view read path');
 assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='platform_private' and p.proname not in ('operator_role','require_role') and has_function_privilege('authenticated',p.oid,'EXECUTE')",db),'0');
 for(const who of [manager,billing]){deny(db,who,'select platform_private.client_operations_full(1)');deny(db,who,'select platform_private.provision_status(1)');deny(db,who,'select platform_private.usage_summary()');deny(db,who,'select * from platform_private.master_identity');deny(db,who,'select * from vault.decrypted_secrets');assert.equal(value(db,who,'select count(*) from storage.objects'),'0');assert.equal(value(db,who,'select count(*) from realtime.messages'),'0');}
 assert.equal(value(db,master,'select count(*) from storage.objects'),'1');assert.equal(sql("select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'",db),'0');
 for(const dataset of ['clients','invoices','payments','usage','credits','rateLog'])assert.doesNotMatch(JSON.stringify(page(db,billing,dataset)),/PRIVATE_/);
}));

test('invalid lifecycle/session identities fail at SQL boundary; forged metadata cannot widen live roles; live role edit clears prior rights without login',()=>fixture('sessions',db=>{
 apply(db);
 for(const who of [pending,inactive,archived,revoked,expired,stale,deleted]){
  assert.equal(json(db,who,'select public.platform_session_status()').authorized,false);deny(db,who,"select public.platform_read_page('clients')");deny(db,who,'select public.platform_dashboard_summary()');
  for(const [table,count] of Object.entries(counts(db,who)))assert.equal(count,0,who+' raw '+table);
 }
 deny(db,manager,"select public.platform_read_page('payments')",sid(manager),{user_metadata:{role:'master_admin'},app_metadata:{role:'master_admin'}});
 deny(db,manager,"select public.platform_read_page('clients')",sid(billing));
 assert.throws(()=>sql('set role anon;select public.platform_read_page(\'clients\')',db),/permission denied/);
 assert.equal(sql("begin;select set_config('request.jwt.claims','{}',true);set local role authenticated;select count(*) from public.clients;commit",db).split('\n').at(-1),'0');
 const cutoff=sql(`select session_not_before from public.platform_users where auth_user_id='${manager}'`,db);
 const edit=role=>sql(`begin;set local role service_role;select public.platform_team_command('${master}','${id(role==='billing_person'?120:121)}','begin_edit','${manager}','{"role":"${role}"}','${sid(master)}');select public.platform_team_command('${master}','${id(role==='billing_person'?120:121)}','finish_edit','${manager}','{}','${sid(master)}');commit`,db);
 edit('billing_person');assert.equal(json(db,manager,'select public.platform_session_status()').role,'billing_person');deny(db,manager,"select public.platform_read_page('support')");assert.equal(page(db,manager,'payments').rows.length,1);assert.equal(sql(`select session_not_before from public.platform_users where auth_user_id='${manager}'`,db),cutoff);
 edit('portfolio_manager');deny(db,manager,"select public.platform_read_page('payments')");assert.equal(page(db,manager,'support').rows.length,1);
 sql(`begin;select set_config('platform.team_transition','trusted',true);update public.platform_users set role='billing_person' where auth_user_id in ('${stale}','${revoked}');commit`,db);
 for(const who of [stale,revoked])deny(db,who,"select public.platform_read_page('payments')");
}));

test('legitimate client/support/financial mutations retain live boundaries and safe return fields; full migration rollback restores prior policies/grants/publication',()=>fixture('writes',db=>{
 const priorPublication=sql("select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'",db);
 assert.throws(()=>sql('begin;alter publication supabase_realtime add tables in schema platform_private;set local role postgres;'+read('supabase/migrations/'+migration)+'commit;',db,'supabase_admin'),/Realtime publication requires reviewed explicit table membership/);
 assert.throws(()=>sql('begin;drop table realtime.messages;'+read('supabase/migrations/'+migration)+'commit;',db),/Managed Storage\/Realtime prerequisites missing/);
 assert.equal(sql("select to_regclass('realtime.messages') is not null and to_regprocedure('public.platform_read_page(text,integer)') is null",db),'t');
 assert.throws(()=>sql('begin;'+read('supabase/migrations/'+migration)+'select 1/0;commit;',db),/division by zero/);
 assert.equal(sql("select to_regprocedure('public.platform_read_page(text,integer)') is null",db),'t');assert.equal(value(db,billing,'select count(*) from public.support_tickets'),'1');assert.equal(sql("select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'",db),priorPublication);
 apply(db);
 assert.equal(json(db,manager,"select public.platform_save_client(1,'{\"name\":\"Updated operational name\"}')").name,'Updated operational name');deny(db,billing,"select public.platform_save_client(1,'{\"name\":\"Denied\"}')");deny(db,manager,"select public.platform_save_client(1,'{\"supabase_anon\":\"Denied\"}')");deny(db,manager,"select public.platform_save_client(2,'{\"name\":\"Denied\"}')");
 const saved=json(db,manager,"select public.platform_save_client(null,'{\"owner_name\":\"Required new owner\",\"owner_email\":\"new-owner@example.test\",\"name\":\"Created operational client\",\"currency\":\"PKR\",\"currency_symbol\":\"PKR\",\"supabase_url\":\"https://cdefghijklmnopqrstuv.supabase.co\",\"shop_url\":\"https://new-shop.example.test\"}')");assert.ok(saved.id);assert.ok(!('owner_email' in saved) && !('supabase_url' in saved));
 value(db,manager,'select public.platform_resolve_ticket(1)');assert.equal(page(db,manager,'support').rows[0].status,'Resolved');deny(db,billing,'select public.platform_resolve_ticket(1)');
 value(db,billing,'select public.platform_set_rates(1,6,2,false)');assert.equal(page(db,billing,'clients').rows.find(c=>c.id===1).event_rate,6);deny(db,manager,'select public.platform_set_rates(1,6,2,false)');
 const invoice=json(db,billing,`select to_jsonb(public.platform_generate_invoice(1,'${id(130)}'))`);assert.equal(invoice.total_due,10);assert.equal(invoice.policy_snapshot,null);assert.equal(invoice.request_id,null);assert.equal(invoice.notes,null);
 const pay=json(db,billing,`select to_jsonb(public.platform_record_payment(${invoice.id},10,'Bank','2026-10-13','Required financial note','${id(131)}'))`);assert.equal(pay.amount,10);assert.equal(pay.recorded_by,null);assert.equal(pay.request_id,null);
 deny(db,manager,`select public.platform_generate_invoice(1,'${id(132)}')`);deny(db,billing,"select public.platform_client_lifecycle(1,'archive','Unapproved employee operation')");deny(db,manager,'select public.platform_team_history()');
 deny(db,manager,`select public.platform_support_issue(1,'${master}',repeat('b',64),'synthetic','${sid(master)}')`);
}));

test('real PostgREST signed JWT requests enforce table, RPC/private-schema and expired-token boundaries',()=>fixture('http',async db=>{
 const nonce=randomBytes(8).toString('hex'),name='orbito-read-http-'+nonce,jwtSecret=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');let owned=false;
 const label='com.retrasell.read-http='+nonce;
 const token=(who,extra={})=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({...claims(who),exp:Math.floor(Date.now()/1000)+300,...extra})).toString('base64url');return header+'.'+body+'.'+createHmac('sha256',jwtSecret).update(header+'.'+body).digest('base64url');};
 try{
  apply(db);command('docker',['image','inspect','postgrest/postgrest:v13.0.8']);sql(`alter role authenticator password '${password}'`,db,'supabase_admin');
  command('docker',['run','--rm','-d','--name',name,'--label',label,'--network',container+'-network','-p','127.0.0.1::3000','-e',`PGRST_DB_URI=postgres://authenticator:${password}@${container}:5432/${db}`,'-e','PGRST_DB_SCHEMAS=public,platform_private','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+jwtSecret,'-e','PGRST_LOG_LEVEL=crit','postgrest/postgrest:v13.0.8']);owned=true;
  const port=command('docker',['port',name,'3000/tcp']).match(/^127\.0\.0\.1:(\d{4,5})$/)?.[1];assert.ok(port);const origin='http://127.0.0.1:'+port;
  let ready=false;for(let n=0;n<30;n++){try{if((await fetch(origin,{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'Owned PostgREST startup');
  const request=async(path,who,body,headers={})=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(who?{Authorization:'Bearer '+token(who)}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};};
  for(const who of [manager,billing]){
   for(const table of raw){const result=await request('/'+table+'?select='+ (table==='platform_config'?'id,admin_username':'*'),who);assert.equal(result.status,200,table);assert.deepEqual(result.body,[]);}
   const projection=await request('/rpc/platform_read_page',who,{p_dataset:'clients'});assert.equal(projection.status,200);assert.equal(projection.body.role,who===manager?'portfolio_manager':'billing_person');assert.doesNotMatch(JSON.stringify(projection.body),/PRIVATE_/);
   assert.equal((await request('/rpc/client_operations_full',who,{p_client:1},{'Content-Profile':'platform_private'})).status,403);
   assert.equal((await request('/master_identity',who,null,{'Accept-Profile':'platform_private'})).status,403);
  }
  assert.equal((await request('/rpc/platform_read_page',billing,{p_dataset:'support'})).status,403);assert.equal((await request('/rpc/platform_read_page',manager,{p_dataset:'payments'})).status,403);
  assert.equal((await request('/rpc/platform_client_operations',billing,{p_client:1})).status,403);
  for(const who of [pending,inactive,archived,revoked,expired,stale,deleted])assert.equal((await request('/rpc/platform_read_page',who,{p_dataset:'clients'})).status,403);
  assert.equal((await request('/rpc/platform_read_page',null,{p_dataset:'clients'})).status,401);
  const expiredJwt=await request('/rpc/platform_read_page',manager,{p_dataset:'clients'},{Authorization:'Bearer '+token(manager,{exp:1})});assert.equal(expiredJwt.status,401);
  const forged=await request('/rpc/platform_read_page',manager,{p_dataset:'payments'},{Authorization:'Bearer '+token(manager,{app_metadata:{role:'master_admin'}})});assert.equal(forged.status,403);
  assert.equal((await request('/rpc/platform_read_page',manager,{p_dataset:'clients'},{Authorization:'Bearer invalid-signature'})).status,401);
  assert.equal((await request('/rpc/platform_provision_begin',billing,{p_client:1,p_request:id(150),p_action:'verify',p_params:{}})).status,403);
  assert.equal((await request('/rpc/platform_generate_invoice',manager,{p_client:1,p_request:id(151)})).status,403);
  const generated=await request('/rpc/platform_generate_invoice',billing,{p_client:1,p_request:id(152)});assert.equal(generated.status,200);const invoice=Array.isArray(generated.body)?generated.body[0]:generated.body;assert.equal(invoice.total_due,10);assert.equal(invoice.policy_snapshot,null);assert.equal(invoice.request_id,null);
  const paid=await request('/rpc/platform_record_payment',billing,{p_invoice:invoice.id,p_amount:10,p_method:'Bank',p_date:'2026-10-13',p_notes:'Approved fixture note',p_request:id(153)});assert.equal(paid.status,200);const payment=Array.isArray(paid.body)?paid.body[0]:paid.body;assert.equal(payment.amount,10);assert.equal(payment.recorded_by,null);assert.equal(payment.request_id,null);
  const masterResult=await request('/clients?select=owner_name',master);assert.equal(masterResult.status,200);assert.ok(masterResult.body.some(c=>c.owner_name==='PRIVATE_OWNER'));
 }finally{if(owned){assert.equal(command('docker',['inspect','-f','{{index .Config.Labels "com.retrasell.read-http"}}',name]),nonce);command('docker',['rm','-f',name]);}}
}));
