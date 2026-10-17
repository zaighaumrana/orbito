import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,master,rowId} from './helpers/platform-team-fixture.mjs';
import {teamErrorMessage} from '../src/team-errors.js';
import {teamStatus} from '../src/team.js';

test('clear invitation endpoint denies anonymous/employees/stale identities before service access; never calls Auth mutation',async()=>{
  for(const options of [{invalid:true},{role:'billing_person'},{role:'portfolio_manager'},{user:{id:master,email:'master@example.test'}},{identityError:true}]){
    const f=fixture(options),r=await f.invoke('clear',{id:rowId,acknowledged:true});assert.ok(r.status>=400);
    assert.equal(f.calls.some(c=>c[0]==='client' && c[1]==='fixture-service'),false);
  }
  const f=fixture(),r=await f.invoke('clear',{id:rowId,acknowledged:true});assert.equal(r.status,200);
  assert.equal(f.calls.filter(c=>c[0]==='rpc' && c[1]==='platform_team_clear_failed_invitation').length,1);
  assert.equal(f.calls.some(c=>['invite','auth-update','auth-delete','recover'].includes(c[0])),false);
  assert.equal((await fixture({clearError:true}).invoke('clear',{id:rowId,acknowledged:true})).body.success,undefined);
  assert.equal((await fixture().invoke('clear',{id:rowId})).status,400);
});

test('definite early deletion rejection uses authorized history evidence; absent/unreadable/prior uncertainty never fabricates absence',async()=>{
  for(const state of ['none','completed','auth_delete_dispatched',undefined]){
    const f=fixture({continuityApproved:false,deleteState:state}),r=await f.invoke('delete',{id:rowId});
    assert.equal(r.status,503);assert.equal(r.body.operation_state,state || 'unverified');
    assert.equal(r.body.review_required,!['none','completed'].includes(state));
    assert.equal(f.calls.some(c=>['auth-delete','password-check'].includes(c[0])),false);
    assert.equal(f.calls.some(c=>c[0]==='client'&&c[1]==='fixture-service'),false);
    const text=await teamErrorMessage(r.body,null,'request');
    assert.match(text,state==='none'?/No deletion operation was recorded/:state==='completed'?/earlier deletion.*completed/i:/Review request/);
  }
  const f=fixture({invalid:true,deleteState:'none'}),r=await f.invoke('delete',{id:rowId});
  assert.equal(r.body.operation_state,'unverified');assert.equal(r.body.review_required,true);
});

test('native email rate limit keeps failed creation under review, blocks resend presentation and never claims delivery',async()=>{
  const f=fixture({rows:[],inviteError:{status:429,code:'over_email_send_rate_limit'}});
  const r=await f.invoke('create',{email:'new@example.test',name:'New employee',role:'billing_person'});
  assert.equal(r.status,429);assert.equal(r.body.code,'email_rate_limited');assert.equal(r.body.review_required,true);
  assert.equal([...f.ops.values()][0].stage,'review_required');
  assert.match(await teamErrorMessage(r.body,null,'request'),/wait.*review/i);
  assert.match(teamStatus({status:'Pending'},{action:'create',stage:'review_required'}).message,/Resending is blocked/);
  assert.match(teamStatus({status:'Pending',auth_user_id:master}).message,/expiry.*cannot be confirmed/);
  assert.match(teamStatus({status:'Pending'}).message,/no verified Auth mapping.*Resending is blocked/);
  assert.equal(teamStatus({status:'Active'}).label,'Active');
  assert.equal(teamStatus({status:'Inactive'}).label,'Inactive');
});
