// Execute the real shared handler; Auth/REST doubles are explicitly NOT hosted proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const master='94000000-0000-4000-8000-000000000001',target='94000000-0000-4000-8000-000000000002',rowId='94000000-0000-4000-8000-000000000003';
const confirmedAt='2026-10-09T00:00:00Z';
export function fixture(options={}) {
 const calls=[],audit=[],rows=options.rows || [{id:rowId,auth_user_id:target,name:'Team',email:'team@example.test',role:'portfolio_manager',status:'Active'}];
 const user=options.user===null?null:options.user || {id:master,email:'master@example.test',email_confirmed_at:confirmedAt};
 const authUsers=options.authUsers || [{id:target,email:'team@example.test'},{id:master,email:'master@example.test'}];
 const caller={auth:{getUser:async()=>({data:{user},error:options.invalid?{}:null})},rpc:async()=>{
  calls.push(['identity']);
  return options.identityRpc?options.identityRpc():{data:options.identity || {auth_user_id:user?.id,role:options.role || 'master_admin'},error:options.identityError?{}:null};
 }};
 const admin={auth:{admin:{
  getUserById:async id=>({data:{user:authUsers.find(u=>u.id===id)},error:options.lookupError?{}:null}),
  listUsers:async()=>({data:{users:options.fullInventory?Array.from({length:200},()=>({email:'other@example.test'})):authUsers},error:options.inventoryError?{}:null}),
  inviteUserByEmail:async(email,settings)=>{calls.push(['invite',email,settings]);return options.inviteError?{error:{message:'PROVIDER SECRET'}}:{data:{user:{id:target,email}}};},
  updateUserById:async(id,values)=>{calls.push(['auth-update',id,values]);return {error:options.authError?{message:'PROVIDER SECRET'}:null};},
  deleteUser:async id=>{calls.push(['auth-delete',id]);return {error:options.authError?{message:'PROVIDER SECRET'}:null};},
 }},from:table=>{
  let verb='select',payload,filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},ilike(k,v){filters.push([k,v.toLowerCase().replace(/\\([\\%_])/g,'$1')]);return q;},limit(){return q;},
   insert(v){verb='insert';payload=v;return q;},update(v){verb='update';payload=v;return q;},
   then(resolve,reject){return Promise.resolve().then(()=>{
    if(table==='operator_audit'){if(options.auditError) return {error:{message:'PROVIDER SECRET'}};audit.push(payload);return {};}
    const found=rows.filter(r=>filters.every(([k,v])=>k==='email'?r[k].toLowerCase()===v:r[k]===v));
    if(verb==='select')return {data:found};
    calls.push(['db-'+verb,payload]);
    if(options.dbError)return {error:{message:'PROVIDER SECRET'}};
    if(verb==='insert'){rows.push({id:rowId,...payload});return {data:[{id:rowId}]};}
    found.forEach(r=>Object.assign(r,payload));return {data:found.map(r=>({id:r.id}))};
   }).then(resolve,reject);},
  };return q;
 }};
 const ctx={URL,Request,Response,crypto:webcrypto,Date,createClient(){throw Error('Inject factory');},
  Deno:{env:{get:key=>({SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',PLATFORM_TEAM_SITE_URL:options.site || 'https://platform.example.test'})[key]}}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/platform-team.ts').replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'}),ctx);
 const factory=(_url,key)=>{calls.push(['client',key]);return key==='fixture-anon'?caller:admin;};
 const invoke=async(operation,body,headers={Authorization:'Bearer fixture-session'},method='POST')=>{
  const result=await ctx.platformTeamHandler(operation,factory)(new Request('https://local.invalid/functions/v1/'+operation,{method,headers,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  return {status:result.status,body:result.status===204?null:await result.json(),headers:result.headers};
 };
 return {invoke,calls,audit,rows};
}
const mutationCalls=f=>f.calls.filter(c=>['invite','auth-update','auth-delete','db-insert','db-update'].includes(c[0]));
const createBody={email:'new@example.test',name:'New Team',role:'billing_person'};
for(const role of ['portfolio_manager','billing_person','ordinary','master_admin-forged'])for(const action of ['create','update','delete'])test(role+' denied '+action+' before service construction',async()=>{
 const f=fixture({role});const r=await f.invoke(action,action==='create'?createBody:{id:rowId,password:'NewPassword1!'});
 assert.equal(r.status,403);assert.equal(f.calls.filter(c=>c[0]==='client').length,1);assert.deepEqual(mutationCalls(f),[]);
});
for(const options of [{user:null},{invalid:true},{user:{id:master,email:'master@example.test',email_confirmed_at:confirmedAt,is_anonymous:true}},{user:{id:master,email:'master@example.test',email_confirmed_at:confirmedAt,deleted_at:'2026-01-01'}},{identity:{auth_user_id:target,role:'master_admin'}},{identityError:true}])test('invalid session/canonical identity denied '+JSON.stringify(Object.keys(options)),async()=>{
 const f=fixture(options);const r=await f.invoke('delete',{id:rowId});assert.ok([401,403].includes(r.status));assert.equal(f.calls.filter(c=>c[0]==='client').length,1);assert.deepEqual(mutationCalls(f),[]);
});
test('unconfirmed email cannot use canonical master authority or phone confirmation',async()=>{
 for(const email_confirmed_at of [null,undefined])for(const action of ['create','update','delete']){
  const f=fixture({user:{id:master,email:'master@example.test',email_confirmed_at,confirmed_at:confirmedAt,phone_confirmed_at:confirmedAt}});
  const response=await f.invoke(action,action==='create'?createBody:action==='update'?{id:rowId,name:'Edited'}:{id:rowId});
  assert.equal(response.status,401);assert.equal(f.calls.filter(c=>c[0]==='client').length,1);
  assert.ok(!f.calls.some(c=>c[0]==='identity'));assert.deepEqual(mutationCalls(f),[]);assert.deepEqual(f.audit,[]);
 }
});
test('absent bearer, forbidden Origin and invalid site fail closed',async()=>{
 for(const [options,headers] of [[{},{}],[{},{Authorization:'Bearer fixture',Origin:'https://attacker.example.test'}],[{site:'http://platform.example.test'},{Authorization:'Bearer fixture'}]]){
  const f=fixture(options);assert.ok((await f.invoke('create',createBody,headers)).status>=400);assert.equal(f.calls.length,0);
 }
});
test('method and preflight restrictions do not create a service client',async()=>{
 const f=fixture();assert.equal((await f.invoke('create',{}, {},'GET')).status,405);
 const r=await f.invoke('create',{}, {Origin:'https://platform.example.test'},'OPTIONS');assert.equal(r.status,204);assert.equal(f.calls.length,0);
});
for(const body of [{...createBody,role:'master_admin'},{...createBody,actor_id:master},{...createBody,user_metadata:{role:'master_admin'}},{...createBody,email:'master@example.test'},{...createBody,redirectTo:'https://attacker.example.test'},{...createBody,password:'Password1!'}])test('forged/unsupported create fields denied '+Object.keys(body).join(','),async()=>{
 const f=fixture();assert.ok((await f.invoke('create',body)).status>=400);assert.deepEqual(mutationCalls(f),[]);
});
for(const action of ['update','delete'])test('master target protected through direct ID and mapped team row: '+action,async()=>{
 for(const body of [{auth_user_id:master,password:'NewPassword1!'},{id:rowId,password:'NewPassword1!'}]){
  const f=fixture({rows:[{id:rowId,auth_user_id:master,email:'master@example.test',role:'portfolio_manager',status:'Active'}]});
  const payload=action==='delete'?{...body,password:undefined}:body;
  const r=await f.invoke(action,payload);assert.equal(r.status,403);assert.deepEqual(mutationCalls(f),[]);
 }
});
test('master invites only a new ordinary identity; retry uses linked pending row without resending',async()=>{
 const f=fixture();let r=await f.invoke('create',createBody);assert.equal(r.status,200);assert.equal(f.rows.at(-1).status,'Pending');
 const invite=f.calls.find(c=>c[0]==='invite');assert.equal(invite[2].redirectTo,'https://platform.example.test/?reset=true');
 // Auth side successful invite in this double must be reflected for ownership verification.
 const retry=fixture({rows:[{id:rowId,auth_user_id:target,name:'New Team',email:createBody.email,role:createBody.role,status:'Pending'}],authUsers:[{id:target,email:createBody.email}]});
 r=await retry.invoke('create',createBody);assert.equal(r.status,200);assert.equal(r.body.already_invited,true);assert.deepEqual(mutationCalls(retry),[]);
});
test('existing Auth identity and ambiguous team ownership cannot be adopted',async()=>{
 const f=fixture();assert.equal((await f.invoke('create',{...createBody,email:'team@example.test'})).status,409);
 const duplicate=fixture({rows:[...f.rows,{...f.rows[0],id:master}]});assert.equal((await duplicate.invoke('update',{id:rowId,name:'Edited'})).status,409);assert.deepEqual(mutationCalls(duplicate),[]);
});
test('unknown/orphan Auth invite is denied before sending and large inventory fails closed',async()=>{
 for(const options of [{rows:[],authUsers:[{id:target,email:createBody.email}]},{rows:[],fullInventory:true}]){
  const f=fixture(options);assert.ok((await f.invoke('create',createBody)).status>=400);assert.deepEqual(mutationCalls(f),[]);
 }
});
test('master updates linked role/profile/credentials; audit excludes credentials and personal fields',async()=>{
 const f=fixture();const r=await f.invoke('update',{id:rowId,email:'changed@example.test',name:'Edited',role:'billing_person',password:'NewPassword1!'});
 assert.equal(r.status,200);assert.equal(f.rows[0].role,'billing_person');assert.equal(f.calls.find(c=>c[0]==='auth-update')[1],target);
 const logged=JSON.stringify(f.audit);for(const forbidden of ['NewPassword1!','changed@example.test','Edited','fixture-session'])assert.ok(!logged.includes(forbidden));assert.equal(f.audit.length,2);
 assert.equal(f.audit[0].detail.previous_role,'portfolio_manager');assert.equal(f.audit[0].detail.requested_role,'billing_person');assert.ok(f.audit[0].detail.fields.includes('password'));
});
test('legacy Auth-ID payload resolves the server mapping and supports prior email edit',async()=>{
 const f=fixture({rows:[{id:rowId,auth_user_id:target,name:'Team',email:'changed@example.test',role:'billing_person',status:'Active'}]});
 assert.equal((await f.invoke('update',{auth_user_id:target,email:'changed@example.test'})).status,200);
 const bad=fixture();assert.equal((await bad.invoke('update',{id:rowId,auth_user_id:master,name:'Bad'})).status,403);assert.deepEqual(mutationCalls(bad),[]);
});
test('master delete revokes operator access before deleting only the server-held Auth ID',async()=>{
 const f=fixture();assert.equal((await f.invoke('delete',{id:rowId})).status,200);assert.equal(f.rows[0].status,'Inactive');
 assert.ok(f.calls.findIndex(c=>c[0]==='db-update')<f.calls.findIndex(c=>c[0]==='auth-delete'));assert.equal(f.calls.find(c=>c[0]==='auth-delete')[1],target);
 const unlinked=fixture({rows:[{...f.rows[0],auth_user_id:null,status:'Active'}]});assert.equal((await unlinked.invoke('delete',{id:rowId})).status,200);assert.equal(unlinked.rows[0].status,'Inactive');assert.ok(!unlinked.calls.some(c=>c[0]==='auth-delete'));
});
test('required start audit failure prevents all privileged mutations',async()=>{
 for(const action of ['create','update','delete']){
  const f=fixture({auditError:true});assert.equal((await f.invoke(action,action==='create'?createBody:action==='update'?{id:rowId,name:'Edited'}:{id:rowId})).status,503);assert.deepEqual(mutationCalls(f),[]);
 }
});
test('partial Auth/database failure is explicit, sanitized, audited and never blindly compensated',async()=>{
 const f=fixture({dbError:true});const r=await f.invoke('update',{id:rowId,email:'changed@example.test'});assert.equal(r.status,503);assert.equal(r.body.changes_may_have_occurred,true);assert.ok(r.body.operation_id);assert.ok(!JSON.stringify(r.body).includes('PROVIDER SECRET'));assert.equal(f.calls.filter(c=>c[0]==='auth-delete').length,0);assert.equal(f.audit.at(-1).action,'platform_team_update_failed');
 const removed=fixture({authError:true});assert.equal((await removed.invoke('delete',{id:rowId})).status,503);assert.equal(removed.rows[0].status,'Inactive');
 const invited=fixture({dbError:true});assert.equal((await invited.invoke('create',createBody)).status,503);assert.equal(invited.calls.filter(c=>c[0]==='auth-delete').length,0);
});
test('canonical master is rechecked immediately before mutations',async()=>{
 let n=0;const f=fixture({identityRpc:async()=>++n===1?{data:{auth_user_id:master,role:'master_admin'}}:{error:{}}});
 assert.equal((await f.invoke('delete',{id:rowId})).status,403);assert.deepEqual(mutationCalls(f),[]);
});
test('malformed JSON, weak passwords, conflicting mapping and email drift are denied',async()=>{
 for(const body of ['{',{id:rowId,password:'weak'},{id:rowId,auth_user_id:rowId,name:'Edited'}]){
  const f=fixture();assert.ok((await f.invoke('update',body)).status>=400);assert.deepEqual(mutationCalls(f),[]);
 }
 const f=fixture({authUsers:[{id:target,email:'drift@example.test'}]});assert.equal((await f.invoke('delete',{id:rowId})).status,409);assert.deepEqual(mutationCalls(f),[]);
 for(const options of [{authUsers:[{id:target,email:'team@example.test',deleted_at:'2026-01-01'}]},{lookupError:true}]){const guarded=fixture(options);assert.equal((await guarded.invoke('update',{id:rowId,password:'NewPassword1!'})).status,409);assert.deepEqual(mutationCalls(guarded),[]);}
 const banned=fixture({user:{id:master,email:'master@example.test',email_confirmed_at:confirmedAt,banned_until:'2099-01-01'}});assert.equal((await banned.invoke('delete',{id:rowId})).status,401);assert.equal(banned.calls.filter(c=>c[0]==='client').length,1);assert.deepEqual(mutationCalls(banned),[]);
});
test('gateway verification remains enabled and entrypoints use the same reviewed handler',()=>{
 for(const action of ['create','update','delete']){
  assert.match(read('supabase/config.toml'),new RegExp('\\[functions\\.'+action+'-platform-user\\]\\s*verify_jwt = true'));
  assert.match(read('supabase/functions/'+action+'-platform-user/index.ts'),new RegExp('Deno\\.serve\\(platformTeamHandler\\("'+action+'"\\)\\)'));
 }
});
test('frontend edit and removal never split team/Auth writes or trust cached Auth targets',async()=>{
 const ctx={pState:{currentUser:{role:'master_admin'},data:{platformUsers:[]}},FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values);}},alert(){},loadPlatform:async()=>{},render(){},pb:{from(){throw Error('No direct team write permitted');},functions:{invoke:async(name,args)=>{ctx.calls.push([name,args]);return {};}}},calls:[]};
 vm.createContext(ctx);vm.runInContext(read('src/forms.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 await ctx.handleFormSubmit({preventDefault(){},target:{dataset:{pForm:'edit-platform-user'},values:{id:rowId,name:'Team',email:'team@example.test',role:'billing_person'}}});
 assert.equal(ctx.calls[0][0],'update-platform-user');assert.equal(ctx.calls[0][1].body.id,rowId);assert.ok(!('auth_user_id' in ctx.calls[0][1].body));
 const block=read('src/events.js').split('if (action === "remove-platform-user") {')[1].split('\n    /*')[0];
 ctx.confirm=()=>true;ctx.el={dataset:{pId:rowId}};
 await vm.runInContext('async function remove(){'+block+'\nremove()',ctx);assert.equal(ctx.calls[1][0],'delete-platform-user');assert.equal(ctx.calls[1][1].body.id,rowId);
});
