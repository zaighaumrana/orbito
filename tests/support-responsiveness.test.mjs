import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'').replace(/import\.meta\.env/g,'({})');
function fixture({baseline=false,delay=0}={}){
 const calls=[],state={authenticated:true,dataReady:true,authorityGeneration:1,clientSelectionGeneration:1,clientRequestGeneration:1,page:'support',modal:null,currentUser:{role:'master_admin',auth_user_id:'actor',session_id:'session'},filter:'',data:{clients:[],support:[],usage:[],invoices:[],platformUsers:[]},clientData:{}};
 let rows=[{id:1,revision:1,verified:true,status:'Open',subject:'Verified ticket',client_name:'Client',client_id:1}],resolveError=null,held=null;
 const client={id:1,pairing_mode:'managed',onboarding_version:2,lifecycle_state:'Active'};
 const reply=async(name,data)=>{calls.push(name);if(delay)await new Promise(r=>setTimeout(r,delay));return {data:structuredClone(data)}};
 const pb={auth:{getUser:()=>reply('auth.getUser',{user:{id:'actor'}})},rpc:async(name,args={})=>{
  if(name==='platform_operator_identity')return reply(name,state.currentUser);
  if(name==='platform_support_ticket_page'){if(held)return held;return reply(name,{rows,offset:args.p_offset,has_more:false});}
  if(name==='platform_support_ticket_resolve'){calls.push(name);if(delay)await new Promise(r=>setTimeout(r,delay));if(resolveError)return {error:resolveError};rows=[{...rows[0],status:'Resolved',revision:2}];return {data:{resolved:true,revision:2}};}
  return reply(name,name==='platform_dashboard_summary'?{open_tickets:0}:name==='platform_usage_summary'?[]:name==='platform_team_history'?{operations:[]}:name==='platform_provision_status'?{job:{state:'complete'}}:name==='platform_client_operations'?{client:1}:{state:'waiting'});
 },from:table=>({select(){return this},order(){return this},eq(){return this},single(){return reply(table+'.single',client)},range(){return reply(table,table==='clients'?[client]:[])}}),functions:{invoke:()=>{throw Error('Navigation must not write to a provider')}}};
 const messages=[],ctx={pState:state,pb,URL,Date,localStorage:{removeItem(){}},setPCFG(){},refreshRoleState(){},crypto,notify:{success:m=>messages.push(m),warning:m=>messages.push(m),error:m=>messages.push(m)}};
 vm.createContext(ctx);vm.runInContext(strip(read('src/async-context.js')),ctx);
 let source=baseline?execFileSync('git',['show','eb2f553ff3ad1513699dc478214767cb8c10821f:src/supabase.js'],{encoding:'utf8'}):read('src/supabase.js');
 source=source.replace(/^export const pb =.*$/m,'').replace(/^export const PLATFORM_AUTH_EMAIL =.*$/m,'');vm.runInContext(strip(source),ctx);
 if(!baseline)vm.runInContext(strip(read('src/support-controller.js')),ctx);
 return {ctx,state,calls,messages,client,setError:e=>resolveError=e,hold:p=>held=p,rows:()=>rows};
}
test('authoritative Support page/labels, role denial, and departed response fence',async()=>{
 const f=fixture();await f.ctx.loadSupportPage();assert.equal(f.state.supportView.rows[0].verified,true);assert.equal(f.state.supportView.ready,true);
 f.ctx.esc=String;f.ctx.tit=()=>'';vm.runInContext(strip(read('src/pages/support.js')),f.ctx);
 assert.match(f.ctx.pageSupport(),/Verified Shop session/);assert.match(f.ctx.pageSupport(),/data-p-revision="1"/);
 f.state.supportView=null;f.state.data.support=[{subject:'Unsafe raw fallback',status:'Open'}];assert.doesNotMatch(f.ctx.pageSupport(),/Unsafe raw fallback|Legacy \/ Identity Not Verified/);
 let release;f.hold(new Promise(r=>release=r));const pending=f.ctx.loadSupportPage();f.state.clientSelectionGeneration++;f.state.page='clients';release({data:{rows:[],offset:0}});assert.equal(await pending,false);assert.equal(f.state.supportView.ready,false);
 f.state.page='support';f.state.currentUser.role='billing_person';const count=f.calls.length;await assert.rejects(f.ctx.loadSupportPage(),/not authorized/);assert.equal(f.calls.length,count);
});
test('resolve rejects stale/missing actions, revisions and permissions; uncertain writes require refresh',async()=>{
 const f=fixture();await f.ctx.loadSupportPage();const render=()=>{};
 await f.ctx.resolveSupportTicket(999,'',render,1);await f.ctx.resolveSupportTicket(1,'',render,0);assert.equal(f.calls.filter(n=>n==='platform_support_ticket_resolve').length,0);
 f.setError({code:'PT409'});await f.ctx.resolveSupportTicket(1,'Keep this draft',render,1);assert.equal(f.state.supportView.ready,false);assert.equal(f.state.supportView.drafts[1],'Keep this draft');assert.match(f.messages.at(-1),/changed/);
 await f.ctx.resolveSupportTicket(1,'Keep this draft',render,1);assert.equal(f.calls.filter(n=>n==='platform_support_ticket_resolve').length,1);
 await f.ctx.loadSupportPage();f.setError({status:0});await f.ctx.resolveSupportTicket(1,'Original',render,1);assert.match(f.messages.at(-1),/uncertain/);
 await f.ctx.loadSupportPage();f.setError({code:'42501'});await f.ctx.resolveSupportTicket(1,'',render,1);assert.equal(f.state.supportView.rows.length,0);assert.match(f.messages.at(-1),/access/);
});
test('resolution prevents overlap and ignores a departed view',async()=>{
 const f=fixture({delay:5});await f.ctx.loadSupportPage();const original=f.state.supportView;
 const pending=f.ctx.resolveSupportTicket(1,'Original',()=>{},1);await f.ctx.resolveSupportTicket(1,'Duplicate',()=>{},1);f.state.clientSelectionGeneration++;await pending;
 assert.equal(f.calls.filter(n=>n==='platform_support_ticket_resolve').length,1);assert.equal(f.state.supportView,original);assert.equal(f.messages.some(m=>m==='Support ticket resolved.'),false);
});
test('measured selective refreshes avoid unrelated data and provider calls',async()=>{
 const metrics={fixture_delay_ms:8};
 for(const baseline of [true,false]){
  const f=fixture({baseline,delay:8});await f.ctx.loadSupportPage();f.calls.length=0;const start=performance.now();
  if(baseline){await f.ctx.pb.rpc('platform_support_ticket_resolve',{});await f.ctx.loadPlatform();await f.ctx.loadSupportPage();}
  else await f.ctx.resolveSupportTicket(1,'Resolved',()=>{},1);
  metrics[baseline?'support_before':'support_after']={requests:f.calls.length,elapsed_ms:+(performance.now()-start).toFixed(2),calls:[...f.calls]};
  if(!baseline){assert.equal(f.calls.length,3);assert.equal(f.state.supportView.rows[0].status,'Resolved');}
  f.state.page='client-detail';f.state.selectedClient=f.client;f.calls.length=0;const clientStart=performance.now();
  if(baseline)await f.ctx.loadPlatform();else await f.ctx.refreshClientStatus(f.client);
  await f.ctx.loadClientData(f.client,{readOnly:true});
  metrics[baseline?'client_before':'client_after']={requests:f.calls.length,elapsed_ms:+(performance.now()-clientStart).toFixed(2),calls:[...f.calls]};
 }
 assert.equal(metrics.support_before.requests,15);assert.equal(metrics.client_before.requests,17);assert.equal(metrics.client_after.requests,5);
 console.log('FOCUSED_PERFORMANCE '+JSON.stringify(metrics));
});
