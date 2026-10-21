import {pState} from './state.js';
import {captureView,viewCurrent,clientDataMatches} from './async-context.js';
export const clientFields=['name','industry','owner_name','owner_email','plan','paper_resupply_enabled','ems_track_breaks','currency','event_rate','inventory_addon','inventory_rate','pairing_mode','shop_url','project_ref'];
const draftKey=()=>`retrasell-client-draft:${pState.currentUser.auth_user_id}:${pState.currentUser.session_id}`;
export function ensureClientDraft(){
 if(!pState.clientWizard){let saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey()))}catch{}
  const fields=Object.fromEntries(clientFields.filter(k=>typeof saved?.fields?.[k]==='string').map(k=>[k,saved.fields[k]]));
  pState.clientWizard={step:Math.max(0,Math.min(4,saved?.step||0)),fields,requestId:/^[a-f0-9-]{36}$/i.test(saved?.requestId||'')?saved.requestId:crypto.randomUUID(),pending:saved?.pending===true,reviewed:saved?.pending===true};
 }return pState.clientWizard;
}
export function rememberClientDraft(form){
 const draft=ensureClientDraft();if(draft.pending||draft.submitting)return;
 for(const key of clientFields)if(form.elements[key])draft.fields[key]=form.elements[key].value;
 if(draft.reviewed){
  draft.reviewed=false;form.querySelector('.client-review')?.remove();
  const submit=form.querySelector('button[type="submit"]');
  if(submit){submit.type='button';submit.className='secondary-button';submit.dataset.pAction='client-review';submit.textContent='Review client'}
 }
 persistClientDraft();
}
export function persistClientDraft(){try{const d=ensureClientDraft();sessionStorage.setItem(draftKey(),JSON.stringify({step:d.step,fields:d.fields,requestId:d.requestId,pending:d.pending===true}))}catch{}}
export function clearClientDraft(){try{sessionStorage.removeItem(draftKey())}catch{}pState.clientWizard=null}
export function hydrateClientDraft(){
 const form=document.querySelector('form[data-p-form="add-client"]');if(!form)return;
 const draft=ensureClientDraft();for(const [key,value] of Object.entries(draft.fields))if(clientFields.includes(key)&&form.elements[key])form.elements[key].value=value;
 const breaks=form.elements.ems_track_breaks;if(breaks){breaks.disabled=form.elements.plan.value!=='Pro Plus';if(breaks.disabled)breaks.value='false'}
 const rate=document.getElementById('onboard-inv-rate-field');if(rate)rate.classList.toggle('hidden',form.elements.inventory_addon.value!=='true');
 if(draft.pending||draft.submitting)for(const control of form.querySelectorAll('input,select'))control.disabled=true;
}
export function validateClientStage(form,step){
 const controls=[...form.querySelectorAll(`[data-client-step="${step}"] input,[data-client-step="${step}"] select`)];
 const invalid=controls.find(c=>!c.disabled&&!c.checkValidity());if(invalid){invalid.reportValidity();return false}
 if(step===2&&form.elements.ems_track_breaks.value==='true'&&form.elements.plan.value!=='Pro Plus')return false;
 return true;
}
export async function openByoWizard(pb,render){
 const client=pState.selectedClient;if(pState.currentUser.role!=='master_admin'||!clientDataMatches(client)||client.pairing_mode!=='byo')return;
 const project=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(client.supabase_url||'')?.[1];if(!project)return;
 const modal={type:'byo-setup'};pState.modal=modal;pState.byoWizard={clientId:client.id,projectRef:project,step:1,loading:true};render();
 await refreshByoWizard(pb,render);
}
export async function refreshByoWizard(pb,render){
 const ui=pState.byoWizard,context=captureView();if(!ui||pState.currentUser.role!=='master_admin')return;
 ui.loading=true;render();
 try{const {data,error}=await pb.rpc('platform_byo_progress',{p_client:ui.clientId,p_project_ref:ui.projectRef});
  if(!viewCurrent(context)||pState.byoWizard!==ui)return;
  if(error||data?.client_id!==ui.clientId||data.project_ref!==ui.projectRef)throw Error();
  ui.snapshot=data;ui.step=data.current_step;ui.error=null;
 }catch{if(viewCurrent(context))ui.error='Recorded progress is unavailable or changed. Instructions remain readable, but acknowledgments cannot be saved. Refresh or ask the Master to review the unapplied progress migration; do not rerun customer installation.'}
 finally{if(viewCurrent(context)&&pState.byoWizard===ui){ui.loading=false;render()}}
}
export async function updateByoWizard(pb,render,action,category){
 const ui=pState.byoWizard,context=captureView();if(!ui||ui.busy||ui.loading||pState.currentUser.role!=='master_admin'||!clientDataMatches()||pState.selectedClient.id!==ui.clientId)return;
 if(action==='byo-refresh')return refreshByoWizard(pb,render);
 const next=action==='byo-next'?Math.min(12,ui.step+1):action==='byo-back'?Math.max(1,ui.step-1):ui.step;
 const mark=({'byo-ack':'acknowledged','byo-block':'blocked','byo-skip':'not_applicable'})[action]||null;
 if(!ui.snapshot){if(!mark){ui.step=next;render()}return}
 ui.busy=true;render();
 try{const {data,error}=await pb.rpc('platform_byo_progress',{p_client:ui.clientId,p_project_ref:ui.projectRef,p_binding:ui.snapshot.client_binding,p_revision:ui.snapshot.revision,p_step:next,p_mark:mark,p_category:mark==='blocked'?category:null});
  if(!viewCurrent(context)||pState.byoWizard!==ui)return;
  if(error||data?.client_id!==ui.clientId||data.project_ref!==ui.projectRef)throw Error();
  ui.snapshot=data;ui.step=data.current_step;ui.error=null;
 }catch{if(viewCurrent(context))ui.error='Progress was not confirmed. Another operator or target change may have superseded this version. Refresh the recorded state before retrying; no customer operation was repeated.'}
 finally{if(viewCurrent(context)&&pState.byoWizard===ui){ui.busy=false;render()}}
}
