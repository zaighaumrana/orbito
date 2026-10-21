import { pb } from './supabase.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const flights = new Map();
// Config intent lives on the server. localStorage remains only for the separate
// payment protocol, where its existing retry semantics must remain unchanged.
export function serverConfigOperation(clientId,payload,readStatus,send,current=()=>true){
  const key=`server-config:${clientId}`;
  const changes={...payload},signature=JSON.stringify(changes,Object.keys(changes).sort());
  const active=flights.get(key);
  if(active){
    if(active.signature===signature && active.current() && current())return active.promise;
    return Promise.reject(Error('Another configuration request is in progress. Wait for completion, then refresh server status before retrying.'));
  }
  const operation={signature,current};
  const work=(async()=>{
    const status=await readStatus();
    localStorage.removeItem(`orbito-operation:config:${clientId}`);
    if(status.config_jobs?.length)throw Error('A server operation is unresolved. Open Client Detail and recover its recorded request.');
    return send(crypto.randomUUID(),changes);
  })().finally(()=>{if(flights.get(key)===operation)flights.delete(key);});
  operation.promise=work;flights.set(key,operation);return work;
}
export function retryOperation(key, payload, send, {retainOnFailure=false}={}) {
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
      if (error.definiteFailure && !retainOnFailure) localStorage.removeItem(storageKey);
      throw error;
    }
  })().finally(() => flights.delete(key));
  flights.set(key, work); return work;
}
// Clear only the exact original operation that an authorized read reconciled.
export function settleRetryOperation(key,requestId) {
  const storageKey=`orbito-operation:${key}`,saved=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(saved?.requestId===requestId)localStorage.removeItem(storageKey);
}
export async function rpc(name, args) {
  const { data, error } = await pb.rpc(name, args);
  if (error) {
    const failure = new Error(error.message);
    failure.code=error.code;
    failure.definiteFailure = /^[0-9A-Z]{5}$/.test(error.code || '') && !String(error.code).startsWith('08');
    throw failure;
  }
  return data;
}
export function recordPayment(data) {
  const payload = { p_invoice: Number(data.invoice_id), p_amount: Number(data.amount), p_method: data.payment_method, p_date: data.payment_date, p_notes: data.notes || '' };
  return retryOperation(`payment:${payload.p_invoice}`, payload, request => rpc('platform_record_payment', { ...payload, p_request: request }));
}
