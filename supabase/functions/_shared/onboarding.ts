import { pollShopBridge } from './bridge-call.ts'
export class OnboardingError extends Error {}
export async function runOnboarding(admin: any, request: any, platformUrl: string) {
  const step = async (name: string, data: any = {}) => {
    const result = await admin.rpc('platform_onboarding_step', { p_request:request.request_id,p_step:name,p_data:data })
    if (result.error) throw new OnboardingError('Onboarding state could not be saved. Retry the same request or reconcile the pending job.')
    return result.data
  }
  const target = await step('prepare')
  if (target.project_ref === new URL(platformUrl).hostname.split('.')[0]) throw new OnboardingError('Shop project must differ from Platform.')
  if (request.action === 'pair-shop') {
    const secrets = [
      { name:'PLATFORM_BRIDGE_CALL_SECRET',value:target.call_secret },
      { name:'PLATFORM_BRIDGE_SOURCE_SECRET',value:target.source_secret },
      { name:'PLATFORM_BRIDGE_ENDPOINT',value:`${platformUrl}/functions/v1/platform-bridge` },
    ]
    if (target.pairing_mode === 'byo') {
      await step('paired', { connection:'Manual pairing required' })
      // Explicit download only, no state/storage/HTML/logging of this response.
      return { state:'manual_pairing_required',project_ref:target.project_ref,
        setup_file:secrets.map(s => `${s.name}=${s.value}`).join('\n')+'\n' }
    }
    const token = Deno.env.get('PLATFORM_MANAGEMENT_TOKEN')
    if (!token) throw new OnboardingError('Managed setup requires Platform Management API authorization. For client-owned projects choose BYO and install the pairing file once.')
    const response = await fetch(`https://api.supabase.com/v1/projects/${target.project_ref}/secrets`, {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' },body:JSON.stringify(secrets),
    })
    if (!response.ok) { await response.body?.cancel(); throw new OnboardingError('Secret installation rejected. Check Management API project access; client-owned Shops require BYO pairing.') }
    await response.body?.cancel()
    await step('paired', { connection:'Credentials installed; ready to provision' })
    return { state:'paired' }
  }
  const optionalInvite = request.action === 'invite-owner'
  let response: Response
  try { response = await fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`, {
    method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{ Authorization:`Bearer ${target.call_secret}`,'Content-Type':'application/json' },
    body:JSON.stringify(request.action === 'bootstrap-shop' ? { operation:'bootstrap',payload:target.payload } : optionalInvite ? { operation:'invite-owner',payload:target.payload } : { operation:'status' }),
  }) } catch {
    if (optionalInvite) return { state:'complete',invitation:'pending',message:'Invitation outcome unknown. Manual activation remains available. Wait two minutes and check the Shop Auth dashboard before another invitation.' }
    throw new OnboardingError('Shop connection unavailable. Retry the same reservation; no invitation is required.')
  }
  if (!response.ok) {
    await response.body?.cancel()
    if (response.status !== 401) {
      try {
        const status = await fetch(`https://${target.project_ref}.supabase.co/functions/v1/platform-bridge`, {
          method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
          headers:{ Authorization:`Bearer ${target.call_secret}`,'Content-Type':'application/json' },body:'{"operation":"status"}',
        })
        if (status.ok) await step('health',await status.json())
        else await status.body?.cancel()
      } catch { /* Keep the original fixed failure and retryable job. */ }
    }
    if (optionalInvite) return { state:'complete',invitation:'failed',message:'Optional invitation unavailable. Infrastructure is preserved; use manual activation or check Shop email delivery and Auth redirects.' }
    throw new OnboardingError(response.status === 401 ? 'Shop not paired: install its bridge credentials and deploy platform-bridge with gateway JWT verification disabled.' :
      'Shop reservation failed or is pending. Check pairing, migrations and owner conflicts. Retry the same request; never reset an existing Shop.')
  }
  let result: any
  try { result = await response.json() } catch {
    if (optionalInvite) return { state:'complete',invitation:'pending',message:'Optional invitation response unavailable. Manual activation remains available; check Shop Auth before another invitation.' }
    throw new OnboardingError('Shop onboarding contract is unavailable. Apply the Shop migration first.')
  }
  if (!result || !['owner_setup_pending','owner_active'].includes(result.owner_setup) || !['pending','ready'].includes(result.infrastructure)
    || !['owner_invite_not_started','owner_invite_sent','owner_invite_accepted','owner_invite_failed'].includes(result.owner_invite)
    || !['onboarding_pending','onboarding_complete'].includes(result.onboarding)) {
    if (optionalInvite) return { state:'complete',invitation:'pending',message:'Optional invitation state unavailable. Manual activation remains available; check Shop Auth before another invitation.' }
    throw new OnboardingError('Shop onboarding contract is unavailable. Apply the Shop migration first.')
  }
  const invitation = ['sent','failed','pending'].includes(result.invitation) ? result.invitation : 'already_provisioned'
  if (request.action === 'bootstrap-shop') {
    await step('registered', result)
    const projection = await pollShopBridge(admin,request.client_id)
    if (!projection.ok) throw new OnboardingError('Owner is reserved, but initial billing/config projection is pending. Retry provisioning; the owner will not be duplicated.')
  }
  await step('health', result)
  return { state:'complete',infrastructure:result.infrastructure,owner_setup:result.owner_setup,owner_invite:result.owner_invite,onboarding:result.onboarding,
    ...(optionalInvite ? {invitation,message:invitation === 'sent' ? 'Optional invitation sent; inbox delivery is not confirmed.' : invitation === 'pending' ? 'Invitation outcome pending. Wait two minutes and check Shop Auth before retrying. Manual activation remains available.' : invitation === 'failed' ? 'Optional invitation unavailable. Manual activation remains available.' : 'Owner account already provisioned. No invitation was sent.'} : {}) }
}
