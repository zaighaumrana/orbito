// Shop v1 transport: the per-source bearer is NOT a Supabase user JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
const reply = (status: number, body: unknown) => Response.json(body, { status })
Deno.serve(async req => {
  if (req.method !== 'POST') return reply(405, { error: 'POST required' })
  const secret = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!secret || secret.length < 32 || secret.length > 512) return reply(401, { error: 'Not authorized' })
  try {
    // Stream cap, including requests without a Content-Length header.
    const reader = req.body?.getReader()
    if (!reader) return reply(400, { error: 'Body required' })
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 512 * 1024) { await reader.cancel(); return reply(413, { error: 'Batch too large' }) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const envelope = JSON.parse(new TextDecoder().decode(bytes))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.rpc('platform_ingest', { p_secret_hash: hash, p_envelope: envelope })
    if (error) return reply(error.code === '42501' ? 401 : 400, { error: 'Bridge request rejected' })
    return reply(200, data)
  } catch { return reply(400, { error: 'Invalid or incomplete bridge request' }) }
})
