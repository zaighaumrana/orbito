import {rpc,retryOperation,settleRetryOperation} from './operations.js';
import {pState} from './state.js';
import {captureView,viewCurrent,clientDataMatches} from './async-context.js';
import {notify} from './dialogs.js';
import {render} from './render.js';

const flights=new Set();
const key=id=>`supply:${id}`;
export function pendingPaperDelivery(clientId) {
 try {
  const saved=JSON.parse(localStorage.getItem(`orbito-operation:${key(clientId)}`)||'null');
  if(!saved)return null;
  return saved.requestId&&saved.payload?.p_client===clientId&&saved.payload?.delivery?saved:{invalid:true};
 }catch{return {invalid:true}}
}
const localTime=iso=>{const d=new Date(iso);return Number.isFinite(+d)?new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16):''};
export function hydratePaperDelivery() {
 const form=document.querySelector('[data-p-form="paper-delivery"]');if(!form)return;
 const saved=pendingPaperDelivery(pState.selectedClient?.id);
 if(saved&&!saved.invalid){
  const values={...saved.payload.delivery,request_id:saved.payload.p_request||'',message:saved.payload.p_message||'',delivered_at:localTime(saved.payload.delivery.delivered_at)};
  for(const [name,value] of Object.entries(values)){const control=form.elements.namedItem(name);if(!control)continue;
   if(name==='request_id'&&value&&![...control.options].some(o=>o.value===value)){const option=document.createElement('option');option.value=value;option.textContent='Original request · review current status';control.add(option)}
   control.value=value;
  }
 }
 const busy=flights.has(pState.selectedClient?.id);
 const refresh=document.querySelector('[data-p-action="refresh-paper"]');if(refresh)refresh.disabled=busy;
 form.querySelectorAll('input,select').forEach(e=>e.disabled=Boolean(saved)||busy);
 const submit=form.querySelector('[type="submit"]');submit.disabled=Boolean(saved?.invalid)||busy;submit.textContent=busy?'Recording delivery…':saved?'Retry original delivery':'Confirm delivered supply / fulfill request';
 form.querySelector('[data-p-action="reconcile-paper-delivery"]').disabled=busy;
 form.querySelector('[data-p-action="reconcile-paper-delivery"]').hidden=!saved||saved.invalid;
 if(saved)setFeedback(form,saved.invalid?'The original recovery record cannot be read. Do not record another delivery; ask the Master to review it.':'A delivery outcome needs review. Check the original delivery before retrying. Its identity and values are retained.','warning');
}
function setFeedback(form,message,tone='info') {
 const node=form.querySelector('[data-delivery-status]');node.textContent=message;node.setAttribute('role',tone==='error'?'alert':'status');
}
export function deliveryInput(data,now=Date.now()) {
 const raw=String(data.delivered_at||'');
 // datetime-local carries no offset: interpret in the browser's local timezone,
 // then reject invalid calendar/DST-normalized values before converting to UTC.
 const stamp=new Date(raw);
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?$/.test(raw)||!Number.isFinite(+stamp)||localTime(stamp.toISOString())!==raw.slice(0,16))throw Error('Enter a valid delivery date and time in your local time zone.');
 if(+stamp>now)throw Error('Delivery time is in the future. Enter when the paper was actually delivered, using your local time. Check your device clock if needed.');
 const reference=String(data.reference||'').trim(),message=String(data.message||'').trim();
 if(!reference||reference.length>150||message.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message))throw Error('Enter a delivery reference (up to 150 characters) and a customer note within the displayed limit.');
 const delivery={reference,delivered_at:stamp.toISOString()};
 for(const name of ['roll_count','usable_length_mm','paper_width_mm']){const value=Number(data[name]);if(!Number.isInteger(value)||value<1||value>2147483647)throw Error('Enter whole numbers greater than zero for rolls, usable length and paper width.');delivery[name]=value}
 return {delivery,message};
}
export function deliveryError(error) {
 if(!error?.definiteFailure)return 'The connection did not confirm the delivery outcome. Check the original delivery before retrying; do not create another entry.';
 if(error.message==='Future supply is not delivered capacity')return 'The server rejected a future delivery time. Enter the actual local delivery time and check your device clock.';
 if(error.message==='Stale or invalid lifecycle transition')return 'This request changed or is already closed. Refresh and review the original request before another attempt.';
 if(['Delivery conflict','Delivery communication conflict','Delivery identity required'].includes(error.message))return 'The delivery identity conflicts with an existing record. Keep the original identity and ask the Master to review it; do not create a replacement.';
 if(['22007','22008','22P02','23502','23514','22003'].includes(error.code)||['Invalid customer message','Customer notes require a linked request','Confirmed delivery required'].includes(error.message))return 'The delivery input was rejected. Check the date, quantities, reference and related request. Your values are retained.';
 return 'The server did not accept this delivery. Check the original delivery and current request status before retrying. Your values are retained.';
}
function matches(row,saved) {
 const p=saved.payload,d=p.delivery;
 return row.client_id===p.p_client&&(row.request_id||null)===p.p_request&&row.status==='delivered'&&row.reference===d.reference
  &&['roll_count','usable_length_mm','paper_width_mm'].every(k=>Number(row[k])===d[k])&&+new Date(row.delivered_at)===+new Date(d.delivered_at);
}
export async function submitPaperDelivery(form,{reconcile=false}={}) {
 const client=pState.selectedClient,context=captureView(),generation=pState.clientRequestGeneration;
 const current=()=>viewCurrent(context)&&generation===pState.clientRequestGeneration&&clientDataMatches(client);
 if(!current()||!['master_admin','portfolio_manager'].includes(pState.currentUser?.role)||flights.has(client.id))return;
 let saved=pendingPaperDelivery(client.id),acknowledged=false;
 if(saved?.invalid)return;
 let payload=saved?.payload;
 if(!payload){
  if(reconcile)return;
  try {
   const data=Object.fromEntries(new FormData(form)),{delivery,message}=deliveryInput(data);
   const request=(pState.clientData.operations.requests||[]).find(r=>r.request_id===data.request_id);
   if(data.request_id&&(!request||!['requested','approved','dispatched'].includes(request.status)))throw Error('This request is already fulfilled or closed, or its status is unavailable. Refresh paper status and review it first.');
   if(!request&&message)throw Error('Select a related request to send a customer delivery note.');
   payload={p_client:client.id,p_request:request?.request_id||null,p_version:request?.sync_version??null,p_status:'fulfilled',delivery,p_message:message};
  }catch(error){setFeedback(form,error.message,'error');return}
 }
 flights.add(client.id);
 const refresh=document.querySelector('[data-p-action="refresh-paper"]');if(refresh)refresh.disabled=true;
 form.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);
 const submit=form.querySelector('[type="submit"]');submit.textContent=reconcile?'Checking original delivery…':'Recording delivery…';submit.setAttribute('aria-busy','true');
 setFeedback(form,reconcile?'Checking the original delivery against Platform records…':'Saving the confirmed delivery…');
 let failure;
 try {
  if(!reconcile){
   try{
    await retryOperation(key(client.id),payload,id=>{saved={requestId:id,payload};return rpc('platform_paper_decision',{p_client:payload.p_client,p_request:payload.p_request,p_version:payload.p_version,p_status:'fulfilled',p_message:payload.p_message,p_expectation:'',p_delivery:{...payload.delivery,delivery_id:id}})},{retainOnFailure:true});
    acknowledged=true;
   }catch(error){failure=error}
  }
  if(!current())return;
  // A successful RPC is authoritative even if the subsequent history read fails.
  // An uncertain write can only be confirmed by its exact original delivery ID.
  let operations;
  try{operations=await rpc('platform_client_operations',{p_client:client.id});if((operations?.client?.id??operations?.client)!==client.id||!Array.isArray(operations.supplies))operations=null}catch{/* Keep the original receipt; absence from a bounded read is not proof of failure. */}
  if(!current())return;
  const row=operations?.supplies.find(d=>d.delivery_id===saved?.requestId),request=operations?.requests?.find(r=>r.request_id===payload.p_request);
  const exact=row&&matches(row,saved)&&(!payload.p_request||request?.status==='fulfilled'&&((request.communication?.at(-1)?.message||'')===payload.p_message));
  if(acknowledged||exact){
   settleRetryOperation(key(client.id),saved.requestId);
   if(operations){pState.clientData.operations=operations;render()}else form.reset();
   const message=(acknowledged?'Delivery recorded successfully.':'The original delivery is already recorded. No second supply entry was created.')+(operations?'':' History could not be refreshed; use Refresh paper status when connected.');
   setFeedback(document.querySelector('[data-p-form="paper-delivery"]'),message);notify.success(message);return;
  }
  // Known server validation rejection cannot have committed; allow input repair.
  const invalid=failure?.definiteFailure&&(failure.message==='Future supply is not delivered capacity'||['22007','22008','22P02','23502','23514','22003'].includes(failure.code)||['Invalid customer message','Customer notes require a linked request'].includes(failure.message));
  if(invalid&&!row)settleRetryOperation(key(client.id),saved.requestId);
  if(operations){
   pState.clientData.operations=operations;render();
   // Refresh history/status without discarding the original failed delivery form.
   document.querySelector('[data-p-form="paper-delivery"]')?.replaceWith(form);
  }
  hydratePaperDelivery();
  const message=row?'The original delivery identity has conflicting details. Do not create another entry; ask the Master to review it.'
   :request?.status==='fulfilled'?'This request is already fulfilled. The original delivery is not confirmed by these records. Review the delivery history before retrying; do not create another supply entry.'
   :request&&request.sync_version!==payload.p_version?'The request revision has changed. Review its refreshed status. The original delivery identity and values are retained for reconciliation.'
   :failure?deliveryError(failure):'The original delivery is not visible in the latest records. This list is limited, so this does not prove failure. Retry only the original unchanged delivery or ask the Master to review it.';
  setFeedback(form,message,'error');
 }finally{
  flights.delete(client.id);
  if(current()){const refresh=document.querySelector('[data-p-action="refresh-paper"]');if(refresh)refresh.disabled=false;const active=document.querySelector('[data-p-form="paper-delivery"]');if(active){const pending=pendingPaperDelivery(client.id);active.querySelectorAll('input,select').forEach(e=>e.disabled=Boolean(pending));active.querySelectorAll('button').forEach(e=>e.disabled=Boolean(pending?.invalid));const button=active.querySelector('[type="submit"]');button.textContent=pending?'Retry original delivery':'Confirm delivered supply / fulfill request';button.removeAttribute('aria-busy')}}
 }
}
