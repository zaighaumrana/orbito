// Server-only resolver. Vault wins; legacy JSON remains a compatibility fallback.
export async function shopCredential(admin: any, clientId: number) {
  const { data, error } = await admin.rpc('platform_shop_credential', { p_client: clientId })
  if (error) throw new Error('Credential storage unavailable; apply the provisioning migration first')
  let value = data
  if (!value) {
    try { value = JSON.parse(Deno.env.get('PLATFORM_SHOP_CREDENTIALS') ?? '{}')[String(clientId)] } catch { /* Never reflect secret configuration. */ }
  }
  if (!value || !/^[a-z]{20}$/.test(value.project_ref) || typeof value.service_role_key !== 'string') throw new Error('Shop server credential not provisioned')
  return value
}
