// Verified-session doubles plus REAL PostgreSQL canonical RPC and RLS boundaries.
// Import also runs the explicitly mocked 40 handler/frontend cases. No hosted proof.
import {fixture} from './platform-team.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const container=process.env.ORBITO_BOOTSTRAP_TEST_CONTAINER;
assert.match(container || '',/^orbito-bootstrap-[a-z0-9-]+$/);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
const master='92000000-0000-4000-8000-000000000001',manager='95000000-0000-4000-8000-000000000002',billing='95000000-0000-4000-8000-000000000003',pending='95000000-0000-4000-8000-000000000004';
const template='orbito_team_template_'+process.pid;
function sql(query,db='postgres',user='postgres',variables=[]){
 const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db,...variables,'-f','-'],{input:query,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 if(r.error || r.status!==0)throw Error(r.error?.message || r.stderr.trim());return r.stdout.trim();
}
const asUser=(id,body)=>`begin;select set_config('request.jwt.claim.sub','${id}',true);set local role authenticated;${body};commit;`;
test.before(()=>{
 const dump=spawnSync('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--schema=extensions','--schema=vault'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(dump.status,0,dump.stderr);
 sql('create database '+template+' template template0');sql(dump.stdout,template,'supabase_admin');
 sql('create extension pgcrypto with schema extensions;create extension supabase_vault with schema vault;create publication supabase_realtime;',template);
});
test.after(()=>sql('drop database if exists '+template+' with (force)'));
for(const cutover of [false,true])test('real canonical identity, Manager/Billing RLS and team-handler boundary '+(cutover?'after':'before')+' UUID migration',async()=>{
 const db='orbito_team_'+(cutover?'after':'before')+'_'+process.pid;sql('create database '+db+' template '+template);
 try{
  assert.match(sql('show server_version',db),/^17\./);
  for(const file of files.slice(0,-1)){const s=read('supabase/migrations/'+file);sql(/^begin;/i.test(s.replace(/^\s*--.*$/gm,'').trim())?s:'begin;\n'+s+'\ncommit;',db);}
  sql(read('tests/platform-master-upgrade-before.sql'),db);
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${manager}','manager@example.test',now()),('${billing}','billing@example.test',now()),('${pending}','pending@example.test',now());
   insert into public.platform_users(auth_user_id,name,email,role,status) values('${manager}','Manager','manager@example.test','portfolio_manager','Active'),('${billing}','Billing','billing@example.test','billing_person','Active'),('${pending}','Pending','pending@example.test','billing_person','Pending');`,db);
  if(cutover){sql(read('supabase/bootstrap/approve-staging-master.sql'),db,'postgres',['-v','master_uuid='+master,'-v','reason=Reviewed disposable team cutover']);sql('begin;'+read('supabase/migrations/'+files.at(-1))+'commit;',db);}
  for(const [id,role] of [[master,'master_admin'],[manager,'portfolio_manager'],[billing,'billing_person']]){
   const identity=()=>{try{return {data:JSON.parse(sql(asUser(id,'select public.platform_operator_identity()::text'),db).split('\n').at(-1))};}catch{return {error:{}};}};
   assert.equal(identity().data.role,role);
   assert.equal(sql(asUser(id,'select count(*) from public.platform_users'),db).split('\n').at(-1),'3');
   for(const action of ['create','update','delete']){
    const f=fixture({user:{id,email:id===master?'existing-master@example.test':'operator@example.test'},identityRpc:identity});
    const response=await f.invoke(action,action==='create'?{name:'New Team',email:'new@example.test',role:'billing_person'}:action==='update'?{id:'94000000-0000-4000-8000-000000000003',name:'Edited'}:{id:'94000000-0000-4000-8000-000000000003'});
    assert.equal(response.status,id===master?200:403);
    if(id!==master)assert.equal(f.calls.filter(c=>c[0]==='client').length,1);
   }
  }
  // Real RLS prevents ordinary team assignment: UPDATE completes with zero rows.
  // Finance roles pass authorization to the RPC's input validator; managers do not.
  for(const id of [master,billing])assert.throws(()=>sql(asUser(id,'select public.platform_generate_invoice(123,null)'),db),/Request ID required/);
  assert.throws(()=>sql(asUser(manager,'select public.platform_generate_invoice(123,null)'),db),/Operator not authorized|Role not authorized/);
  for(const id of [master,manager,billing])sql(asUser(id,'select public.platform_client_operations(123)'),db);
  for(const id of [manager,billing]){
   sql(asUser(id,"update public.platform_users set role='portfolio_manager' where auth_user_id='"+billing+"'"),db);
   assert.equal(sql("select role from public.platform_users where auth_user_id='"+billing+"'",db),'billing_person');
   assert.throws(()=>sql(asUser(id,"insert into public.platform_users(name,email,role) values('Bad','bad@example.test','billing_person')"),db),/permission denied/);
   assert.throws(()=>sql(asUser(id,"update public.platform_users set auth_user_id='"+master+"' where auth_user_id='"+billing+"'"),db),/permission denied/);
  }
  assert.throws(()=>sql(asUser('92000000-0000-4000-8000-000000000002','select public.platform_operator_identity()'),db),/Operator not authorized/);
  assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
  sql(asUser(pending,'select public.platform_accept_invite()'),db);
  assert.equal(sql(asUser(pending,"select public.platform_operator_identity()->>'role'"),db).split('\n').at(-1),'billing_person');
  sql("update public.platform_users set status='Inactive' where auth_user_id='"+pending+"'",db);
  assert.throws(()=>sql(asUser(pending,'select public.platform_operator_identity()'),db),/Operator not authorized/);
  assert.throws(()=>sql('set role anon;select public.platform_operator_identity()',db),/permission denied/);
  if(cutover){sql("update auth.users set banned_until=now()+interval '1 day' where id='"+master+"'",db);for(const id of [master,manager,billing])assert.throws(()=>sql(asUser(id,'select public.platform_operator_identity()'),db),/Operator not authorized/);}
 }finally{sql('drop database '+db+' with (force)');}
});
