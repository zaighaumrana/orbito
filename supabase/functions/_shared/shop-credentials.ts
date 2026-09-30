// Invocation credentials deliberately have NO service-role or source-secret fallback.
export async function bridgeCallCredential(admin: any, clientId: number) {
  const { data, error } = await admin.rpc('platform_bridge_call_credential', { p_client: clientId })
  if (error) throw new Error('Bridge call credential lookup failed')
  if (!data?.bridge_call_secret) return null
  if (!/^[a-z]{20}$/.test(data.project_ref) || typeof data.bridge_call_secret !== 'string'
    || data.bridge_call_secret.length < 32 || /\s/.test(data.bridge_call_secret)) throw new Error('Invalid bridge call credential record')
  return { project_ref: data.project_ref, bridge_call_secret: data.bridge_call_secret }
}
