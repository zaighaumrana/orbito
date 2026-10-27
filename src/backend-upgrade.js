import {renderUpgradePanel} from './upgrade-view.js';
import {validateAssessment,hasUpgradePlan,upgradeActionAllowed} from './upgrade-assessment.js';
import {pState} from './state.js';
import {pb} from './supabase.js';
import {captureView,viewCurrent} from './async-context.js';
import {confirmDialog,inputDialog,notify} from './dialogs.js';
const terminal=new Set(['complete','completed_reviewed','cancelled']);
export function upgradePanel(client,master){return renderUpgradePanel(client,master);}
export async function handleUpgrade(action,render){
 const context=captureView(),client=pState.selectedClient;if(context.role!=='master_admin'||context.page!=='client-detail'||!client)return;
 const previous=pState.backendUpgrade?.clientId===client.id?pState.backendUpgrade:null;if(previous?.busy)return;
 const inputs=Object.fromEntries([...document.querySelectorAll('[id^="upgrade-"]')].map(el=>[el.id,{value:el.value,checked:el.checked}]));
 previous?.dismissNotice?.();
 const v={...previous,clientId:client.id,busy:true,error:null,message:null,dismissNotice:null,draft:{...previous?.draft,...inputs}};pState.backendUpgrade=v;
 // This panel belongs to the client/session, independently of a local modal.
 const current=()=>viewCurrent(context,false)&&pState.backendUpgrade===v,stale=Symbol('departed upgrade action');
 const owned=()=>{if(!current())throw stale;};
 let dispatched=false,accepted=false;
 const rpc=async(name,args)=>{owned();dispatched=true;const r=await pb.rpc(name,args);owned();if(r.error)throw Error('Upgrade safeguard refused this action. Reconcile the original job and review its target, authorization and evidence.');return r.data;};
 const edge=async(body)=>{owned();dispatched=true;const r=await pb.functions.invoke('platform-upgrade',{body});owned();if(r.error||r.data?.error)throw Error(r.data?.error||'Upgrade response unavailable. Refresh the original job before retrying.');return r.data;};
 const publish=(job,request)=>{
  owned();if(job!==null&&(!job||job.client_id!==client.id||typeof job.state!=='string'||request&&job.request_id!==request))throw Error('The returned review does not match the original client and request. Load upgrade status.');
  if(request&&!job)throw Error('The original review could not be verified. Load upgrade status.');
  const recovered=v.pendingReview&&job?.request_id===v.pendingReview.body.request_id;
  if(job&&terminal.has(job.state))v.previousJob=job;
  v.job=job;v.statusLoaded=true;v.needsRefresh=false;
  if(recovered){v.pendingReview=null;v.nextPrepared=false;v.draft={};}
  if(job&&!terminal.has(job.state)){if(v.view!=='previous'||recovered)v.view='current';v.nextPrepared=false;}
  else if(!v.nextPrepared)v.view=job?'previous':'next';
 };
 const refresh=async request=>publish(await rpc('platform_upgrade_status',{p_client:client.id}),request);
 const feedback=(message,tone='success')=>{owned();v.message=message;v.dismissNotice=notify[tone]?.(message);};
 const field=id=>v.draft[id],value=id=>field(id)?.value?.trim()||'';
 // Capture fields before rendering the submitting state replaces their elements.
 render();
 try{
  if(action!=='upgrade-status'&&v.needsRefresh)throw Error('Load upgrade status before another action. The previous outcome has not been refreshed.');
  if(!upgradeActionAllowed(action,v.job,client.pairing_mode,v.previousJob))throw Error('This action is not available in the current upgrade state. Load upgrade status to review the original job.');
  if(action==='upgrade-status'){await refresh();feedback(v.pendingReview?'The submitted review is not confirmed by the latest status. Keep its request and retry only the original review.':v.job?'Latest upgrade status loaded.':'No saved upgrade review was found.');}
  else if(action==='upgrade-prepare'){
   if(!v.statusLoaded)throw Error('Load upgrade status before preparing the next upgrade.');
   if(!v.nextPrepared){
    if(v.pendingReview)throw Error('Recover the original submitted review before preparing another upgrade.');
    v.draft={};v.requestId=null;v.nextPrepared=true;
   }
   v.view='next';
  }else if(action==='upgrade-previous'){
   v.view='previous';
  }else if(action==='upgrade-current'){
   v.view='current';
  }
  else if(action==='upgrade-review'){
   if(!v.statusLoaded&&!v.job)throw Error('Load upgrade status before preparing a review. This preserves any existing request.');
   const active=v.job&&!terminal.has(v.job.state)?v.job:null;
   if(v.job&&!active&&v.view!=='next')throw Error('Select Prepare next upgrade before creating a separate review.');
   const source=active?.source_sha256||v.pendingReview?.body.source_sha256||value('upgrade-source'),catalog=pState.backendInventory?.catalog||[];
   if(!catalog.some(c=>c.supported&&!c.approved_for_new&&c.sha256===source))throw Error('Choose the supported historical source shown by the evidence.');
   const target=catalog.find(c=>c.approved_for_new&&c.supported);
   if(v.pendingReview&&(v.pendingReview.target!==target?.sha256||active&&active.request_id!==v.pendingReview.body.request_id))throw Error('The target or original review changed. Reconcile the submitted request before another review.');
   if(!v.pendingReview){
    let observation;if(client.pairing_mode==='byo')observation=validateAssessment(value('upgrade-assessment'),{client,catalog,source,job:active,binding:{source_id:pState.clientData?.operations?.source?.source_id,client_binding:pState.clientData?.provisioning?.connection?.client_binding},fresh:!!field('upgrade-fresh-assessment')?.checked});
    const request=active?active.request_id:v.requestId||crypto.randomUUID();v.requestId=request;
    v.pendingReview={target:target?.sha256,body:{action:'review',request_id:request,client_id:client.id,source_sha256:source,...(observation?{observation}:{})}};
    if(!active)v.nextPrepared=true;
   }
   const {body}=v.pendingReview,result=await edge(body);publish(result.job,body.request_id);feedback('Upgrade review saved. Review the evidence before approval.');
  }else if(action==='upgrade-approve'){
   if(!hasUpgradePlan(v.job))throw Error('Complete the validated upgrade review before approval.');
   const j=v.job,maintenance=field('upgrade-maintenance')?.checked;
   const conditions={source_review_reference:value('upgrade-source-review'),maintenance_required:!!maintenance,notification_state:maintenance?'acknowledged':'not_required',notification_reference:value('upgrade-notification'),customer_acknowledged:!!field('upgrade-ack')?.checked};
   if(maintenance){const start=new Date(value('upgrade-start')),end=new Date(value('upgrade-end'));if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('Enter a valid local maintenance start and later end time.');conditions.window_start=start.toISOString();conditions.window_end=end.toISOString();}
   const confirmation=await inputDialog({title:'Approve exact backend upgrade',message:`Review ${j.project_ref}, ${j.target_sha256} and the source limitations. Type UPGRADE ${j.project_ref} ${j.target_sha256}.`});if(!current()||!confirmation)return;conditions.confirmation=confirmation;
   await rpc('platform_upgrade_approve',{p_request:j.request_id,p_plan_sha256:j.plan_sha256,p_conditions:conditions});accepted=true;await refresh(j.request_id);feedback('Upgrade approval recorded; the displayed status is refreshed.');
  }else if(action==='upgrade-execute'){
   if(!hasUpgradePlan(v.job))throw Error('A validated approved plan is required before installation.');
   do{const request=v.job.request_id,result=await edge({action:'execute',request_id:request});publish(result.job,request);render();}while(v.job.state==='paused'&&current());
   feedback(v.job.state==='verification_required'?'Installation checkpoints recorded. Final evidence review is required.':'Upgrade response received; review the refreshed status before another action.',v.job.state==='uncertain'?'warning':v.job.state==='verification_required'?'success':'info');
  }else if(action==='upgrade-download'){
   if(!hasUpgradePlan(v.job))throw Error('A validated approved plan is required before customer clearance.');
   if(!await confirmDialog({title:'Private customer clearance',message:'Download only for the approved customer administrator. It contains limited upgrade clearance, expires after two hours and grants no Supabase administration.'})||!current())return;
   const request=v.job.request_id,result=await edge({action:'customer-token',request_id:request,client_id:client.id});
   const url=URL.createObjectURL(new Blob([JSON.stringify(result.approval,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`retrasell-upgrade-${v.job.request_id}.json`;link.click();URL.revokeObjectURL(url);
   accepted=true;await refresh(request);feedback('Private customer clearance downloaded. Installation remains customer-controlled.');
  }else if(action==='upgrade-reconcile'||action==='upgrade-close'){
   const reference=await inputDialog({title:'Authoritative review reference',message:'Enter a nonsecret reference to the actual provider or source review.'});if(!reference||!current())return;
   const reason=await inputDialog({title:'Audited review reason',message:'Explain the evidence reviewed. This records an operator decision, not independent full-source verification.'});if(!reason||!current())return;
   const request=v.job.request_id;
   if(action==='upgrade-reconcile')await rpc('platform_upgrade_reconcile',{p_request:request,p_step:v.job.unknown_step,p_completed:value('upgrade-completed')==='true',p_reference:reference,p_reason:reason});
   else await rpc('platform_upgrade_close',{p_request:request,p_reference:reference,p_reason:reason});
   accepted=true;await refresh(request);feedback(v.job.state==='completed_reviewed'?'Review acknowledgment recorded. The installed-source limitation remains recorded.':v.job.state==='cancelled'?'Idle review cancelled; its history is retained.':'Provider review recorded; the original job status is refreshed.');
  }
 }catch(error){if(current()){if(dispatched)v.needsRefresh=true;v.error=accepted?'The action was accepted, but its current status could not be refreshed. Load upgrade status before taking another action.':error.message;v.dismissNotice=notify.error(v.error);}}
 finally{if(current()){v.busy=false;pState.backendUpgrade=v;render();}}
}
