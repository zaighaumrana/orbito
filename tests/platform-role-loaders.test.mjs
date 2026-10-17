// Actual state, loaders, canonical validator and role guards; transport only is
// synthetic. Real SQL/PostgREST enforcement is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(role='portfolio_manager'){
 const calls=[],effects=[];let liveRole=role,failedDataset,nativeFailure=false,gate;
 const who='synthetic-employee',session='synthetic-session';
 const rows={clients:[{id:1,name:'Required client',plan:'Basic',currency:'PKR'}],support:[{id:2,message:'Required support'}],invoices:[{id:3,total_due:123,payment_status:'Unpaid'}],account:[{auth_user_id:who}],payments:[{id:4,amount:10}],usage:[{id:5,token_count:1}],credits:[],rateLog:[]};
 const identity=()=>({auth_user_id:who,session_id:session,role:liveRole,email:'employee@example.test',username:'Employee'});
 const transport={auth:{getUser:async()=>{if(nativeFailure)throw new TypeError('Synthetic network failure');return {data:{user:{id:who}}};},signOut:async()=>effects.push('signout')},
  from:()=>{calls.push('RAW');throw Error('An employee must not request raw tables');},
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='platform_operator_identity')return {data:identity()};
   if(name==='platform_session_status')return {data:{authorized:true,...identity()}};
   if(name==='platform_read_page'){
    if(gate && args.p_dataset==='clients')await gate.promise;
    if(args.p_dataset===failedDataset)return {error:{code:'42501',message:'Dataset not authorized'}};
    return {data:{...identity(),rows:args.p_offset?[]:rows[args.p_dataset]}};
   }
   if(name==='platform_usage_summary')return {data:[{client_id:1,billCount:1,grandTotal:5}]};
   if(name==='platform_dashboard_summary')return {data:{open_tickets:1}};
   return {data:{}};
  }};
 const ctx={testEnv:{},navigator:{onLine:true},localStorage:{getItem(){},removeItem(){}},createClient:()=>transport,TypeError,cancelDialogs:()=>effects.push('cancel-dialogs')};
 vm.createContext(ctx);for(const file of ['src/state.js','src/async-context.js','src/supabase.js','src/helpers.js'])vm.runInContext(strip(read(file))+(file==='src/state.js'?'\nglobalThis.pState=pState;':''),ctx);
 Object.assign(ctx.pState,{authenticated:true,currentUser:identity(),page:'overview',onRoleChange:()=>effects.push('invalidate-render'),onDataError:()=>effects.push('error-render')});
 return {ctx,calls,effects,rows,transport,setRole:r=>liveRole=r,failDataset:d=>failedDataset=d,failNative:()=>nativeFailure=true,holdClients:()=>gate=deferred()};
}
const datasets=f=>f.calls.filter(c=>Array.isArray(c) && c[0]==='platform_read_page').map(c=>c[1].p_dataset);

test('a failed dataset cannot suppress a later owned canonical role change or its authorized reload',async()=>{
 for(const [before,after,failed] of [['portfolio_manager','billing_person','support'],['billing_person','portfolio_manager','payments']]){
  const f=fixture(before);await f.ctx.loadPlatform();f.ctx.pState.selectedClient={id:1};f.ctx.pState.modal={type:'edit-client'};
  const clients=f.holdClients();f.failDataset(failed);await assert.rejects(f.ctx.loadPlatform());
  const verified=deferred();f.transport.auth.getUser=()=>verified.promise;f.setRole(after);clients.resolve();await new Promise(r=>setImmediate(r));
  assert.equal(f.ctx.pState.currentUser.role,after);assert.equal(f.ctx.pState.modal,null);assert.equal(f.ctx.pState.selectedClient,null);
  assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.data.payments.length,0);assert.equal(f.ctx.pState.dataReady,false);
  verified.resolve({data:{user:{id:'synthetic-employee'}}});await new Promise(r=>setImmediate(r));
  assert.equal(f.ctx.pState.dataReady,true);assert.equal(after==='billing_person'?f.ctx.pState.data.support.length:f.ctx.pState.data.payments.length,0);
  assert.ok(!f.effects.includes('signout'));
 }
});

test('an old-role page arriving after the failed-dataset role cutover cannot replace or reverse the successor',async()=>{
 const f=fixture();await f.ctx.loadPlatform();const oldIdentity={...f.ctx.pState.currentUser},late=deferred(),rpc=f.transport.rpc;let held=false;
 f.transport.rpc=(name,args)=>{if(name==='platform_read_page' && args.p_dataset==='invoices' && !held){held=true;return late.promise;}return rpc(name,args);};
 const clients=f.holdClients();f.failDataset('support');await assert.rejects(f.ctx.loadPlatform());f.setRole('billing_person');clients.resolve();await new Promise(r=>setImmediate(r));
 assert.equal(f.ctx.pState.currentUser.role,'billing_person');const generation=f.ctx.pState.authorityGeneration;
 late.resolve({data:{...oldIdentity,rows:[{private:'former-role'}]}});await new Promise(r=>setImmediate(r));
 assert.equal(f.ctx.pState.currentUser.role,'billing_person');assert.equal(f.ctx.pState.authorityGeneration,generation);
 assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.data.payments.length,1);assert.equal(f.ctx.pState.dataReady,true);
 assert.doesNotMatch(JSON.stringify(f.ctx.pState.data),/former-role/);
});
test('Manager loader requests operational/support, own account and invoice summaries only; pagination retains all authorized records',async()=>{
 const f=fixture();f.rows.clients=Array.from({length:1000},(_,id)=>({id}));let page=0;const old=f.transport.rpc;f.transport.rpc=async(name,args)=>{if(name==='platform_read_page' && args.p_dataset==='clients'){f.calls.push([name,args]);return {data:{...f.ctx.pState.currentUser,rows:page++?[{id:1000}]:f.rows.clients}};}return old(name,args);};
 await f.ctx.loadPlatform();assert.equal(f.ctx.pState.data.clients.length,1001);assert.deepEqual([...new Set(datasets(f))].sort(),['account','clients','invoices','support']);assert.equal(page,2);
 assert.equal(f.calls.includes('RAW'),false);assert.equal(f.ctx.pState.data.payments.length,0);assert.equal(f.ctx.pState.data.usage.length,0);assert.equal(f.ctx.pState.data.platformUsers.length,1);assert.equal(f.ctx.pState.dataReady,true);
});
test('Billing loader requests financial datasets and minimal client/own identity; support is aggregate only',async()=>{
 const f=fixture('billing_person');await f.ctx.loadConfig();await f.ctx.loadPlatform();
 assert.deepEqual(datasets(f).sort(),['account','clients','credits','invoices','payments','rateLog','usage']);assert.equal(f.calls.includes('RAW'),false);assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.data.openTickets,1);assert.equal(f.ctx.pState.data.teamArchive.length,0);
});
test('denied financial data fails explicitly; it cannot be published as an empty successful ledger',async()=>{
 const f=fixture('billing_person');f.failDataset('payments');await assert.rejects(f.ctx.loadPlatform());assert.equal(f.ctx.pState.dataReady,false);assert.match(f.ctx.pState.dataError,/unavailable/);assert.equal(f.ctx.pState.data.clients.length,0);assert.ok(f.effects.includes('error-render'));
});
test('a current selected client refresh uses the published role dataset and keeps the same client usable',async()=>{
 const f=fixture();f.ctx.pState.selectedClient={id:1,name:'Old name'};await f.ctx.loadPlatform();assert.equal(f.ctx.pState.selectedClient.name,'Required client');assert.equal(f.ctx.pState.dataReady,true);assert.equal(f.ctx.pState.dataError,null);
});
test('canonical role change immediately clears old data, selection/modal/navigation even if native refresh fails; no session signout',async()=>{
 const f=fixture();await f.ctx.loadPlatform();const oldGeneration=f.ctx.pState.authorityGeneration;
 f.ctx.pState.page='support';f.ctx.pState.selectedClient={id:1};f.ctx.pState.clientData={private:'prior-role'};f.ctx.pState.modal={type:'edit-client'};f.setRole('billing_person');f.failNative();
 await f.ctx.validateSession(()=>f.effects.push('render'));assert.ok(f.ctx.pState.authorityGeneration>oldGeneration);assert.equal(f.ctx.pState.currentUser.role,'billing_person');assert.equal(f.ctx.pState.authenticated,true);assert.equal(f.ctx.pState.selectedClient,null);assert.equal(f.ctx.pState.modal,null);assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.page,'overview');assert.equal(f.ctx.pState.dataReady,false);assert.ok(!f.effects.includes('signout'));
});
test('live Manager/Billing changes reload only new datasets; an obsolete role read cannot restore prior cached records',async()=>{
 const f=fixture();await f.ctx.loadPlatform();const old=f.holdClients(),work=f.ctx.loadPlatform();await new Promise(r=>setImmediate(r));
 f.setRole('billing_person');const refresh=f.ctx.validateSession(()=>{});old.resolve();await Promise.all([work,refresh]);assert.equal(f.ctx.pState.currentUser.role,'billing_person');assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.data.payments.length,1);assert.equal(f.ctx.pState.authenticated,true);
 f.setRole('portfolio_manager');await f.ctx.validateSession(()=>{});assert.equal(f.ctx.pState.data.payments.length,0);assert.equal(f.ctx.pState.data.usage.length,0);assert.equal(f.ctx.pState.data.support.length,1);assert.ok(!f.effects.includes('signout'));
});

test('a changed-role page clears prior private state before its native identity retry can fail',async()=>{
 const f=fixture();await f.ctx.loadPlatform();const original=f.ctx.pState.currentUser.session_id;
 f.ctx.pState.page='support';f.ctx.pState.selectedClient={id:1};f.ctx.pState.modal={type:'edit-client'};
 const gate=f.holdClients(),work=f.ctx.loadPlatform();await new Promise(r=>setImmediate(r));
 f.setRole('billing_person');f.failNative();gate.resolve();await assert.rejects(work);
 assert.equal(f.ctx.pState.data.support.length,0);assert.equal(f.ctx.pState.modal,null);assert.equal(f.ctx.pState.selectedClient,null);
 assert.equal(f.ctx.pState.currentUser.role,'billing_person');assert.equal(f.ctx.pState.currentUser.session_id,original);
 assert.equal(f.ctx.pState.dataReady,false);assert.match(f.ctx.pState.dataError,/unavailable/);assert.equal(f.ctx.pState.page,'overview');
 assert.equal(f.ctx.pState.authenticated,true);assert.ok(!f.effects.includes('signout'));assert.ok(f.effects.includes('error-render'));
});
