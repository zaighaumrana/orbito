// Execute CURRENT server source. Auth/REST/SMTP doubles are not hosted proof.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
export const master='94000000-0000-4000-8000-000000000001',target='94000000-0000-4000-8000-000000000002',rowId='94000000-0000-4000-8000-000000000003',requestId='94000000-0000-4000-8000-000000000004';
export function fixture(options={}) {
 const calls=[],audit=[],archives=[],ops=new Map();
 const rows=structuredClone(options.rows || [{id:rowId,auth_user_id:target,email:'team@example.test',name:'Team',role:'portfolio_manager',status:options.status || 'Active',suspended_from:'Active'}]);
 const user=options.user===null?null:options.user || {id:master,email:'master@example.test',email_confirmed_at:'2026-10-09'};
 const authUsers=structuredClone(options.authUsers || [{id:target,email:'team@example.test'},{id:master,email:'master@example.test'}]);
 const caller={auth:{getUser:async()=>({data:{user},error:options.invalid?{}:null}),signInWithPassword:async values=>{calls.push(['password-check',values.email]);return options.passwordError?{error:{code:options.passwordCode}}:{data:{user:options.verifierUser || user,session:{}}};},signOut:async()=>{calls.push(['cleanup']);return {error:options.cleanupError?{}:null};}},rpc:async(name)=>{
  calls.push([name==='platform_operator_identity'?'identity':'context']);
  if(name==='platform_operator_identity') {const result=options.identityRpc?options.identityRpc():{data:options.identity || {auth_user_id:user?.id,role:options.role || 'master_admin',session_id:master},error:options.identityError?{}:null};if(result.data)result.data={session_id:master,password_verification_safe:options.continuityApproved!==false,...result.data};return result;}
  return {data:options.context || {kind:'pending',auth_user_id:user?.id,email:user?.email,session_id:master}};
 }};
 const admin={auth:{admin:{
  getUserById:async id=>({data:{user:authUsers.find(u=>u.id===id)},error:options.lookupError?{status:500}:authUsers.some(u=>u.id===id)?null:{status:404}}),
  inviteUserByEmail:async(value,settings)=>{calls.push(['invite',value,settings]);return options.inviteError?{error:{}}:{data:{user:{id:target,email:value,user_metadata:options.unrelatedInvite?{}:settings.data}}};},
  updateUserById:async(id,values)=>{calls.push(['auth-update',id,values]);if(!options.authError)Object.assign(authUsers.find(u=>u.id===id),values);return {data:{user:{id}},error:options.authError?{}:null};},
  deleteUser:async id=>{calls.push(['auth-delete',id]);if(!options.authError)authUsers.splice(authUsers.findIndex(u=>u.id===id),1);return {error:options.authError?{}:null};},
 },resetPasswordForEmail:async(value,settings)=>{calls.push(['recover',value,settings]);return {error:options.inviteError?{}:null};}},from:()=>{let value;const q={select(){return q;},eq(k,v){value=v;return q;},limit(){return Promise.resolve(options.rowError?{data:null,error:{}}:{data:rows.filter(r=>r.id===value)});}};return q;},rpc:async(name,args)=>{
  calls.push(['rpc',name,args.p_action || args.p_step]);
  if(name==='platform_team_resend_command'){
   let op=ops.get(args.p_request),fresh=!op;
   if(!op){op={stage:options.existingStage || 'reserved',new_operation:!options.existingStage};ops.set(args.p_request,op);}
   if(args.p_step==='dispatch')op.stage='provider_dispatched';if(args.p_step==='finish')op.stage='completed';if(args.p_step==='mark_review')op.stage='review_required';
   return {data:{...op,new_operation:fresh&&!options.existingStage}};
  }
  if((options.commandError && [args.p_action,name].includes(options.commandError)) || (options.passwordStepError && options.passwordStepError===args.p_step))return {error:{message:options.commandMessage || 'PRIVATE PROVIDER DETAIL',code:options.commandCode}};
  if(name==='platform_team_password_step')return {data:{success:true,stage:options.saved?'password_saved':args.p_step==='saved'?'password_saved':'password_setting'}};
  if(name==='platform_accept_invite')return options.acceptError?{error:{}}:{data:{success:true,stage:'completed'}};
  if(args.p_action==='begin_create' && !ops.has(args.p_request))rows.push({id:args.p_target,auth_user_id:null,...args.p_data,status:'Pending'});
  const row=rows.find(r=>r.id===args.p_target);let op=ops.get(args.p_request),fresh=!op;
  if(op && (op.actor_id!==args.p_actor || op.target_id!==args.p_target))return {error:{code:'P0001',message:'Conflicting operation identity'}};
  if(!row && args.p_action!=='begin_create')return op?.action==='delete' && op.stage==='completed' && ['begin_delete','finish_delete','reconcile_delete'].includes(args.p_action)?{data:{...op,new_operation:false}}:{error:{code:'P0001',message:'Unique live team account required'}};
  if(!op && [...ops.values()].some(o=>o.target_id===args.p_target && !['completed','cancelled'].includes(o.stage)))return {error:{code:'P0001',message:'Outstanding operation requires reconciliation'}};
  if(!op && !args.p_action.startsWith('begin_') && args.p_action!=='deactivate')return {error:{code:'P0001',message:'No incomplete operation'}};
  if(!op){op={request_id:args.p_request,actor_id:args.p_actor,target_id:args.p_target,action:args.p_action.replace(/^begin_/,''),stage:options.existingStage || 'reserved',new_operation:options.existingStage?false:true,requested:{...args.p_data,invite_nonce:'a'.repeat(64)}};ops.set(args.p_request,op);}
  else op.new_operation=false;
  if(args.p_action==='deactivate')row.status='Inactive';
  if(args.p_action==='finish_deactivate')op.stage='completed';
  if(args.p_action==='finish_reactivate'){row.status=row.suspended_from;op.stage='completed';}
  if(args.p_action==='dispatch_provider')op.stage='provider_dispatched';
  if(args.p_action==='begin_delete')row.status='Inactive';
  if(args.p_action==='dispatch_delete')op.stage='auth_delete_dispatched';
  if(args.p_action==='mark_review')op.stage='review_required';
  if(['finish_delete','reconcile_delete'].includes(args.p_action)){
   if(authUsers.some(u=>u.id===row?.auth_user_id))return {error:{}};
   if(row){archives.push(row);rows.splice(rows.indexOf(row),1);}op.stage='completed';
  }
  if(['finish_create','finish_edit'].includes(args.p_action))op.stage='completed';
  audit.push({actor_id:args.p_actor,operation_id:args.p_request,target_id:args.p_target,action:args.p_action});
  return {data:{...op,new_operation:fresh&&!options.existingStage}};
 }};
 const secrets={SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',PLATFORM_TEAM_SITE_URL:options.site || 'https://platform.example.test'};
 const ctx={URL,URLSearchParams,Request,Response,TextEncoder,atob,crypto:webcrypto,Date,createClient(){throw Error('Inject factory');},Deno:{env:{get:key=>secrets[key]}},fetch(){throw Error('No real network permitted');}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/platform-team-v2.ts').replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'}),ctx);
 const factory=(_url,key)=>{calls.push(['client',key]);return key==='fixture-anon'?caller:admin;};
 const transport=async(url,settings)=>{
  calls.push(['http',url]);
  if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:user.id}),{status:options.saveError?422:200});
  throw Error('Unexpected network target');
 };
 const invoke=async(action,body,headers={Authorization:'Bearer fixture-session'},method='POST')=>{
  let request=body;
  if(typeof body==='object'&&!options.raw){request={request_id:requestId,...(action==='delete'?{password:'FixturePassword1!',captchaToken:'fixture-captcha',acknowledged:true}:{}),...body};}
  const handler=action==='password'?ctx.passwordHandler(factory,transport):ctx.teamV2Handler(action,factory,transport);
  const result=await handler(new Request('https://local.invalid/functions/v1/'+action,{method,headers,...(method==='POST'?{body:typeof request==='string'?request:JSON.stringify(request)}:{})}));
  return {status:result.status,body:result.status===204?null:await result.json(),headers:result.headers};
 };
 return {invoke,calls,audit,rows,archives,ops,authUsers};
}
