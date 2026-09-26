import { createClient } from '@supabase/supabase-js';
import { pState, setPCFG } from './state.js';
import { retryOperation } from './operations.js';
export const pb = createClient(import.meta.env.VITE_PLATFORM_URL, import.meta.env.VITE_PLATFORM_ANON);
export const PLATFORM_AUTH_EMAIL = import.meta.env.VITE_PLATFORM_AUTH_EMAIL;
export async function loadConfig() {
  const { data, error } = await pb.from('platform_config').select('id,admin_username').single();
  if (error) throw error;
  if (data) setPCFG(data);
}
// Paginate historical ledgers instead of silently accepting the default 1000 rows.
async function allRows(table, order, select = '*') {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await pb.from(table).select(select).order(order, { ascending: false }).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data); if (data.length < 1000) return rows;
  }
}
export async function loadPlatform() {
  const [clients,support,usage,invoices,rateLog,payments,credits,platformUsers,summary] = await Promise.all([
    allRows('clients','id'), allRows('support_tickets','id'),
    allRows('usage_logs','id'), allRows('billing_cycles','id'), allRows('pricing_rate_log','id'),
    allRows('payments','id'), allRows('client_credit','id'),
    allRows('platform_users','id','id,auth_user_id,name,email,role,status,created_at'),
    pb.rpc('platform_usage_summary'),
  ]);
  if (summary.error) throw summary.error;
  Object.assign(pState.data, { clients,support,usage,invoices,rateLog,payments,credits,platformUsers,usageSummary: summary.data });
  if (pState.selectedClient) pState.selectedClient = clients.find(c => c.id === pState.selectedClient.id) || null;
}
export async function loadClientData(client) {
  pState.selectedClient = client;
  const { data, error } = await pb.rpc('platform_client_operations', { p_client: client.id });
  pState.clientData = { config: client, operations: data, _error: error?.message };
}
export async function updateClientConfig(client, updates) {
  await retryOperation(`config:${client.id}`, updates, async requestId => {
    const { data, error } = await pb.functions.invoke('platform-config', { body: { client_id: client.id, request_id: requestId, changes: updates } });
    if (error || data?.state !== 'applied') {
      let body = data;
      try { if (error?.context) body = await error.context.clone().json(); } catch {}
      const failure = new Error(body?.error || error?.message || 'Config synchronization incomplete');
      failure.definiteFailure = body?.definite_failure === true;
      throw failure;
    }
    return data;
  });
  return true;
}
