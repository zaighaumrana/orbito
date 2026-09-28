import { bridgeCallCredential } from './shop-credentials.ts'
// Only fixed diagnostics leave this module; never return remote bodies or headers.
export async function pollShopBridge(admin: any, clientId: number) {
  let code = 'credential_lookup_failed', httpStatus: number | null = null
  try {
    const target = await bridgeCallCredential(admin,clientId)
    if (!target) code = 'missing_bridge_call_credential'
    else {
      code = 'network_or_timeout'
      const response = await fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{ Authorization:`Bearer ${target.bridge_call_secret}`,'Content-Type':'application/json' },body:'{}',
      })
      httpStatus = response.status
      if (!response.ok) { code = 'shop_http_error'; await response.body?.cancel() }
      else {
        code = 'invalid_shop_response'
        const reader = response.body?.getReader(); if (!reader) throw new Error()
        let text = '', size = 0; const decoder = new TextDecoder()
        for (;;) {
          const {value,done} = await reader.read(); if (done) break
          size += value.length; if (size > 16384) { await reader.cancel(); throw new Error() }
          text += decoder.decode(value,{stream:true})
        }
        const result = JSON.parse(text+decoder.decode())
        if (result?.enabled === false) code = 'shop_delivery_disabled'
        else if (result?.enabled === true && Number.isSafeInteger(result.acknowledged) && result.acknowledged >= 0) code = 'ok'
      }
    }
  } catch { /* Keep the stage-specific fixed code; never serialize an exception. */ }
  let diagnosticSaved = false
  try {
    const {error} = await admin.rpc('platform_bridge_call_health',{p_client:clientId,p_code:code,p_http_status:httpStatus})
    diagnosticSaved = !error
  } catch { /* Poll outcome remains available even when health persistence fails. */ }
  return {client_id:clientId,ok:code==='ok',code,http_status:httpStatus,diagnostic_saved:diagnosticSaved}
}
