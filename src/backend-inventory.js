import {pState} from './state.js';
import {pb} from './supabase.js';
import {captureView,viewCurrent} from './async-context.js';
import {esc} from './operations.js';
export async function loadBackendInventory(refresh=false){
 const client=pState.selectedClient,context=captureView();if(!client||context.page!=='client-detail')return false;
 if(!['master_admin','portfolio_manager'].includes(context.role)||refresh&&context.role!=='master_admin')throw Error('Backend diagnostics require the authorized operator.');
 const request=(pState.inventoryRequest||0)+1;pState.inventoryRequest=request;
 const current=()=>viewCurrent(context)&&pState.inventoryRequest===request;
 pState.backendInventory={clientId:client.id,loading:true};
 try{
  if(refresh){const result=await pb.functions.invoke('platform-backend-inventory',{body:{client_id:client.id}});if(!current())return false;if(result.error||!result.data?.report)throw Error();}
  const {data,error}=await pb.rpc('platform_backend_inventory_status',{p_client:client.id});
  if(!current())return false;if(error||data?.client_id!==client.id)throw Error();pState.backendInventory={...data,clientId:client.id,loading:false};return true;
 }catch{if(current())pState.backendInventory={clientId:client.id,error:'Backend evidence could not be verified. The Shop was not changed; refresh diagnostics when access returns.'};return current();}
}
export function backendInventoryPanel(client,master){
 const v=pState.backendInventory?.clientId===client.id?pState.backendInventory:null,r=v?.report;
 const labels={up_to_date:'Up to date',upgrade_available:'Upgrade available',upgrade_required:'Upgrade required',unable_to_verify:'Unable to verify',drift:'Drift or conflict',healthy:'Healthy',degraded:'Degraded',unhealthy:'Unhealthy',unknown:'Unknown'};
 const capabilityLabels={'usage-outbox':'Usage delivery','billing-projection':'Billing updates','config-journal':'Configuration recovery','support-identity':'Support identity','support-consent':'Owner approval','support-durable-submissions':'Saved Support requests','owner-bootstrap':'Owner setup','private-rls':'Private data access'};
 const checked=Object.entries(r?.evidence?.capabilities||{}).map(([key,value])=>`<li>${esc(capabilityLabels[key]||key)}: ${value===true?'Found':value===false?'Missing':'Unable to verify'}</li>`).join('');
 return `<section class="card"><h2>Shop Backend / Release Compliance</h2><p>Release evidence and runtime health are separate. Detection never upgrades, suspends or changes this Shop.</p><button class="secondary-button" data-p-action="backend-inventory" ${v?.loading?'disabled':''}>${v?.loading?'Loading evidence…':'Load saved evidence'}</button>${master?` <button class="secondary-button" data-p-action="backend-inventory-refresh" ${v?.loading?'disabled':''}>Run read-only diagnostics</button>`:''}${v?.error?`<p role="alert">${esc(v.error)}</p>`:''}
 ${v&&!v.loading&&!v.error?`<dl><dt>Historical installation / job pins</dt><dd>${(v.historical||[]).map(h=>esc(h.release_id)+' · '+esc(h.origin)).join('<br>')||'No recorded immutable pin; this is not proof of installed source.'}</dd><dt>Last verified full release</dt><dd>${esc(v.last_verified?.release?.release_id||r?.verified_release?.release_id||'Unable to verify')}</dd><dt>Last full verification</dt><dd>${esc(v.last_verified?.verified_at||'Not established')}</dd><dt>Release compliance</dt><dd>${v.stale?'Unable to verify · evidence is missing or older than one day':esc(labels[r?.compliance]||'Unable to verify')}</dd><dt>Runtime health at last check</dt><dd>${v.stale?'Unknown':esc(labels[r?.runtime_health]||'Unknown')}</dd><dt>Last check</dt><dd>${esc(v.checked_at||'Not checked')}</dd><dt>Approved fresh release</dt><dd>${esc(v.catalog?.find(c=>c.approved_for_new)?.release_id||'Unavailable')}</dd><dt>Evidence</dt><dd>${esc(r?.evidence?.origin||'None')} · ${esc(r?.evidence?.strength||'Unavailable')}</dd><dt>Upgrade policy</dt><dd>${r?.upgrade?.available?esc(r.upgrade.release_id)+' · '+esc(r.upgrade.policy)+' (migration history basis; complete source verification is separate)':'No approved successor established from current evidence.'}</dd></dl>${checked?`<p>Capabilities observed at last check</p><ul>${checked}</ul>`:''}${r?.missing?.length?`<p>Missing/conflicting: ${r.missing.map(esc).join(', ')}</p>`:''}<p>${(r?.limitations||[]).map(esc).join(' · ')}</p>`:''}</section>`;
}
