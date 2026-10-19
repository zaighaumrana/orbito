import {activeRelease,releases,validateRelease} from './shop-release-registry.ts';
import {managedMigrationQuery,publicShopKey} from './managed-setup.ts';
import {enrollmentHandler} from '../platform-support-enrollment/handler.ts';
import {sha} from '../platform-support-tickets/protocol.ts';

// Never infer a fresh database from absent history, fill historical gaps, or
// replay bootstrap against an initialized Shop. Existing installs are additive.
export async function approvedSupportHistory(history:any[],release:any){
 if(!Array.isArray(history)||history.length<32||history.length>release.migrations.length)throw Error('history_attention');
 const ordered=[...history].sort((a,b)=>a.version.localeCompare(b.version));
 for(let i=0;i<ordered.length;i++){
  const expected=release.migrations[i],row=ordered[i];
  if(!expected||row.version!==expected.version||row.name!==expected.name||!Array.isArray(row.statements)
   || await sha(row.statements.join('\n').replaceAll('\r\n','\n'))!==expected.sha256)throw Error('history_attention');
 }
 return release.migrations.slice(history.length);
}
export async function reconcileManagedSupport(admin:any,caller:any,actorId:string,clientId:number,platformUrl:string,authorization:string,env:(key:string)=>string|undefined,fetcher:typeof fetch=fetch){
 const identity=await caller.rpc('platform_operator_identity');
 if(identity.error||identity.data?.role!=='master_admin'||identity.data.auth_user_id!==actorId||!identity.data.session_id)throw Error('Live Master required');
 const command=async(action:string,data:any={})=>{
  const result=await admin.rpc('platform_support_automation_command',{p_actor:actorId,p_session:identity.data.session_id,p_client:clientId,p_action:action,p_data:data});
  if(result.error)throw Error('Support state unavailable');return result.data;
 };
 let context=await command('context');
 if(context.state==='enabled'||context.state==='revoked'||!context.ready)return context;
 if(activeRelease.release_id!=='support-v2')return command('record',{state:'waiting',reason:'release_not_promoted'});
 const release=await validateRelease(releases['support-v2']);
 if(activeRelease.sha256!==release.sha256)throw Error('Active release fingerprint mismatch');
 if(context.release_sha256&&context.release_sha256!==release.sha256)throw Error('Pinned Support release unavailable; restore its immutable package.');
 const record=(state:string,reason:string)=>command('record',{state,reason,release_sha256:release.sha256});
 try{
  const ref=context.project_ref,management=env('PLATFORM_MANAGEMENT_TOKEN');
  if(!/^[a-z]{20}$/.test(ref)||platformUrl===`https://${ref}.supabase.co`||!management)throw Error('provider_attention');
  const api=async(path:string,body?:any)=>{
   // Revalidate current operator, pairing, owner health and no running base job
   // before EVERY provider step. No captured JWT becomes durable authority.
   const current=await command('context');
   if(!current.ready||current.request_id!==context.request_id||current.project_ref!==ref||current.source_id!==context.source_id||current.client_binding!==context.client_binding)throw Error('provider_attention');
   const response=await fetcher(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+management,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
   if(!response.ok){await response.body?.cancel();throw Error('provider_attention');}
   const text=await response.text();return text?JSON.parse(text):null;
  };
  if((await api(''))?.id!==ref)throw Error('provider_attention');
  const live=(await api('/database/query',{query:"select public.bridge_runtime_preflight()->>'owner_account' as owner_account,sc.onboarding_completed_at,sc.platform_client_id,sc.suspended,bc.source_id,bc.client_binding from public.shop_config sc cross join app_private.bridge_config bc where sc.id=1 and bc.singleton"}))?.[0];
  if(live?.owner_account!=='active'||!live.onboarding_completed_at||live.suspended!==false||live.platform_client_id!==clientId||live.source_id!==context.source_id||live.client_binding!==context.client_binding)throw Error('provider_attention');
  const history=await api('/database/query',{query:'select version,name,statements from supabase_migrations.schema_migrations order by version'});
  const missing=await approvedSupportHistory(history,release);
  await record('preparing','enrollment');
  for(const migration of missing)await api('/database/query',{query:managedMigrationQuery(migration)});
  // Only the optional function is upgraded here. Login, gateway settings on
  // existing functions, owner reservation and bridge secrets stay untouched.
  const fn=release.functions.find((f:any)=>f.name==='support-tickets');
  const form=new FormData();for(const file of fn.files)form.append('file',new Blob([file.content],{type:'application/typescript'}),file.path);
  form.append('metadata',JSON.stringify({name:fn.name,entrypoint_path:fn.entrypoint,verify_jwt:fn.verify_jwt}));
  await api('/functions/deploy?slug=support-tickets',form);
  const ready=(await api('/database/query',{query:'select public.support_ticket_installation_context() as context'}))?.[0]?.context;
  if(ready?.ready!==true||ready.installation_version!==2||ready.source_id!==context.source_id||ready.client_binding!==context.client_binding||ready.platform_client_id!==clientId)throw Error('proof_pending');
  const anon=publicShopKey(await api('/api-keys?reveal=true'),ref);
  const enrollment=enrollmentHandler(env,fetcher);
  const invoke=async(action:string,data?:any)=>{
   const response=await enrollment(new Request(platformUrl+'/functions/v1/platform-support-enrollment',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({action,client_id:clientId,request_id:context.request_id,...(data?{data}:{})})}));
   if(!response.ok)throw Error('proof_pending');return response.json();
  };
  // Existing pending credentials use the same UUID and Vault secret. There is
  // never an automatic rotation of an already enabled owner-enrolled key.
  await invoke('prepare',{project_ref:ref,source_id:context.source_id,client_binding:context.client_binding,shop_public_api_key:anon,scopes:['ticket:create','ticket:read']});
  await record('verifying','proof_pending');
  try{await invoke('verify');return command('context');}catch{/* Not installed yet, or unknown previous write. */}
  await record('installing','enrollment');
  await invoke('install'); // Shared SQL fence refuses any unknown prior dispatch.
  await record('verifying','installed');
  await invoke('verify');
  return command('context');
 }catch(error){
  const reason=error instanceof Error&&['history_attention','provider_attention','proof_pending'].includes(error.message)?error.message:'provider_attention';
  return record('attention',reason);
 }
}
