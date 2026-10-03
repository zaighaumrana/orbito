export class SupportAccessError extends Error {}
const SUPPORT_NAMES = ['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL']

export async function supportAuthSecrets(caller: any,userId: string) {
 const {data:identity,error}=await caller.rpc('platform_operator_identity')
 if(error || identity?.auth_user_id!==userId || identity?.role!=='master_admin')throw new SupportAccessError('Verified master administrator required for support configuration.')
 const email=identity.email?.trim().toLowerCase(),url=Deno.env.get('SUPABASE_URL') || '',anon=Deno.env.get('SUPABASE_ANON_KEY') || ''
 let valid=false
 try {
  const target=new URL(url),claims=JSON.parse(atob(anon.split('.')[1].replaceAll('-','+').replaceAll('_','/')))
  valid=/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url) && claims.role==='anon' && claims.ref===target.hostname.split('.')[0]
 } catch {}
 if(!valid || typeof email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new SupportAccessError('Canonical Platform support authentication configuration is unavailable.')
 return SUPPORT_NAMES.map((name,index)=>({name,value:[url,anon,email][index]}))
}

export async function configureSupportAuth(api: any,caller: any,userId: string) {
 const secrets=await supportAuthSecrets(caller,userId)
 await api('/secrets','POST',secrets)
 const installed=await api('/secrets')
 if(!Array.isArray(installed) || !SUPPORT_NAMES.every(name=>installed.some(entry=>entry.name===name)))throw new SupportAccessError('Support access configuration could not be verified. Retry this repair.')
 return {support_auth_configured:true}
}

export async function repairSupportAccess(admin: any,caller: any,userId: string,request: any,platformUrl: string) {
 const {data:target,error}=await caller.rpc('platform_support_access_target',{p_client:request.client_id,p_request:request.request_id})
 if(error || !target || !/^[a-z]{20}$/.test(target.project_ref) || target.project_ref===new URL(platformUrl).hostname.split('.')[0])throw new SupportAccessError('An existing managed Shop with active infrastructure and immutable pairing is required.')
 const token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
 if(!token)throw new SupportAccessError('Configure PLATFORM_MANAGEMENT_TOKEN on Platform server before support repair.')
 async function api(route: string,method='GET',body?: any) {
  let response: Response
  try {response=await fetch(`https://api.supabase.com/v1/projects/${target.project_ref}${route}`,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})}
  catch {throw new SupportAccessError('Support repair outcome unknown. Retry the same repair; provisioning is unchanged.')}
  if(!response.ok){await response.body?.cancel();throw new SupportAccessError('Support repair rejected by Management API. Check project access.')}
  try {const text=await response.text();return text?JSON.parse(text):null} catch {throw new SupportAccessError('Support repair response unavailable.')}
 }
 try {
  const project=await api('')
  if(project?.id!==target.project_ref)throw new SupportAccessError('Managed Shop project identity mismatch.')
  const rows=await api('/database/query','POST',{query:"select sc.onboarding_version,sc.platform_client_id,bc.client_binding,b.payload->>'request_id' as owner_request from public.shop_config sc cross join app_private.bridge_config bc left join app_private.owner_bootstrap b on b.singleton where sc.id=1 and bc.singleton"})
  const current=rows?.[0]
  if(rows?.length!==1 || current?.onboarding_version!==2 || current.platform_client_id!==request.client_id || current.client_binding!==target.client_binding || current.owner_request!==target.owner_request)throw new SupportAccessError('Managed Shop ownership differs from the recorded pairing. Repair was not applied.')
  await configureSupportAuth(api,caller,userId)
  const saved=await admin.rpc('platform_support_access_finish',{p_client:request.client_id,p_request:request.request_id,p_configured:true})
  if(saved.error)throw new SupportAccessError('Support repair result could not be recorded. Retry the same repair.')
  return {state:'complete',request_id:request.request_id,support_auth_configured:true}
 } catch(error) {
  try {await admin.rpc('platform_support_access_finish',{p_client:request.client_id,p_request:request.request_id,p_configured:false})} catch {}
  if(error instanceof SupportAccessError)throw error
  throw new SupportAccessError('Support repair unavailable. Provisioning is unchanged.')
 }
}
