import {pState} from './state.js';
import {pb} from './supabase.js';
import {captureView,viewCurrent} from './async-context.js';
import {esc} from './operations.js';
import {confirmDialog,inputDialog,notify} from './dialogs.js';
const terminal=new Set(['complete','completed_reviewed','cancelled']);
const labels={review:'Review required',approved:'Approved',running:'Running · refresh status before retrying',paused:'Paused safely',uncertain:'Outcome uncertain · provider review required',verification_required:'Components installed · source review pending',complete:'Verified',completed_reviewed:'Completed with reviewed source limitation',cancelled:'Review cancelled'};
export function upgradePanel(client,master){
 if(!master)return '';
 const v=pState.backendUpgrade?.clientId===client.id?pState.backendUpgrade:null,j=v?.job,catalog=pState.backendInventory?.catalog||[];
 const field=id=>esc(v?.draft?.[id]?.value||''),checked=id=>v?.draft?.[id]?.checked?'checked':'';
 const stateLabel=j?.mode==='byo'&&j.state==='verification_required'?'Customer reports installation · verification pending':j?.mode==='byo'&&j.state==='completed_reviewed'?'Customer report reviewed · installed source unverified':labels[j?.state]||j?.state;
 return `<section class="card"><h3>Controlled backend upgrade</h3><p>An available release does not authorize an upgrade. Review the exact target and existing operations before approval. ${client.pairing_mode==='byo'?'The customer installs through their own CLI; Platform receives no administrative key.':''}</p>
 <button class="secondary-button" data-p-action="upgrade-status" ${v?.busy?'disabled':''}>Load upgrade status</button>
 ${j?`<p><strong>${esc(stateLabel)}</strong> · ${esc(j.request_id)}</p><p>Target ${esc(j.project_ref)} · ${esc(j.source_sha256)} → ${esc(j.target_sha256)}</p><p>${Object.keys(j.steps||{}).length}/${j.plan?.steps?.length||0} checkpoints recorded. Historical provisioning pins remain unchanged.</p>${j.unknown_step?`<p role="alert">Original uncertain step: ${esc(j.unknown_step)}. Do not start another request.</p>`:''}${j.plan?`<p>Evidence: ${esc(j.plan.evidence_origin)}. ${j.verification?esc(j.verification.evidence_strength||j.verification.origin)+' (SQL/component readiness; hosted acceptance remains separate).':''} ${j.plan.source_fully_verified?'Source evidence is available.':'Full source is unverified; an explicit baseline review reference is required.'}</p><ul>${j.plan.steps.map(s=>`<li>${esc(s.name)} · ${esc(j.steps?.[s.name]?.state||'pending')}</li>`).join('')}</ul>`:''}`:''}
 ${!j||j.state==='review'||terminal.has(j.state)?`${!catalog.length?'<p>Load saved backend evidence above to choose an approved source.</p>':''}<label>Approved historical source<select id="upgrade-source">${catalog.filter(c=>c.supported).map(c=>`<option value="${esc(c.sha256)}" ${v?.draft?.['upgrade-source']?.value===c.sha256?'selected':''}>${esc(c.release_id)} · ${esc(c.sha256)}</option>`).join('')}</select></label>${client.pairing_mode==='byo'?`<label>Customer read-only assessment JSON<textarea id="upgrade-assessment" rows="4">${field('upgrade-assessment')}</textarea></label>`:''}<button class="secondary-button" data-p-action="upgrade-review" ${v?.busy||!catalog.length?'disabled':''}>Prepare read-only upgrade plan</button>`:''}
 ${j?.plan&&['review','approved','paused'].includes(j.state)?`<label>Source review reference<input id="upgrade-source-review" value="${field('upgrade-source-review')}" maxlength="150" placeholder="Reviewed provider evidence reference"></label><label><input type="checkbox" id="upgrade-maintenance" ${checked('upgrade-maintenance')}> A maintenance window is required</label><label>Window starts<input type="datetime-local" id="upgrade-start" value="${field('upgrade-start')}"></label><label>Window ends<input type="datetime-local" id="upgrade-end" value="${field('upgrade-end')}"></label><label>Actual notification / acknowledgment reference<input id="upgrade-notification" value="${field('upgrade-notification')}" maxlength="150"></label><label><input type="checkbox" id="upgrade-ack" ${checked('upgrade-ack')}> Customer acknowledgment has actually been received</label><button class="secondary-button" data-p-action="upgrade-approve" ${v?.busy?'disabled':''}>Review and approve exact plan</button>`:''}
 ${j&&['approved','paused'].includes(j.state)?`<button class="secondary-button" data-p-action="${j.mode==='managed'?'upgrade-execute':'upgrade-download'}" ${v?.busy?'disabled':''}>${j.mode==='managed'?'Run / continue approved upgrade':'Download private customer clearance'}</button>`:''}
 ${j&&['running','uncertain'].includes(j.state)?`<label>Verified original provider outcome<select id="upgrade-completed"><option value="false">Verified not applied; safe to retry original step</option><option value="true" ${v?.draft?.['upgrade-completed']?.value==='true'?'selected':''}>Verified completed at the original target</option></select></label><button class="secondary-button" data-p-action="upgrade-reconcile" ${v?.busy?'disabled':''}>Record authoritative provider review</button>`:''}
 ${j&&['review','approved','verification_required'].includes(j.state)?`<button class="secondary-button" data-p-action="upgrade-close" ${v?.busy?'disabled':''}>${j.state==='verification_required'?'Accept reviewed components with source limitation':'Cancel idle review'}</button>`:''}
 ${v?.error?`<p role="alert">${esc(v.error)}</p>`:''}</section>`;
}
export async function handleUpgrade(action,render){
 const context=captureView(),client=pState.selectedClient;if(context.role!=='master_admin'||context.page!=='client-detail'||!client)return;
 const current=()=>viewCurrent(context),previous=pState.backendUpgrade?.clientId===client.id?pState.backendUpgrade:null;if(previous?.busy)return;
 const inputs=Object.fromEntries([...document.querySelectorAll('[id^="upgrade-"]')].map(el=>[el.id,{value:el.value,checked:el.checked}]));
 const v={...previous,clientId:client.id,busy:true,error:null,draft:{...previous?.draft,...inputs}};pState.backendUpgrade=v;
 const rpc=async(name,args)=>{const r=await pb.rpc(name,args);if(r.error)throw Error('Upgrade safeguard refused this action. Reconcile the original job and review its target, authorization and evidence.');return r.data;};
 const edge=async(body)=>{const r=await pb.functions.invoke('platform-upgrade',{body});if(r.error||r.data?.error)throw Error(r.data?.error||'Upgrade response unavailable. Refresh the original job before retrying.');return r.data;};
 const field=id=>v.draft[id],value=id=>field(id)?.value?.trim()||'';
 // Capture fields before rendering the submitting state replaces their elements.
 render();
 try{
  if(action==='upgrade-status'){v.job=await rpc('platform_upgrade_status',{p_client:client.id});}
  else if(action==='upgrade-review'){
   const request=v.job&&!terminal.has(v.job.state)?v.job.request_id:crypto.randomUUID();v.job={...v.job,request_id:request,state:'review'};
   let observation;if(client.pairing_mode==='byo'){const report=JSON.parse(value('upgrade-assessment'));observation=report.observation;}
   const result=await edge({action:'review',request_id:request,client_id:client.id,source_sha256:value('upgrade-source'),...(observation?{observation}:{})});v.job=result.job;
  }else if(action==='upgrade-approve'){
   const j=v.job,maintenance=field('upgrade-maintenance')?.checked;
   const conditions={source_review_reference:value('upgrade-source-review'),maintenance_required:!!maintenance,notification_state:maintenance?'acknowledged':'not_required',notification_reference:value('upgrade-notification'),customer_acknowledged:!!field('upgrade-ack')?.checked};
   if(maintenance){const start=new Date(value('upgrade-start')),end=new Date(value('upgrade-end'));if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('Enter a valid local maintenance start and later end time.');conditions.window_start=start.toISOString();conditions.window_end=end.toISOString();}
   const confirmation=await inputDialog({title:'Approve exact backend upgrade',message:`Review ${j.project_ref}, ${j.target_sha256} and the source limitations. Type UPGRADE ${j.project_ref} ${j.target_sha256}.`});if(!current()||!confirmation)return;conditions.confirmation=confirmation;
   await rpc('platform_upgrade_approve',{p_request:j.request_id,p_plan_sha256:j.plan_sha256,p_conditions:conditions});v.job=await rpc('platform_upgrade_status',{p_client:client.id});
  }else if(action==='upgrade-execute'){
   do{const result=await edge({action:'execute',request_id:v.job.request_id});if(!current())return;v.job=result.job;render();}while(v.job.state==='paused'&&current());
  }else if(action==='upgrade-download'){
   if(!await confirmDialog({title:'Private customer clearance',message:'Download only for the approved customer administrator. It contains limited upgrade clearance, expires after two hours and grants no Supabase administration.'})||!current())return;
   const result=await edge({action:'customer-token',request_id:v.job.request_id,client_id:client.id});if(!current())return;
   const url=URL.createObjectURL(new Blob([JSON.stringify(result.approval,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`retrasell-upgrade-${v.job.request_id}.json`;link.click();URL.revokeObjectURL(url);
  }else if(action==='upgrade-reconcile'||action==='upgrade-close'){
   const reference=await inputDialog({title:'Authoritative review reference',message:'Enter a nonsecret reference to the actual provider or source review.'});if(!reference||!current())return;
   const reason=await inputDialog({title:'Audited review reason',message:'Explain the evidence reviewed. This records an operator decision, not independent full-source verification.'});if(!reason||!current())return;
   if(action==='upgrade-reconcile')await rpc('platform_upgrade_reconcile',{p_request:v.job.request_id,p_step:v.job.unknown_step,p_completed:value('upgrade-completed')==='true',p_reference:reference,p_reason:reason});
   else await rpc('platform_upgrade_close',{p_request:v.job.request_id,p_reference:reference,p_reason:reason});
   v.job=await rpc('platform_upgrade_status',{p_client:client.id});
  }
 }catch(error){if(current()){v.error=error.message;notify.error(v.error);}}
 finally{if(current()){v.busy=false;pState.backendUpgrade=v;render();}}
}
