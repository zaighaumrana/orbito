// Production handler and decoder, durable request doubles; no hosted operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,master,target,rowId,requestId} from './helpers/platform-team-fixture.mjs';
import {teamErrorMessage} from '../src/team-errors.js';
const deletes=f=>f.calls.filter(c=>c[0]==='auth-delete').length;
async function rejectsWithoutErasingHistory(f,result,rejected=true){
 assert.ok(result.status>=400);assert.equal(result.body.review_required,true);
 assert.equal(result.body.operation_state,'unverified');assert.equal(result.body.current_attempt_rejected,rejected);
 const message=await teamErrorMessage(result.body,null,requestId);
 assert.match(message,/Review request/);assert.match(message,/do not retry.*blindly/);
 assert.doesNotMatch(message,/No (employee )?deletion started|already completed|successfully deleted/i);
 assert.doesNotMatch(result.body.error,/No (employee )?deletion started/i);
}
test('F1 first-attempt policy/password rejection identifies this invocation only, with no privileged work',async()=>{
 for(const options of [{continuityApproved:false},{passwordError:true,passwordCode:'invalid_credentials'}]){
  const f=fixture(options),result=await f.invoke('delete',{id:rowId});
  await rejectsWithoutErasingHistory(f,result);assert.equal(f.ops.size,0);assert.equal(deletes(f),0);
  assert.ok(!f.calls.some(c=>c[0]==='client'&&c[1]==='fixture-service'));
  assert.equal(f.rows[0].status,'Active');assert.deepEqual(f.audit,[]);
 }
});
for(const [name,change,rejected] of [
 ['Auth lookup outage',(_f,o)=>o.lookupError=true,true],
 ['disabled continuity',(_f,o)=>o.continuityApproved=false,true],
 ['expired Auth session',(_f,o)=>o.invalid=true,true],
 ['canonical authorization outage',(_f,o)=>o.identityError=true,true],
 ['missing canonical session',(_f,o)=>o.identity={auth_user_id:master,role:'master_admin',session_id:null},true],
 ['incorrect password on reconciliation',(_f,o)=>{o.passwordError=true;o.passwordCode='invalid_credentials';},true],
 ['dependency/command outage',(_f,o)=>o.commandError='begin_delete',false],
 ['target dataset outage',(_f,o)=>o.rowError=true,false],
 ['missing live target',f=>f.rows.splice(0,1),false],
])test('F1 same-request uncertainty survives '+name,async()=>{
 const options={authError:true},f=fixture(options);
 const first=await f.invoke('delete',{id:rowId});assert.equal(first.status,503);
 assert.equal(first.body.review_required,true);assert.equal(deletes(f),1);assert.equal(f.rows[0].status,'Inactive');
 const op=f.ops.get(requestId),stage=op.stage,auditSize=f.audit.length;
 change(f,options);const retry=await f.invoke('delete',{id:rowId,reconcile:true});
 await rejectsWithoutErasingHistory(f,retry,rejected);
 assert.equal(deletes(f),1);assert.equal(f.archives.length,0);assert.equal(op.stage,stage);assert.equal(f.audit.length,auditSize);
});
test('F1 completed deletion repeats only verified reconciliation, never the Auth delete or archive',async()=>{
 const f=fixture();assert.equal((await f.invoke('delete',{id:rowId})).status,200);
 const auditSize=f.audit.length;
 const retry=await f.invoke('delete',{id:rowId,reconcile:true});assert.equal(retry.status,200);
 assert.equal(retry.body.success,true);assert.equal(retry.body.operation_id,requestId);
 assert.equal(deletes(f),1);assert.equal(f.archives.length,1);assert.equal(f.audit.length,auditSize);
});
test('F1 different request or mismatched target cannot replace an unresolved deletion',async()=>{
 const f=fixture({authError:true});await f.invoke('delete',{id:rowId});
 const other='94000000-0000-4000-8000-000000000005';
 f.rows.push({id:other,auth_user_id:other,email:'other@example.test',name:'Other',role:'billing_person',status:'Active'});
 f.authUsers.push({id:other,email:'other@example.test'});
 for(const body of [{id:rowId,request_id:other,reconcile:true},{id:other,request_id:requestId,reconcile:true},{id:rowId,request_id:'forged',reconcile:true}]){
  const result=await f.invoke('delete',body);assert.ok(result.status>=400);assert.equal(result.body.review_required,true);
  assert.match(await teamErrorMessage(result.body,null,body.request_id),/Review request/);
 }
 assert.equal(deletes(f),1);assert.equal(f.ops.size,1);assert.equal(f.archives.length,0);assert.equal(f.rows[1].status,'Active');
});
test('F1 uncertain provider receipt reconciles verified absence without replaying deletion',async()=>{
 const f=fixture({authError:true});await f.invoke('delete',{id:rowId});
 // Provider completed despite lost receipt: only the synthetic fixture changes.
 f.authUsers.splice(f.authUsers.findIndex(u=>u.id===target),1);
 assert.equal((await f.invoke('delete',{id:rowId,reconcile:true})).status,200);
 assert.equal(deletes(f),1);assert.equal(f.archives.length,1);
});
test('F1 decoder preserves uncertainty for new, legacy, malformed and contradictory responses',async()=>{
 for(const body of [
  {code:'deletion_disabled',review_required:true,current_attempt_rejected:true,operation_state:'unverified'},
  {code:'identity_unavailable',review_required:false},
  {code:'deletion_disabled',review_required:true},
  {code:'password_invalid',review_required:true,current_attempt_rejected:true,operation_state:'absent'},
  {code:'unknown',review_required:false},null,
 ]){
  const message=await teamErrorMessage(null,{context:{clone:()=>({json:async()=>body})}},requestId);
  assert.match(message,/Review request/);assert.doesNotMatch(message,/No (employee )?deletion started/);
 }
 const message=await teamErrorMessage(null,{context:{clone(){throw Error('Synthetic transport failure');}}},requestId);
 assert.match(message,/could not be confirmed.*Review request/);
});
