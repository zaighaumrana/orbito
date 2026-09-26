import { pb } from './supabase.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const flights = new Map();
export function retryOperation(key, payload, send) {
  if (flights.has(key)) return flights.get(key);
  const work = (async () => {
    const storageKey = `orbito-operation:${key}`;
    let saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && JSON.stringify(saved.payload) !== JSON.stringify(payload)) throw new Error('A previous request is unresolved. Retry its original values before changing them.');
    if (!saved) { saved = { requestId: crypto.randomUUID(), payload }; localStorage.setItem(storageKey, JSON.stringify(saved)); }
    try {
      const result = await send(saved.requestId);
      localStorage.removeItem(storageKey); return result;
    } catch (error) {
      if (error.definiteFailure) localStorage.removeItem(storageKey);
      throw error;
    }
  })().finally(() => flights.delete(key));
  flights.set(key, work); return work;
}
export async function rpc(name, args) {
  const { data, error } = await pb.rpc(name, args);
  if (error) {
    const failure = new Error(error.message);
    failure.definiteFailure = /^[0-9A-Z]{5}$/.test(error.code || '') && !String(error.code).startsWith('08');
    throw failure;
  }
  return data;
}
export function recordPayment(data) {
  const payload = { p_invoice: Number(data.invoice_id), p_amount: Number(data.amount), p_method: data.payment_method, p_date: data.payment_date, p_notes: data.notes || '' };
  return retryOperation(`payment:${payload.p_invoice}`, payload, request => rpc('platform_record_payment', { ...payload, p_request: request }));
}
