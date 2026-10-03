import release from './shop-release.json' with { type: 'json' }
import { runOnboarding } from './onboarding.ts'
import { configureSupportAuth } from './support-auth.ts'
export class ManagedSetupError extends Error {}
const literal=(s: string)=>"'"+s.replaceAll("'","''")+"'"
const secretFingerprint=async(value: string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('')
export function managedMigrationQuery(migration: any){
 const sql=migration.sql.replace(/^\s*(begin|commit);\s*$/gmi,'')
 return `begin; set local statement_timeout='25s'; select pg_advisory_xact_lock(71390461); create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text); do $install$ begin if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(migration.version)}) then execute ${literal(sql)}; insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(migration.version)},${literal(migration.name)},array[${literal(migration.sql)}]); end if; end $install$; commit;`
}
export async function managedPublicEnvironment(admin: any,clientId: number,platformUrl: string){
 const c=await admin.from('clients').select('supabase_url,pairing_mode,turnstile_site_key,lifecycle_state,infrastructure_state').eq('id',clientId).single()
 const ref=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(c.data?.supabase_url || '')?.[1]
 const token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
 if(c.error || !ref || ref===new URL(platformUrl).hostname.split('.')[0] || c.data.pairing_mode!=='managed' || !token || c.data.lifecycle_state==='Archived' || ['destroyed','decommissioned'].includes(c.data.infrastructure_state))throw new ManagedSetupError('Managed public configuration is unavailable for this target.')
 let response: Response;try{response=await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`}})}catch{throw new ManagedSetupError('Public configuration lookup unavailable.')}
 if(!response.ok){await response.body?.cancel();throw new ManagedSetupError('Public configuration lookup rejected.')}
 const anon=publicShopKey(await response.json())
 return {VITE_SUPABASE_URL:c.data.supabase_url,VITE_SUPABASE_ANON:anon,VITE_TURNSTILE_SITE_KEY:c.data.turnstile_site_key || ''}
}
export function publicShopKey(keys: any[]) {
  const legacy=keys.find(k=>k.name==='anon' && typeof k.api_key==='string')
  if (!legacy) throw new ManagedSetupError('The existing Shop gateway contract requires its public anon JWT. Enable the legacy public key in Shop settings; no service key is accepted.')
  try { const claims=JSON.parse(atob(legacy.api_key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(claims.role!=='anon')throw new Error() } catch { throw new ManagedSetupError('Public Shop key is not an anon JWT.') }
  return legacy.api_key
}
export async function runManagedSetup(admin: any,request: any,platformUrl: string,secret?: string,caller?: any,userId?: string) {
 const token=Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
 if(!token)throw new ManagedSetupError('Configure PLATFORM_MANAGEMENT_TOKEN on Platform server before managed setup.')
 const client=await admin.from('clients').select('supabase_url,pairing_mode,onboarding_version,lifecycle_state,infrastructure_state').eq('id',request.client_id).single()
 const ref=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.data?.supabase_url || '')?.[1]
 if(client.error || !ref || ref===new URL(platformUrl).hostname.split('.')[0] || client.data.pairing_mode!=='managed' || client.data.onboarding_version!==2 || client.data.lifecycle_state==='Archived' || ['destroyed','decommissioned'].includes(client.data.infrastructure_state))throw new ManagedSetupError('Exact managed Shop destination required; Platform and retired projects are rejected.')
 async function api(route: string,method='GET',body?: any,headers: Record<string,string>={}){
  let response: Response
  try{response=await fetch(`https://api.supabase.com/v1/projects/${ref}${route}`,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})})}
  catch{throw new ManagedSetupError('Management API outcome unknown. Recover and resume this same operation; successful stages are retained.')}
  if(!response.ok){await response.body?.cancel();throw new ManagedSetupError(`Management API rejected this stage (HTTP ${response.status}); check project permissions.`)}
  const text=await response.text();try{return text?JSON.parse(text):null}catch{throw new ManagedSetupError('Management API returned an invalid stage response.')}
 }
 async function record(name: string,state: string,checksum: string|null=null){const {data,error}=await admin.rpc('platform_managed_stage',{p_request:request.request_id,p_name:name,p_state:state,p_checksum:checksum});if(error)throw new ManagedSetupError('Stage state unavailable; refresh the recorded operation.');return data}
 async function stage(name: string,work: ()=>Promise<any>,checksum: string|null=null){
  const saved=await record(name,'running',checksum);if(saved.skip)return
  try{await work();await record(name,'passed',checksum)}catch(error){await record(name,error instanceof ManagedSetupError && /Enter the Turnstile|Unapproved target|Existing schema/.test(error.message)?'manual':'failed',checksum);throw error}
 }
 // Revalidate access every execution, even when this stage previously passed.
 const project=await api('');if(project?.id!==ref)throw new ManagedSetupError('Management API project identity mismatch.')
 await stage('project-access',async()=>{},ref)
 if(request.action==='managed-setup') {
  await stage('migrations',async()=>{
   const history=await api('/database/migrations')
   if(!Array.isArray(history) || history.some(h=>!release.migrations.some(m=>m.version===h.version)))throw new ManagedSetupError('Unapproved target migration history. Review/adopt it manually; no reset or replay is allowed.')
   const installed=new Set(history.map(h=>h.version))
   // Never infer a blank project from a missing migration record on an existing business.
   if(!installed.size){const rows=await api('/database/query','POST',{query:"select count(*)::integer as count from pg_tables where schemaname='public'"});if(rows?.[0]?.count!==0)throw new ManagedSetupError('Existing schema without approved history requires manual adoption.')}
   for(const migration of release.migrations) await stage('migration:'+migration.version,async()=>{
    if(installed.has(migration.version))return
    // One atomic commit includes the original CLI-compatible version. Transaction
    // advisory lock plus version read-back recovers a timeout-after-commit safely.
    await api('/database/query','POST',{query:managedMigrationQuery(migration)})
   },migration.sha256)
  },release.stage_checksums.migrations)
 }
 let current: any
 if(request.action==='managed-setup'){
  // Approved migrations leave a fresh Shop at version 0. Only canonical owner
  // bootstrap advances it to V2; validate before preparing pairing or writing secrets.
  const rows=await api('/database/query','POST',{query:"select sc.onboarding_version,sc.platform_client_id,bc.client_binding,b.payload->>'request_id' as owner_request,exists(select 1 from public.app_users where role='Business Owner') as has_owner from public.shop_config sc cross join app_private.bridge_config bc left join app_private.owner_bootstrap b on b.singleton where sc.id=1 and bc.singleton"})
  current=rows?.[0]
  const fresh=current?.onboarding_version===0 && current.platform_client_id===null && current.client_binding===null && current.owner_request===null && current.has_owner===false
  const reserved=current?.onboarding_version===2 && typeof current.client_binding==='string' && typeof current.owner_request==='string' && current.platform_client_id===request.client_id
  if(!fresh && !reserved)throw new ManagedSetupError('Target is an initialized or differently bound Shop. Manual adoption is required; its secrets were not replaced.')
 }
 const prepare=await admin.rpc('platform_onboarding_step',{p_request:request.request_id,p_step:'prepare',p_data:{}})
 if(prepare.error || prepare.data?.project_ref!==ref)throw new ManagedSetupError('Immutable Shop pairing could not be prepared.')
 const target=prepare.data
 // A V2 retry must match the immutable reservation, not just the numeric client ID.
 if(current?.onboarding_version===2 && (current.client_binding!==target.payload.client_binding || current.owner_request!==target.payload.request_id))throw new ManagedSetupError('Target is an initialized or differently bound Shop. Manual adoption is required; its secrets were not replaced.')
 if(request.action==='managed-setup')await stage('server-secrets',async()=>{
  await api('/secrets','POST',[{name:'PLATFORM_BRIDGE_CALL_SECRET',value:target.call_secret},{name:'PLATFORM_BRIDGE_SOURCE_SECRET',value:target.source_secret},{name:'PLATFORM_BRIDGE_ENDPOINT',value:platformUrl+'/functions/v1/platform-bridge'}])
 })
 // One-time secret goes directly to Shop secrets API. Never saved in RPC params,
 // stage state, public client fields, logs or the response. Retry resubmits it.
 await stage('turnstile',async()=>{
  if(!secret || secret.length>512 || /\s/.test(secret))throw new ManagedSetupError('Enter the Turnstile secret once for installation; it is not retained. Re-enter on an uncertain retry.')
  await api('/secrets','POST',[{name:'TURNSTILE_SECRET',value:secret}])
 },secret?await secretFingerprint(secret):null)
 if(request.action==='managed-setup') {
  await stage('support-auth-config',async()=>{await configureSupportAuth(api,caller,userId!)})
  await stage('functions',async()=>{for(const fn of release.functions)await stage('function:'+fn.name,async()=>{
   const form=new FormData()
   for(const file of fn.files)form.append('file',new Blob([file.content],{type:'application/typescript'}),file.path)
   form.append('metadata',JSON.stringify({name:fn.name,entrypoint_path:fn.entrypoint,verify_jwt:fn.verify_jwt}))
   await api('/functions/deploy?slug='+fn.name,'POST',form)
  },fn.stage_sha256)},release.stage_checksums.functions)
  await stage('bridge-owner',async()=>{await runOnboarding(admin,{...request,action:'bootstrap-shop'},platformUrl)})
  await stage('preflight',async()=>{
   await runOnboarding(admin,{...request,action:'onboarding-status'},platformUrl)
   const health=await admin.rpc('platform_provision_status_service',{p_client:request.client_id})
   if(health.error || health.data?.infrastructure!=='ready')throw new ManagedSetupError('Backend preflight is pending; inspect the individual runtime checks.')
  })
 }
 // Get keys only inside the server. Filter before returning; never return the API
 // array, which may contain service_role/secret keys.
 const anon=publicShopKey(await api('/api-keys?reveal=true'))
 return {state:'complete',request_id:request.request_id,public_env:{VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON:anon,VITE_TURNSTILE_SITE_KEY:request.params.site_key}}
}
