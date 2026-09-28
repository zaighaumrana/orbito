import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { pollShopBridge } from '../_shared/bridge-call.ts'
import { shopCredential, bridgeCallCredential } from '../_shared/shop-credentials.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' }
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors })
const fields = ['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','suspended']
const cfgSelect = `select source_id::text,client_binding,usage_mode,delivery_enabled,last_sequence::text,
 (has_table_privilege('service_role','public.shop_config','SELECT') and has_table_privilege('service_role','public.shop_config','UPDATE')) as config_access,
 to_regprocedure('public.bridge_apply_billing(uuid,bigint,jsonb)') is not null as billing_compatible
 from app_private.bridge_config where singleton`
class OperatorError extends Error {}
const fail = (message: string): never => { throw new OperatorError(message) }
async function jsonRequest(url: string, init: RequestInit, label: string) {
  let response: Response
  try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }) }
  catch { return fail(`${label}: connection unavailable or outcome unknown. Resume the same operation.`) }
  if (!response.ok) return fail(`${label}: request rejected (HTTP ${response.status}). Check project access and configuration.`)
  try { const text = await response.text(); return text ? JSON.parse(text) : null }
  catch { return fail(`${label}: unexpected response. Resume after checking service health.`) }
}
async function management(ref: string, route: 'database/query' | 'secrets', body: unknown) {
  const token = Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
  if (!token) return fail('One-time Platform setup required: configure PLATFORM_MANAGEMENT_TOKEN server-side.')
  return jsonRequest(`https://api.supabase.com/v1/projects/${ref}/${route}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, route === 'secrets' ? 'Shop secret provisioning' : 'Shop bridge configuration')
}
async function query(ref: string, sql: string, parameters: unknown[] = []) {
  const rows = await management(ref, 'database/query', { query: sql, parameters })
  if (!Array.isArray(rows) || rows.length !== 1) return fail('Shop bridge contract missing or operation precondition changed. Inspect the diagnostic request ID.')
  return rows[0]
}
async function readConfig(target: any) {
  // Shop management/config access still uses the existing legacy service-role credential.
  try {
    const part = target.service_role_key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')))
    if (claims.role !== 'service_role' || claims.ref !== target.project_ref) throw new Error()
  } catch { return fail('Use the target Shop legacy service-role JWT; its role and project must match.') }
  const rows = await jsonRequest(`https://${target.project_ref}.supabase.co/rest/v1/shop_config?id=eq.1&select=${fields.join(',')}`, {
    headers: { apikey: target.service_role_key, Authorization: `Bearer ${target.service_role_key}` },
  }, 'Shop credential / config access')
  if (!Array.isArray(rows) || rows.length !== 1 || !fields.every(k => typeof rows[0][k] === 'boolean')) return fail('Shop configuration is incompatible with the finished client contract.')
  return rows[0]
}
function validateConfig(cfg: any) {
  if (!cfg || !/^[0-9a-f-]{36}$/i.test(cfg.source_id) || !/^\d+$/.test(cfg.last_sequence)
    || !['legacy','bridge'].includes(cfg.usage_mode) || typeof cfg.delivery_enabled !== 'boolean'
    || !cfg.config_access || !cfg.billing_compatible) fail('Shop bridge/config/billing contract is not ready.')
}
const hash = async (secret: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))).map(b => b.toString(16).padStart(2,'0')).join('')
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join('')

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'POST required' })
  const url = Deno.env.get('SUPABASE_URL')!
  // Scheduler authentication is independent of Supabase JWT/key rotation.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const schedulerSecret = Deno.env.get('PLATFORM_SCHEDULER_SECRET') ?? ''
  const supplied = req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? ''
  const [expectedHash,suppliedHash] = await Promise.all([hash(schedulerSecret),hash(supplied)])
  let difference = 0; for (let i=0;i<expectedHash.length;i++) difference |= expectedHash.charCodeAt(i)^suppliedHash.charCodeAt(i)
  if (schedulerSecret && supplied && !difference) {
    let task: any; try { task = await req.json() } catch { return reply(400,{ error:'Invalid scheduled request' }) }
    if (!task || Array.isArray(task) || typeof task !== 'object' || Object.keys(task).length !== 1 || task.action !== 'dispatch') return reply(400,{ error:'Only dispatch is available to the scheduler' })
    const admin = createClient(url,serviceKey,{ auth:{ persistSession:false } })
    const { data: targets,error } = await admin.rpc('platform_provision_poll_targets')
    if (error) return reply(503,{ error:'Dispatch queue unavailable' })
    const outcomes: any[] = []
    // Four bounded batches keep work within the Edge execution window.
    for (let offset=0;offset<targets.length;offset+=5) {
      await Promise.all(targets.slice(offset,offset+5).map(async (clientId: number) => {
        outcomes.push(await pollShopBridge(admin,clientId))
      }))
    }
    return reply(200,{ outcomes })
  }
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } }, auth: { persistSession: false } })
  const { data: auth, error: authError } = await caller.auth.getUser()
  if (authError || !auth.user) return reply(401, { error: 'Sign in required' })
  let body: any
  try {
    // Stream limit also bounds requests without Content-Length.
    const reader = req.body?.getReader(); if (!reader) return reply(400,{ error:'Request body required' })
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 12288) { await reader.cancel(); return reply(413,{ error:'Request too large' }) }; chunks.push(value) }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
    body = JSON.parse(new TextDecoder().decode(bytes))
    if (!Number.isSafeInteger(body.client_id) || body.client_id < 1 || !/^[0-9a-f-]{36}$/i.test(body.request_id)) throw new Error()
    if (!['provision','verify','activate','rotate','replace','provision-call','rotate-call'].includes(body.action)) throw new Error()
  } catch { return reply(400, { error: 'Invalid provisioning request' }) }
  const params: any = body.params ?? {}
  // All destination changes are explicitly authorized by the master role in this RPC.
  const { data: reservation, error: reserveError } = await caller.rpc('platform_provision_begin', {
    p_client: body.client_id, p_request: body.request_id, p_action: body.action, p_params: params,
  })
  if (reserveError) return reply(409,{ error: reserveError.code === '42501' ? 'Master administrator access required' : reserveError.message })
  if (reservation.complete) return reply(200,{ state:'complete' })
  const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{ auth:{ persistSession:false } })
  let stage = 'initializing'
  async function step(name: string, data: unknown = {}) {
    const { data: result, error } = await admin.rpc('platform_provision_step',{ p_request:body.request_id,p_step:name,p_data:data })
    if (error) return fail(`Platform ${name} step could not complete. Resume or reconcile request ${body.request_id}.`)
    return result
  }
  async function provisionCall() {
    const {data: call,error: prepareError} = await admin.rpc('platform_prepare_bridge_call',{
      p_request:body.request_id,p_candidate:randomSecret(),
    })
    if (prepareError || !call?.bridge_call_secret || !/^[a-z]{20}$/.test(call.project_ref)) fail('Bridge call credential could not be prepared; resume the same operation.')
    // Persist the uncertainty boundary before the external write. Retrying reuses
    // the same pending Vault value; scheduler skips clients with pending jobs.
    await step('checkpoint')
    await management(call.project_ref,'secrets',[{name:'PLATFORM_BRIDGE_CALL_SECRET',value:call.bridge_call_secret}])
    const {error: commitError} = await admin.rpc('platform_commit_bridge_call',{p_request:body.request_id})
    if (commitError) fail('Bridge call credential outcome needs completion; resume the same operation.')
  }
  try {
    let context = await step('context')
    if (['provision-call','rotate-call'].includes(body.action)) {
      stage = 'bridge_call_credential'
      await provisionCall()
      await step('complete')
      return reply(200,{state:'complete',request_id:body.request_id})
    }
    if (['provision','replace'].includes(body.action) && context.job.step === 'reserved') {
      stage = 'saving_credential'
      const ref = params.project_ref
      if (!/^[a-z]{20}$/.test(ref) || ref === new URL(url).hostname.split('.')[0]) fail('Choose a Shop project, not the Platform project.')
      if (typeof params.client_binding !== 'string' || params.client_binding.length < 1 || params.client_binding.length > 200 || params.client_binding !== params.client_binding.trim()) fail('Client binding is required (maximum 200 characters).')
      if (context.connection && (context.connection.project_ref !== ref || context.connection.client_binding !== params.client_binding)) fail('Existing Shop destination/binding cannot be reassigned by this workflow.')
      if (typeof body.credential !== 'string' || body.credential.length < 40 || body.credential.length > 4096) fail('Submit the Shop service-role credential once. It is never returned.')
      await readConfig({ project_ref: ref, service_role_key: body.credential })
      const discovered = await query(ref,cfgSelect); validateConfig(discovered)
      if (context.source && (discovered.source_id !== context.source.source_id || discovered.client_binding !== context.source.client_binding)) fail('Existing Shop source/binding does not match this account. Credential was not replaced.')
      if (body.action === 'provision' && (discovered.usage_mode !== 'legacy' || discovered.delivery_enabled || (discovered.client_binding && discovered.client_binding !== params.client_binding))) fail('Provision only an inactive legacy Shop with the same or empty binding. Adopt existing active clients with Replace Shop Credential.')
      await step('credential',{ credential:body.credential })
      body.credential = undefined
      context = await step('context')
    }
    if (body.action === 'verify' && !context.connection) fail('Adopt this client with Replace Shop Credential before verifying its managed setup.')
    const target = await shopCredential(admin,body.client_id)
    if (!Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')) fail('One-time Platform setup required: configure PLATFORM_MANAGEMENT_TOKEN server-side, then resume.')
    stage = 'reading_contract'
    let cfg = await query(target.project_ref,cfgSelect)
    validateConfig(cfg)
    if (context.source && (cfg.source_id !== context.source.source_id || context.source.client_binding !== (target.client_binding ?? context.source.client_binding))) fail('Shop source identity/binding differs from Platform. Manual reconciliation required.')
    const binding = target.client_binding ?? context.source?.client_binding
    if (!binding) fail('Provision a client binding first.')
    const assertBound = () => { if (cfg.client_binding !== binding) fail('Shop binding differs from the provisioned account.') }
    if (body.action === 'provision') {
      stage = 'provisioning_source'
      if (cfg.usage_mode !== 'legacy' || cfg.delivery_enabled || context.source?.enabled || context.source?.usage_from_sequence != null) fail('Provision only inactive legacy Shops. For existing active clients use Replace Shop Credential, then Verify Setup.')
      if (cfg.client_binding && cfg.client_binding !== binding) fail('Shop already has a different binding. Reconcile it before provisioning.')
      const { secret } = await step('secret',{ secret:randomSecret() })
      await step('checkpoint')
      cfg = await query(target.project_ref,`update app_private.bridge_config set client_binding=$1 where singleton and source_id=$2::uuid and usage_mode='legacy' and not delivery_enabled and (client_binding is null or client_binding=$1) returning source_id::text,client_binding,usage_mode,delivery_enabled,last_sequence::text`,[binding,cfg.source_id])
      await step('bind',{ source_id:cfg.source_id,hash:await hash(secret) })
      await management(target.project_ref,'secrets',[
        { name:'PLATFORM_BRIDGE_ENDPOINT',value:`${url}/functions/v1/platform-bridge` },
        { name:'PLATFORM_BRIDGE_SOURCE_SECRET',value:secret },
      ])
      await provisionCall()
    } else if (body.action === 'activate') {
      stage = 'planning_cutover'; assertBound()
      if (!context.source || !context.currency || context.review_required) fail('Provision the source, choose currency and reconcile accounting before activation.')
      if (!context.job.plan.cutover_sequence || (cfg.usage_mode === 'legacy' && (BigInt(cfg.last_sequence)+1n).toString() !== context.job.plan.cutover_sequence)) {
        if (cfg.usage_mode !== 'legacy' || cfg.delivery_enabled) fail('Shop is already active or delivery enabled; reconcile before activation.')
        await step('plan',{ cutover_sequence:(BigInt(cfg.last_sequence)+1n).toString() })
        context = await step('context')
      }
      const boundary = context.job.plan.cutover_sequence
      if (!/^\d+$/.test(boundary)) fail('Invalid stored cutover plan; administrator reconciliation required.')
      stage = 'switching_shop_mode'
      // Compare under the Shop row lock. Concurrent event creation either precedes
      // this exact boundary or sees bridge mode. Do not release held_legacy events.
      cfg = await query(target.project_ref,`update app_private.bridge_config set usage_mode='bridge' where singleton and source_id=$1::uuid and client_binding=$2 and ((usage_mode='legacy' and not delivery_enabled and last_sequence=$3::bigint-1) or usage_mode='bridge') returning source_id::text,client_binding,usage_mode,delivery_enabled,last_sequence::text`,[cfg.source_id,binding,boundary])
      stage = 'enabling_source'
      await step('enable_source')
      stage = 'enabling_delivery'
      cfg = await query(target.project_ref,`update app_private.bridge_config set delivery_enabled=true where singleton and source_id=$1::uuid and client_binding=$2 and usage_mode='bridge' returning source_id::text,client_binding,usage_mode,delivery_enabled,last_sequence::text`,[cfg.source_id,binding])
    } else if (body.action === 'rotate') {
      stage = 'rotating_secret'; assertBound()
      if (!context.source) fail('Provision a source before rotating its secret.')
      if (context.job.plan.restore_delivery === undefined) {
        await step('rotation_plan',{ restore_delivery:cfg.delivery_enabled }); context = await step('context')
      }
      await query(target.project_ref,`update app_private.bridge_config set delivery_enabled=false where singleton and source_id=$1::uuid and client_binding=$2 returning source_id::text`,[cfg.source_id,binding])
      const { secret } = await step('secret',{ secret:randomSecret() })
      await step('rotate_hash',{ hash:await hash(secret) })
      await management(target.project_ref,'secrets',[
        { name:'PLATFORM_BRIDGE_ENDPOINT',value:`${url}/functions/v1/platform-bridge` },
        { name:'PLATFORM_BRIDGE_SOURCE_SECRET',value:secret },
      ])
      await query(target.project_ref,`update app_private.bridge_config set delivery_enabled=$3::boolean where singleton and source_id=$1::uuid and client_binding=$2 returning source_id::text`,[cfg.source_id,binding,context.job.plan.restore_delivery])
    } else if (body.action === 'verify') {
      stage = 'verifying'; assertBound()
      if (!context.source || !context.source_credential_exists) fail('Source mapping or credential hash missing. Provision Client first.')
    }
    stage = 'checking_readiness'
    const verifiedConfig = await readConfig(target)
    cfg = await query(target.project_ref,cfgSelect); validateConfig(cfg)
    // Readiness probe has no credential or accounting payload and cannot ingest events.
    const probe = await fetch(`${url}/functions/v1/platform-bridge`,{ method:'POST',signal:AbortSignal.timeout(12000),redirect:'error' })
    let probeBody: any; try { probeBody = await probe.json() } catch {}
    if (probe.status !== 401 || probeBody?.error !== 'Not authorized') fail('Platform bridge endpoint is not ready; check its deployment and JWT settings.')
    context = await step('context')
    const callReady = Boolean(await bridgeCallCredential(admin,body.client_id))
    if (body.action === 'verify' && !callReady) fail('Bridge call credential missing; provision it without recreating this client.')
    if (body.action === 'verify' && !context.projection_exists) fail('Billing projection is not ready. Confirm currency and provision the source.')
    await step('verified',{
      bridge_call_configured:callReady,shop_config:verifiedConfig,connection:'Connected',config_access:'Working (read + database grants)',bridge:context.source ? cfg.delivery_enabled && context.source.enabled ? 'Active' : 'Ready' : 'Not provisioned',
      billing_projection:context.projection_exists && cfg.billing_compatible ? 'Ready (contract only)' : 'Not verified',
      usage_mode:cfg.usage_mode,delivery_enabled:cfg.delivery_enabled,source_id:cfg.source_id,client_binding:cfg.client_binding,last_sequence:cfg.last_sequence,
    })
    await step('complete')
    return reply(200,{ state:'complete',request_id:body.request_id })
  } catch (error) {
    // Only our own fixed errors are returned. Never forward remote bodies or exception payloads.
    const message = error instanceof OperatorError ? error.message : 'Provisioning interrupted. Refresh status and resume the same operation.'
    try { await step('failure',{ error:message,stage }) } catch { /* Keep running lock for explicit administrator recovery. */ }
    return reply(503,{ error:message,request_id:body.request_id,resumable:true })
  }
})
