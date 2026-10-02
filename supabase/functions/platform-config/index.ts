import { bridgeCallCredential } from '../_shared/shop-credentials.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
const fields = ['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended']
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors })
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'POST required' })
  const authorization = req.headers.get('authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: auth, error: authError } = await caller.auth.getUser()
  if (authError || !auth.user) return reply(401, { error: 'Sign in required' })
  let body: any
  try {
    const text = await req.text()
    if (text.length > 8192) return reply(413, { error: 'Request too large' })
    body = JSON.parse(text)
  } catch { return reply(400, { error: 'Invalid request' }) }
  const { error: accessError } = await caller.rpc('platform_client_operations', { p_client: body.client_id })
  if (accessError) return reply(403, { error: 'Operator not authorized', definite_failure: true })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let recovery: any
  if (body.action === 'recover') {
    const reserved=await caller.rpc('platform_config_recovery',{p_client:body.client_id,p_request:body.request_id,p_action:body.recovery_action,p_reason:body.reason})
    if(reserved.error)return reply(409,{error:reserved.error.message})
    recovery=reserved.data
    if(recovery.complete)return reply(200,recovery)
  }
  let target: any
  try { target = await bridgeCallCredential(admin, body.client_id); if (!target) throw new Error('Bridge call credential missing') }
  catch (error) {
    if(recovery)await admin.rpc('platform_config_recovery_finish',{p_request:body.request_id,p_recovery:recovery.recovery_id,p_state:null,p_result:null})
    return reply(503, { error: (error as Error).message, definite_failure: true })
  }
  if(recovery){
    let state: string|null=null,result: any=null
    try {
      const bridge=async(operation: string)=>fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${target.bridge_call_secret}`,'Content-Type':'application/json'},body:JSON.stringify(operation==='config-read'?{operation}:{operation,request_id:body.request_id,changes:recovery.changes})})
      const read=await bridge('config-read')
      if(!read.ok){await read.body?.cancel();throw new Error()}
      const observed=(await read.json()).config
      if(!observed || !fields.every(k=>typeof observed[k]==='boolean'))throw new Error()
      result=Object.fromEntries(fields.map(k=>[k,observed[k]]))
      const matches=Object.entries(recovery.changes).every(([k,v])=>observed[k]===v)
      if(body.recovery_action!=='read' && matches)state='applied'
      else if(body.recovery_action==='retry'){
        // Replay EXACT original identity/payload, using Shop's durable config journal.
        const written=await bridge('config-write')
        if(written.ok){const config=(await written.json()).config;if(config && fields.every(k=>typeof config[k]==='boolean') && Object.entries(recovery.changes).every(([k,v])=>config[k]===v)){result=Object.fromEntries(fields.map(k=>[k,config[k]]));state='applied'}}
        else {await written.body?.cancel();if(written.status>=400 && written.status<500)state='failed'}
        state ||= 'uncertain'
      }
    }catch{ /* Read/retry failure never proves the prior remote write failed. */ }
    const finished=await admin.rpc('platform_config_recovery_finish',{p_request:body.request_id,p_recovery:recovery.recovery_id,p_state:state,p_result:result})
    if(finished.error)return reply(503,{error:'Recovery outcome unavailable; refresh server status before retrying.'})
    return reply(result?200:503,{state:state || 'unresolved',config:result,...(!result?{error:'Shop read-back unavailable; the original operation remains unresolved.'}:{})})
  }
  if (body.action === 'read') {
    const { error: readAuthError } = await caller.rpc('platform_client_operations', { p_client: body.client_id })
    if (readAuthError) return reply(403, { error: 'Operator not authorized', definite_failure: true })
    try {
      const response = await fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { Authorization: `Bearer ${target.bridge_call_secret}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ operation:'config-read' }),
      })
      if (!response.ok) throw new Error('Read failed')
      const rows = [(await response.json()).config]
      if (rows.length !== 1 || !fields.every(k => typeof rows[0][k] === 'boolean')) throw new Error('Config incomplete')
      return reply(200, { config: Object.fromEntries(fields.map(k => [k,rows[0][k]])) })
    } catch { return reply(503, { error: 'Shop configuration could not be read' }) }
  }
  const { data: job, error } = await caller.rpc('platform_begin_config', {
    p_client: body.client_id, p_request: body.request_id, p_changes: body.changes,
  })
  if (error) return reply(403, { error: error.message, definite_failure: true })
  if (!job.dispatch) return reply(job.state === 'applied' ? 200 : 409, { state: job.state, definite_failure: job.state === 'failed', error: job.state === 'applied' ? undefined : 'Existing operation needs completion or reconciliation' })
  let state = 'uncertain', result: any = null
  try {
    const response = await fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${target.bridge_call_secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation:'config-write',request_id:job.request_id,changes:job.changes }),
    })
    if (response.ok) {
      const rows = [(await response.json()).config]
      if (rows.length === 1 && fields.every(k => typeof rows[0][k] === 'boolean') && Object.entries(job.changes).every(([k,v]) => rows[0][k] === v)) {
        result = Object.fromEntries(fields.map(k => [k, rows[0][k]])); state = 'applied'
      }
    } else if (response.status >= 400 && response.status < 500) state = 'failed'
  } catch { /* timeout may have committed: keep lock pending reconciliation */ }
  const { error: finishError } = await admin.rpc('platform_finish_config', { p_request: job.request_id, p_state: state, p_result: result })
  if (finishError || state !== 'applied') return reply(503, { error: state === 'failed' && !finishError ? 'Shop rejected the configuration; correct provisioning and retry' : 'Configuration outcome requires reconciliation; inspect Client Detail', definite_failure: state === 'failed' && !finishError })
  return reply(200, { state, config: result })
})
