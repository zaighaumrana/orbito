import { legacyPublicAnonKey } from './public-api-key.ts'
export class SupportAccessError extends Error {}
const SUPPORT_NAMES = ['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL']

function platformProjectRef(url: string) {
 const ref=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url)?.[1]
 if(!ref)throw new SupportAccessError('Platform project identity invalid. Check the server SUPABASE_URL.')
 return ref
}

async function platformPublicAnon(ref: string) {
 const token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
 if(!token)throw new SupportAccessError('Platform public anon JWT unavailable. Configure PLATFORM_MANAGEMENT_TOKEN on Platform server.')
 async function read(route: string) {
  let response: Response
  try {response=await fetch(`https://api.supabase.com/v1/projects/${ref}${route}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`}})}
  catch {throw new SupportAccessError('Platform public anon JWT unavailable. Retry the server key lookup.')}
  if(!response.ok){await response.body?.cancel();throw new SupportAccessError('Platform public anon JWT unavailable. Check Management token access to Platform API keys.')}
  try {return await response.json()} catch {throw new SupportAccessError('Platform public anon JWT unavailable. Management API returned an invalid key response.')}
 }
 // The API-key list alone does not attest whether legacy keys are enabled.
 if((await read('/api-keys/legacy'))?.enabled!==true)throw new SupportAccessError('Platform public anon JWT unavailable. Enable legacy API keys in Platform settings.')
 const anon=legacyPublicAnonKey(await read('/api-keys?reveal=true'),ref)
 if(!anon)throw new SupportAccessError('Platform public anon JWT unavailable. An active legacy anon JWT matching the Platform project is required; publishable and privileged keys are not compatible.')
 return anon
}

export async function supportAuthSecrets(caller: any,userId: string) {
 let verified: any
 try {verified=await caller.rpc('platform_operator_identity')} catch {throw new SupportAccessError('Master identity unavailable. Verify the signed-in master administrator.')}
 const identity=verified?.data
 if(verified?.error || identity?.auth_user_id!==userId || identity?.role!=='master_admin')throw new SupportAccessError('Master identity unavailable. Verified master administrator required for support configuration.')
 const email=typeof identity.email==='string'?identity.email.trim().toLowerCase():''
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new SupportAccessError('Master identity unavailable. The canonical master Auth email is required.')
 const url=Deno.env.get('SUPABASE_URL') || '',ref=platformProjectRef(url)
 const anon=await platformPublicAnon(ref)
 return SUPPORT_NAMES.map((name,index)=>({name,value:[url,anon,email][index]}))
}

export async function configureSupportAuth(api: any,caller: any,userId: string) {
 const secrets=await supportAuthSecrets(caller,userId)
 await api('/secrets','POST',secrets)
 const installed=await api('/secrets')
 if(!Array.isArray(installed) || !SUPPORT_NAMES.every(name=>installed.some(entry=>entry.name===name)))throw new SupportAccessError('Support access configuration could not be verified. Retry this repair.')
 return {support_auth_configured:true}
}

export async function repairSupportAccess(admin: any,caller: any,userId: string,request: any,_platformUrl: string) {
 const platformRef=platformProjectRef(Deno.env.get('SUPABASE_URL') || '')
 const {data:target,error}=await caller.rpc('platform_support_access_target',{p_client:request.client_id,p_request:request.request_id})
 if(error || !target || !/^[a-z]{20}$/.test(target.project_ref) || target.project_ref===platformRef)throw new SupportAccessError('An existing managed Shop with active infrastructure and immutable pairing is required.')
 const token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
 if(!token)throw new SupportAccessError('Platform public anon JWT unavailable. Configure PLATFORM_MANAGEMENT_TOKEN on Platform server before support repair.')
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
