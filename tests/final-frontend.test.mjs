import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('P-02 public export accepts only this project, anon role, future finite expiry and a public site key',()=>{
 const ctx={URL,atob,Date};vm.createContext(ctx);vm.runInContext(read('src/lifecycle.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);const ref='abcdefghijklmnopqrst',client={supabase_url:`https://${ref}.supabase.co`},jwt=c=>'x.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.x',valid={role:'anon',ref,exp:Date.now()/1000+3600};
 assert.match(ctx.publicEnvironment(client,jwt(valid),'0xPUBLIC_SITE_FIXTURE'),/VITE_SUPABASE_URL/);
 for(const c of [{...valid,ref:'bcdefghijklmnopqrstu'},{...valid,exp:1},{...valid,role:'service_role'},null,{...valid,exp:null}])assert.throws(()=>ctx.publicEnvironment(client,jwt(c),'0xPUBLIC_SITE_FIXTURE'));
 assert.throws(()=>ctx.publicEnvironment(client,'not-json','0xPUBLIC_SITE_FIXTURE'));assert.throws(()=>ctx.publicEnvironment(client,jwt(valid),'replace-with-key'));
});
test('P-01 authorized detail/historical URL restore rejects unauthorized IDs and fences departed selection',async()=>{
 const state={authenticated:true,dataReady:true,currentUser:{role:'master_admin'},page:'overview',clientView:'current',clientSelectionGeneration:0,data:{clients:[{id:1,lifecycle_state:'Active'},{id:2,lifecycle_state:'Archived'}]}};let authority=1,release;const loc={href:'https://platform.example.test/clients/2?view=historical'};
 const ctx={pState:state,URL,location:loc,history:{replaceState:(_s,_t,u)=>loc.href=u},captureAuthority:()=>authority,authorityCurrent:c=>c===authority,selectClient:c=>{state.selectedClient=c;state.clientSelectionGeneration++},loadClientData:async()=>new Promise(r=>release=r)};vm.createContext(ctx);vm.runInContext(read('src/client-routes.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 let renders=0;const pending=ctx.restoreRoute(()=>renders++);assert.equal(state.selectedClient.id,2);assert.equal(ctx.routePath(),'/clients/2?view=historical');state.clientSelectionGeneration++;state.page='clients';release(true);await pending;assert.equal(renders,1);
 state.currentUser.role='portfolio_manager';await ctx.restoreRoute(()=>renders++);assert.equal(state.selectedClient,undefined);assert.match(state.routeError,/Master/);
 state.currentUser.role='master_admin';loc.href='https://platform.example.test/clients/999';await ctx.restoreRoute(()=>renders++);assert.match(state.routeError,/unavailable/);
});
