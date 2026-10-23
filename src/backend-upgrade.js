import {renderUpgradePanel} from './upgrade-view.js';
import {validateAssessment,hasUpgradePlan} from './upgrade-assessment.js';
import {pState} from './state.js';
import {pb} from './supabase.js';
import {captureView,viewCurrent} from './async-context.js';
import {confirmDialog,inputDialog,notify} from './dialogs.js';
const terminal=new Set(['complete','completed_reviewed','cancelled']);
export function upgradePanel(client,master){return renderUpgradePanel(client,master);}
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
  if(action==='upgrade-status'){v.job=await rpc('platform_upgrade_status',{p_client:client.id});v.statusLoaded=true;}
  else if(action==='upgrade-review'){
   if(!v.statusLoaded&&!v.job)throw Error('Load upgrade status before preparing a review. This preserves any existing request.');
   const source=v.job?.source_sha256||value('upgrade-source'),catalog=pState.backendInventory?.catalog||[];
   if(!catalog.some(c=>c.supported&&!c.approved_for_new&&c.sha256===source))throw Error('Choose the supported historical source shown by the evidence.');
   let observation;if(client.pairing_mode==='byo')observation=validateAssessment(value('upgrade-assessment'),{client,catalog,source,job:v.job,binding:{source_id:pState.clientData?.operations?.source?.source_id,client_binding:pState.clientData?.provisioning?.connection?.client_binding},fresh:!!field('upgrade-fresh-assessment')?.checked});
   const request=v.job&&!terminal.has(v.job.state)?v.job.request_id:v.requestId||crypto.randomUUID();v.requestId=request;
   const result=await edge({action:'review',request_id:request,client_id:client.id,source_sha256:source,...(observation?{observation}:{})});v.job=result.job;v.statusLoaded=true;
  }else if(action==='upgrade-approve'){
   if(!hasUpgradePlan(v.job))throw Error('Complete the validated upgrade review before approval.');
   const j=v.job,maintenance=field('upgrade-maintenance')?.checked;
   const conditions={source_review_reference:value('upgrade-source-review'),maintenance_required:!!maintenance,notification_state:maintenance?'acknowledged':'not_required',notification_reference:value('upgrade-notification'),customer_acknowledged:!!field('upgrade-ack')?.checked};
   if(maintenance){const start=new Date(value('upgrade-start')),end=new Date(value('upgrade-end'));if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('Enter a valid local maintenance start and later end time.');conditions.window_start=start.toISOString();conditions.window_end=end.toISOString();}
   const confirmation=await inputDialog({title:'Approve exact backend upgrade',message:`Review ${j.project_ref}, ${j.target_sha256} and the source limitations. Type UPGRADE ${j.project_ref} ${j.target_sha256}.`});if(!current()||!confirmation)return;conditions.confirmation=confirmation;
   await rpc('platform_upgrade_approve',{p_request:j.request_id,p_plan_sha256:j.plan_sha256,p_conditions:conditions});v.job=await rpc('platform_upgrade_status',{p_client:client.id});
  }else if(action==='upgrade-execute'){
   if(!hasUpgradePlan(v.job))throw Error('A validated approved plan is required before installation.');
   do{const result=await edge({action:'execute',request_id:v.job.request_id});if(!current())return;v.job=result.job;render();}while(v.job.state==='paused'&&current());
  }else if(action==='upgrade-download'){
   if(!hasUpgradePlan(v.job))throw Error('A validated approved plan is required before customer clearance.');
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
