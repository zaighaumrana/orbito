import {esc} from './operations.js';
import {pState} from './state.js';
import {captureView,viewCurrent,clientDataMatches} from './async-context.js';

let paperRefresh;
// Reuse the authorized loader with automatic Support writes explicitly disabled.
// Keep the form mounted during the read, then preserve its latest (not click-time)
// values across rendering. No state from a departed client/session is restored.
export async function refreshPaperStatus(loadClientData,render) {
 const client=pState.selectedClient;
 if(!clientDataMatches(client)||!['master_admin','portfolio_manager'].includes(pState.currentUser?.role))return;
 const context=captureView();
 if(paperRefresh&&viewCurrent(paperRefresh.context))return;
 const operation={context};paperRefresh=operation;
 const button=document.querySelector('[data-p-action="refresh-paper"]');
 const feedback=document.querySelector('[data-paper-refresh-status]');
 if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Refreshing…'}
 if(feedback)feedback.textContent='Reading the latest Platform paper records…';
 try {
  const pending=loadClientData(client,{readOnly:true,preserveOnError:true});
  const request=pState.clientRequestGeneration;
  const updated=await pending;
  if(!updated||!viewCurrent(context)||request!==pState.clientRequestGeneration||paperRefresh!==operation)return;
  const form=document.querySelector('form[data-p-form="paper-delivery"]');
  const active=document.activeElement;
  const focusName=form?.contains(active)?active.name:null;
  const focusRefresh=active?.matches?.('[data-p-action="refresh-paper"]');
  const draft=form?[...form.elements].filter(e=>e.name).map(e=>[e.name,e.value]):[];
  pState.clientData.paperRefreshMessage=pState.clientData.paperRefreshError||pState.clientData._error
   ? 'Paper status could not be refreshed. Previously displayed records may be out of date. Your delivery draft is retained; retry when connected.'
   : 'Platform paper records refreshed. Shop updates appear only after the Platform receives them.';
  render();
  const restored=document.querySelector('form[data-p-form="paper-delivery"]');
  let review=false;
  for(const [name,value] of draft){const control=restored?.elements.namedItem(name);if(!control)continue;
   if(name==='request_id'&&value&&![...control.options].some(o=>o.value===value)){
    const option=document.createElement('option');option.value=value;option.textContent='Previously selected request · no longer active; review before delivery';control.add(option);review=true;
   }
   control.value=value;
  }
  if(focusName)restored?.elements.namedItem(focusName)?.focus({preventScroll:true});
  else if(focusRefresh)document.querySelector('[data-p-action="refresh-paper"]')?.focus({preventScroll:true});
  if(review){const note=document.querySelector('[data-paper-refresh-status]');if(note)note.textContent+=' The draft request is no longer active. Review it before confirming a delivery.'}
 } finally {
  if(paperRefresh===operation)paperRefresh=null;
  if(viewCurrent(context)&&button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent='Refresh paper status'}
 }
}
const labels={approved:'Approve',rejected:'Reject',dispatched:'Dispatch',cancelled:'Cancel'};
export function paperRequests(client,rows,canManage){return `<div class="paper-requests">${rows.map(r=>`<article class="paper-request"><div><h3>${esc(r.status==='fulfilled'?'Delivered':r.status)}</h3><p class="muted">Request ${esc(r.request_id)}<br>${esc(r.requested_at)} · Revision ${esc(r.sync_version)}</p>${(r.communication||[]).map(m=>`<p class="paper-message">${esc(m.message)}${m.expectation?`<br>Expected delivery: ${esc(m.expectation)}`:''}<br><small>${esc(m.at)}</small></p>`).join('')}</div>${canManage?`<div class="paper-actions">${(r.status==='requested'?['approved','rejected','cancelled']:r.status==='approved'?['dispatched','cancelled']:[]).map(status=>`<button class="${status==='approved'?'primary-button':'secondary-button'}" data-p-action="paper-status" data-id="${esc(r.request_id)}" data-version="${esc(r.sync_version)}" data-status="${status}">${labels[status]}</button>`).join('')}</div>`:''}</article>`).join('')||'<p>No requests.</p>'}</div>`;}
export function paperDecisionModal(client,data){
 if(!client||data?.client!==client.id||!labels[data.status])return '';
 return `<div class="modal-backdrop"><section class="modal paper-decision" role="dialog" aria-modal="true" aria-labelledby="paper-decision-title"><div class="setup-heading"><h2 id="paper-decision-title">${labels[data.status]} paper request</h2><button type="button" class="icon-button" data-p-close aria-label="Close decision">✕</button></div><p>${esc(client.name)} · Client #${esc(client.id)}</p><p class="muted">Request ${esc(data.request)} · Revision ${esc(data.version)}</p>${['rejected','cancelled'].includes(data.status)?'<p>This closes the request permanently. The customer will see your reason.</p>':'<p>The customer will see this update after the next successful Shop sync.</p>'}<form data-p-form="paper-decision"><label class="field"><span>${data.status==='rejected'?'Rejection reason':'Customer message'}</span><textarea name="message" required maxlength="2000" rows="4" placeholder="Explain this decision to the customer"></textarea></label>${['approved','dispatched'].includes(data.status)?'<label class="field"><span>Expected delivery date or timeframe · optional</span><input name="expectation" maxlength="200" placeholder="For example, 24 October or 3–5 working days"></label>':''}<p class="muted">Customer-visible text only. Leave delivery expectations empty if unknown.</p><div class="paper-actions"><button type="button" class="secondary-button" data-p-close>Keep request unchanged</button><button class="primary-button" type="submit">Confirm ${labels[data.status].toLowerCase()}</button></div><p role="status" data-paper-progress></p></form></section></div>`;
}
