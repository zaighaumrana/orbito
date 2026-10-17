// Actual Edge handler with explicit synthetic Auth/RPC/provider transports.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const changes={repair_module_enabled:true,inventory_module_enabled:false,technician_module_enabled:true,live_tracking_enabled:true,ems_enabled:false,ems_track_breaks:false};
function fixture({current=true,remote='success',recovery=false,recoveryAction='retry',denied=false,complete=false}={}){
 let handler;const writes=[],calls=[];const request='99000000-0000-4000-8000-000000000008';
 const caller={auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},rpc:async(name,args)=>{
  calls.push([name,args]);if(denied)return {error:{message:'Denied'}};
  if(name==='platform_begin_config')return {data:{request_id:request,changes,dispatch:!complete,state:complete?'applied':undefined}};
  if(name==='platform_config_recovery')return {data:{request_id:request,recovery_id:request,changes,complete,state:complete?'applied':undefined}};
  return {data:{}};
 }};
 const admin={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='platform_config_finish_result'?{state:current?'applied':'uncertain',intent_current:current}:null};}};
 const context=vm.createContext({URL,Request,Response,AbortSignal,createClient:(_url,key)=>key==='synthetic-service'?admin:caller,
  bridgeCallCredential:async()=>({project_ref:'abcdefghijklmnopqrst',bridge_call_secret:'synthetic-local-call'}),
  fetch:async(_url,options)=>{const body=JSON.parse(options.body);writes.push(body);if(remote==='timeout')throw Error('Possible remote commit');if(remote==='reject' || (remote==='reject-write' && body.operation==='config-write'))return new Response('{}',{status:400});return Response.json({config:{...changes,suspended:false}});},
  Deno:{serve:fn=>handler=fn,env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-service':'synthetic-public'}}});
 vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/platform-config/index.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'')),context);
 return {calls,writes,send:async()=>{const response=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({client_id:92,request_id:request,changes,...(recovery?{action:'recover',recovery_action:recoveryAction,reason:'Synthetic verified read-back'}:{})})}));return {status:response.status,body:await response.json()};}};
}
test('config writes/recovery never report applied when the authoritative intent is stale or unresolved',async()=>{
 for(const recovery of [false,true])for(const current of [false,true]){
  const f=fixture({recovery,current}),r=await f.send();assert.equal(r.status,current?200:503);
  assert.equal(f.calls.filter(([n])=>n==='platform_config_finish_result').length,1);
  assert.equal(f.writes.length,recovery?2:1,'Recovery must acknowledge only the exact original journal request');if(!current)assert.notEqual(r.body.state,'applied');
 }
});
test('timeout stays uncertain, rejection stays failed, and denied roles dispatch nothing',async()=>{
 for(const [remote,state] of [['timeout','uncertain'],['reject','failed']]){
  const f=fixture({remote});assert.equal((await f.send()).status,503);
  assert.equal(f.calls.find(([n])=>n==='platform_finish_config')[1].p_state,state);assert.equal(f.writes.length,1);
 }
 const denied=fixture({denied:true});assert.equal((await denied.send()).status,403);assert.equal(denied.writes.length,0);
});

test('matching read-back alone cannot resolve an uncertain original write',async()=>{
 for(const recoveryAction of ['read','reconcile']){
  const f=fixture({recovery:true,recoveryAction});const r=await f.send();assert.notEqual(r.body.state,'applied');
  assert.equal(f.calls.find(([name])=>name==='platform_config_recovery_finish')[1].p_state,null);
  assert.deepEqual(f.writes.map(w=>w.operation),['config-read']);
 }
 const retry=fixture({recovery:true,recoveryAction:'retry'});await retry.send();
 assert.deepEqual(retry.writes.map(w=>w.operation),['config-read','config-write']);
 assert.equal(retry.writes[1].request_id,'99000000-0000-4000-8000-000000000008');
 const failedRead=fixture({recovery:true,remote:'reject'});await failedRead.send();
 assert.equal(failedRead.calls.find(([name])=>name==='platform_config_recovery_finish')[1].p_state,null);
 assert.equal(failedRead.writes.length,1,'Failed observation must not dispatch a recovery write');
 const rejected=fixture({recovery:true,remote:'reject-write'});await rejected.send();
 assert.equal(rejected.writes.length,2);
 assert.equal(rejected.calls.find(([name])=>name==='platform_config_recovery_finish')[1].p_state,'uncertain','A rejected replay cannot prove the original remote outcome');
});

test('an old applied receipt cannot claim current synchronization through duplicate or completed recovery paths',async()=>{
 for(const recovery of [false,true])for(const current of [false,true]){
  const f=fixture({recovery,current,complete:true}),r=await f.send();
  assert.equal(r.status,current?200:503);assert.equal(f.writes.length,0);
  assert.equal(f.calls.filter(([n])=>n==='platform_config_finish_result').length,1);
  if(!current)assert.notEqual(r.body.state,'applied');
 }
});
