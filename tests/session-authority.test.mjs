// Execute the actual browser validator/state. Provider behavior has separate
// real GoTrue tests; these doubles deliberately exercise network uncertainty.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(response){
 const calls=[],ctx={localStorage:{getItem(){}},navigator:{onLine:true},cancelDialogs:()=>calls.push('cancel'),pb:{rpc:async()=>{if(response instanceof Error)throw response;return response;},auth:{signOut:async options=>{assert.equal(options.scope,'local');calls.push('logout');}}}};
 vm.createContext(ctx);vm.runInContext(read('src/state.js').replace(/^export /gm,'')+'\nglobalThis.pState=pState;'+read('src/helpers.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 ctx.pState.authenticated=true;ctx.pState.currentUser={role:'master_admin',auth_user_id:'synthetic-master'};
 ctx.pState.data.clients=[{private:'synthetic'}];ctx.pState.selectedClient={private:'synthetic'};ctx.pState.clientData={private:'synthetic'};ctx.pState.modal={private:'synthetic'};
 ctx.pState.recoveryEmail='synthetic@example.test';ctx.pState.filter='private search';
 return {ctx,calls,check:()=>ctx.validateSession(()=>calls.push('render'))};
}
test('canonical revocation clears private state, dialogs and identity with local logout once',async()=>{
 const f=fixture({data:{authorized:false}});await f.check();await f.check();assert.deepEqual(f.calls,['cancel','render','logout']);
 assert.equal(f.ctx.pState.authenticated,false);assert.equal(f.ctx.pState.currentUser.role,null);assert.equal(f.ctx.pState.selectedClient,null);assert.equal(f.ctx.pState.modal,null);assert.equal(f.ctx.pState.data.clients.length,0);assert.equal(Object.keys(f.ctx.pState.clientData).length,0);
 assert.equal(f.ctx.pState.recoveryEmail,null);assert.equal(f.ctx.pState.filter,'');
});
test('network/ambiguous failure preserves session; confirmed JWT rejection and switched identity clear it',async()=>{
 for(const result of [new TypeError('offline'),{error:{status:503}},{data:null},{data:{authorized:true,auth_user_id:'synthetic-master'}}]){const f=fixture(result);await f.check();assert.deepEqual(f.calls,[]);assert.equal(f.ctx.pState.authenticated,true);}
 for(const result of [{error:{status:401}},{error:{code:'PGRST301'}},{data:{authorized:true,auth_user_id:'different'}}]){const f=fixture(result);await f.check();assert.equal(f.ctx.pState.authenticated,false);}
});
test('logout generation discards late authorization responses',async()=>{
 let release;const f=fixture({});f.ctx.pb.rpc=()=>new Promise(r=>release=r);const check=f.check();f.ctx.clearSensitiveState();release({data:{authorized:false}});await check;assert.deepEqual(f.calls,[]);
});
test('actual private data loaders discard late results and do not start after logout',async()=>{
 const f=fixture({});const pending=[];let reads=0;
 f.ctx.pb.from=()=>{const q={select:()=>q,order:()=>q,range:()=>{reads++;return new Promise(r=>pending.push(()=>r({data:[{id:1,private:'synthetic'}]})));},single:()=>new Promise(r=>pending.push(()=>r({data:{admin_username:'late-alias'}})))};return q;};
 f.ctx.pb.rpc=async name=>({data:name==='platform_team_history'?{operations:[]}: {private:'synthetic'}});
 vm.runInContext(read('src/async-context.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),f.ctx);
 f.ctx.createClient=()=>f.ctx.pb;f.ctx.testEnv={};f.ctx.serverConfigOperation=()=>{};
 vm.runInContext(read('src/supabase.js').replace(/^import .*$/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','testEnv'),f.ctx);
 const loading=f.ctx.loadPlatform();const config=f.ctx.loadConfig();const client=f.ctx.loadClientData({id:1});f.ctx.clearSensitiveState();pending.splice(0).forEach(r=>r());await Promise.all([loading,config,client]);
 assert.equal(f.ctx.pState.data.clients.length,0);assert.equal(f.ctx.pState.selectedClient,null);assert.equal(Object.keys(f.ctx.pState.clientData).length,0);assert.notEqual(vm.runInContext('PCFG.admin_username',f.ctx),'late-alias');
 const count=reads;await f.ctx.loadPlatform();await f.ctx.loadClientData({id:1});assert.equal(reads,count);
});
