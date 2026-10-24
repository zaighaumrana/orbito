import {pState} from './state.js';
import {pb,loadSupportPage,loadSupportSummary} from './supabase.js';
import {captureView,viewCurrent} from './async-context.js';
import {notify} from './dialogs.js';

export async function openSupport(render,offset=0){
 pState.dataReady=true;pState.dataError=null;
 const context=captureView();
 try{const pending=loadSupportPage(offset);render();await pending;}
 catch(error){if(viewCurrent(context))notify.warning(error.message);}
 finally{if(viewCurrent(context))render();}
}
export async function resolveSupportTicket(id,resolution,render,expectedRevision){
 const context=captureView(),view=pState.supportView;
 const current=()=>viewCurrent(context)&&pState.supportView===view;
 if(!pState.authenticated||!['master_admin','portfolio_manager'].includes(pState.currentUser.role)||pState.page!=='support'){
  notify.error('Your current role cannot resolve Support tickets.');return;
 }
 const ticket=view?.rows.find(t=>t.id===id);
 if(!view?.ready||view.loading||!ticket||!Number.isSafeInteger(ticket.revision)||expectedRevision!==ticket.revision||ticket.status!=='Open'){
  notify.warning('This ticket is no longer ready to resolve. Refresh Support tickets before trying again.');return;
 }
 if(view.resolving)return;
 view.drafts||={};view.drafts[id]=resolution;view.resolving=true;render();
 let verified=false;
 try{
  const {data,error}=await pb.rpc('platform_support_ticket_resolve',{p_ticket:id,p_revision:ticket.revision,p_resolution:resolution});
  if(!current())return;
  if(error){
   view.ready=false;
   if(error.code==='42501'||error.status===401||error.status===403){view.rows=[];throw Error('Your access could not be verified. Sign in again or refresh your current permissions.');}
   if(['40001','PT409','P0001'].includes(error.code))throw Error('The ticket may have changed. Refresh Support tickets to check its current status before another attempt.');
   throw Error('The resolution outcome is uncertain. Refresh Support tickets before trying again.');
  }
  if(data?.resolved!==true||!Number.isSafeInteger(data.revision)||data.revision<=ticket.revision){view.ready=false;throw Error('The resolution could not be confirmed. Refresh Support tickets before trying again.');}
  verified=true;delete view.drafts[id];
  await Promise.all([loadSupportPage(view.offset),loadSupportSummary()]);
  if(viewCurrent(context))notify.success('Support ticket resolved.');
 }catch(error){
  if(viewCurrent(context)){
   if(verified)notify.warning('The ticket was resolved, but the refreshed page is unavailable. Refresh Support tickets to view it.');
   else {const message=view.ready?'The resolution outcome is uncertain. Refresh Support tickets before trying again.':error.message;if(current()){view.ready=false;view.error=message;}notify.warning(message);}
  }
 }finally{
  view.resolving=false;
  if(viewCurrent(context))render();
 }
}
