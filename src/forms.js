import { captureView, viewCurrent, authorityCurrent, selectClient, clientDataMatches } from './async-context.js';
import { submitProvisioning } from './provisioning.js';
import { publicEnvironment } from './lifecycle.js';
import { validateOwner } from './onboarding.js';
import { rpc, recordPayment, retryOperation } from "./operations.js";
import { pState, PCFG, clearSensitiveState } from "./state.js";
import { pb, reauthenticateMaster, diagnoseMasterSession, loadPlatform, loadClientData, updateClientConfig } from "./supabase.js";
import { resetTurnstile, captchaBusy } from './turnstile.js';
import { notify, showMessage, confirmDialog, cancelDialogs } from './dialogs.js';
import { teamErrorMessage } from './team-errors.js';
import { render } from "./render.js";
import { validateSession } from './helpers.js';
import {submitByoSupport} from './byo-support.js';
import {ensureClientDraft,rememberClientDraft,persistClientDraft,clearClientDraft,validateClientStage} from './wizard-controller.js';

function validatePassword(pw) {
  if (pw.length < 8)              return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw))         return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw))         return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw))  return "Password must contain at least one special character.";
  return null;
}

export async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.pForm;
  const context=captureView(),current=()=>viewCurrent(context);
  if(!current())return;
  if(pState.dataReady===false && !['change-username','change-password','change-own-password','master-continuity'].includes(type)){notify.error('Authorized Platform data is unavailable. Refresh before making changes.');return;}
  const selected=pState.selectedClient;
  const refresh=async(detail=false)=>{
    if(!current())return;
    pState.modal=null;const refreshed=captureView();
    try{await loadPlatform();}catch{if(viewCurrent(refreshed)){render();notify.error(pState.dataError);}return;}
    if(!viewCurrent(refreshed))return;
    if(detail && !await loadClientData(pState.selectedClient))return;
    if(viewCurrent(refreshed))render();
  };
  const syncEntitlements=async(client,plan,inventory)=>{
    // Operational fields are already projected to Manager; server binding and
    // role checks remain authoritative. Master retains its verified legacy path.
    const ready=clientDataMatches(client) &&
      (client.infrastructure_state==='present' && ['Active','Suspended'].includes(client.lifecycle_state)
        || pState.currentUser.role==='master_admin' && pState.clientData.provisioning?.connection?.verified_at);
    if(!ready)return 'Platform changes saved; Shop synchronization is not confirmed. Verify Shop setup and ask a Master Admin or Portfolio Manager to reconcile entitlements.';
    try{
      const modules=await rpc('platform_plan_entitlements',{p_plan:plan,p_inventory:inventory,p_breaks:client.ems_track_breaks});
      if(!current())return;
      if(await updateClientConfig(client,modules) && current())return;
    }catch{if(!current())return;}
    return 'Platform changes saved; Shop synchronization is not confirmed. Refresh Client status and ask the Master Admin to reconcile any recorded pending request before another Shop write.';
  };
  if(['client-lifecycle','config-recovery','provision-recovery','public-environment'].includes(type)) {
    // main.js owns the busy flag for the entire submit/refresh lifecycle.
    const client=selected,action=event.submitter?.value;
    if(!clientDataMatches(client))return;
    const value=name=>form.elements[name]?.value?.trim() || '';
    try {
      if(type==='public-environment') {
        await navigator.clipboard.writeText(publicEnvironment(client,value('anon'),value('site_key')));return;
      }
      if(type==='client-lifecycle')await rpc('platform_client_lifecycle',{p_client:client.id,p_action:action,p_reason:value('reason'),p_project_ref:value('project_ref')||null});
      if(type==='provision-recovery')await rpc('platform_provision_reconcile',{p_client:client.id,p_request:value('request_id'),p_action:action,p_reason:value('reason')});
      if(type==='config-recovery'){
        const {data,error}=await pb.functions.invoke('platform-config',{body:{client_id:client.id,request_id:value('request_id'),action:'recover',recovery_action:action,reason:value('reason')}});
        if(error || data?.error){let body=data;try{body ||= await error.context.clone().json();}catch{}throw Error(body?.error || 'Recovery response unavailable. Refresh server status.');}
        if(!current())return;
        if(data.config)pState.clientData.config={...client,...data.config,id:client.id};
        if(data.state!=='applied')await showMessage({title:'Operation unresolved',message:'The Shop state was observed, but completion of the recorded request is not verified. Keep the same request identity and refresh server status before recovery.'});
      }
      await refresh(true);
    }catch(error){if(current()){notify.error(error);await refresh(true);}}
    return;
  }
  if (type === 'client-provisioning') { await submitProvisioning(form, event.submitter?.value); return; }
  if(type==='support-byo-enrollment'){
    if(pState.currentUser.role!=='master_admin'||!clientDataMatches(selected))return;
    try{await submitByoSupport(form,selected,pb,current);if(current())await refresh(true);}
    catch(error){if(current())notify.error(error);}
    finally{if(form.elements.enrollment)form.elements.enrollment.value='';}
    return;
  }
  if(type==='support-provider-completion'){
    if(pState.currentUser.role!=='master_admin'||!clientDataMatches(selected)||!form.elements.confirmed.checked)return;
    try{
      const result=await pb.functions.invoke('platform-support-enrollment',{body:{action:'acknowledge-provider-completion',client_id:selected.id,request_id:form.elements.request_id.value,data:{confirmed:true,reason:form.elements.reason.value.trim(),provider_reference:form.elements.provider_reference.value.trim()}}});
      if(result.error||result.data?.error)throw Error('Provider completion was not recorded. Preserve the original enrollment and review the evidence.');
      if(current())await refresh(true);
    }catch(error){if(current())notify.error(error);}
    return;
  }
  let data = Object.fromEntries(new FormData(form).entries());
  if(type==='paper-decision'){
    if(!clientDataMatches(selected)||!['master_admin','portfolio_manager'].includes(pState.currentUser?.role))return;
    const modal=pState.modal,decision=modal?.type==='paper-decision'?modal.data:null;
    if(!decision||decision.client!==selected.id)return;
    const message=String(data.message||'').trim(),expectation=String(data.expectation||'').trim();
    if(!message||message.length>2000||expectation.length>200){notify.error('Enter a customer message within the displayed limits.');return;}
    form.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=true);
    form.querySelector('[data-paper-progress]').textContent='Saving customer update…';
    try{
      await rpc('platform_paper_decision',{p_client:decision.client,p_request:decision.request,p_version:decision.version,p_status:decision.status,p_message:message,p_expectation:expectation,p_delivery:null});
      if(current()&&pState.modal===modal){pState.modal=null;if(await loadClientData(selected)){render();notify.success('Paper supply decision saved.');}}
    }catch(error){if(current()&&pState.modal===modal){form.querySelector('[data-paper-progress]').textContent=error.definiteFailure?'Decision was not saved. Refresh the request before trying a different decision.':'Outcome unconfirmed. Retry these same values or refresh to reconcile the saved revision.';if(!error.definiteFailure)form.querySelectorAll('input,textarea').forEach(e=>e.readOnly=true);}}
    finally{form.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=false);}
    return;
  }
  if(type==='master-continuity'){
    if(pState.currentUser.role!=='master_admin' || pState.reauthLoading)return;
    const attempt={};pState.diagnosticAttempt=attempt;
    const token=pState.turnstileToken;pState.turnstileToken=null;pState.reauthLoading=true;captchaBusy();
    try{
      await diagnoseMasterSession(data.current,token);
      if(current())notify.success('Diagnostic passed: the original Master session survived temporary verification, cleanup and refresh. Permanent deletion remains disabled.',{duration:0});
    }catch(error){if(current()){notify.error(error?.userMessage || 'Session continuity is unconfirmed. Sign in again if needed; permanent deletion remains disabled.');await validateSession(render);}else if(!pState.authenticated && pState.page==='login')notify.error('Master session continuity could not be confirmed. Sign in again; permanent deletion remains disabled.');}
    finally{data.current='';const input=form.querySelector('input[name="current"]');if(input)input.value='';if(pState.diagnosticAttempt===attempt){pState.diagnosticAttempt=null;pState.reauthLoading=false;if(current())resetTurnstile();}}
    return;
  }

  if (type === 'paper-delivery') {
    if(!clientDataMatches(selected))return;
    const clientId = selected.id;
    const request = (pState.clientData.operations?.requests || []).find(r => r.request_id === data.request_id);
    if(!request&&String(data.message||'').trim()){notify.error('Select a related request to send a customer delivery note.');return;}
    const delivery = { reference: data.reference, roll_count: Number(data.roll_count), usable_length_mm: Number(data.usable_length_mm), paper_width_mm: Number(data.paper_width_mm), delivered_at: new Date(data.delivered_at).toISOString() };
    const payload = { p_client: clientId, p_request: request?.request_id || null, p_version: request?.sync_version || null, p_status: 'fulfilled', delivery };
    payload.p_message=String(data.message||'').trim();
    await retryOperation(`supply:${clientId}`, payload, id => rpc('platform_paper_decision', { p_client: payload.p_client, p_request: payload.p_request, p_version: payload.p_version, p_status: payload.p_status,p_message:payload.p_message,p_expectation:'', p_delivery: { ...delivery, delivery_id: id } }));
    if(current() && await loadClientData(selected))render(); return;
  }

  /* ── Add Client ── */
  if (type === "add-client") {
    if(!['master_admin','portfolio_manager'].includes(pState.currentUser.role))return;
    const draft=ensureClientDraft();if(draft.submitting||!draft.reviewed||draft.step!==4)return;
    if(!draft.pending){
      for(let step=0;step<5;step++)if(!validateClientStage(form,step)){draft.step=step;persistClientDraft();render();return;}
      rememberClientDraft(form);draft.reviewed=true;
    }
    data={...draft.fields};
    let owner;
    try { owner = validateOwner(data.owner_name, data.owner_email); } catch (error) { notify.error(error.message); return; }
    if (data.ems_track_breaks === 'true' && data.plan !== 'Pro Plus') { notify.error('Break Tracking requires Pro Plus / EMS.'); return; }
    draft.submitting=true;draft.error=null;draft.pending=true;persistClientDraft();render();
    let response;
    try{response=await pb.rpc('platform_create_client_once',{p_request:draft.requestId,p_data:{
      ...owner,
      pairing_mode: data.pairing_mode,
      ems_track_breaks: data.ems_track_breaks === 'true',
      paper_resupply_enabled: data.paper_resupply_enabled === 'true',
      name:               data.name,
      industry:           data.industry || "Mobile Repair Shop",
      plan:               data.plan     || "Basic",
      currency:           data.currency,
      currency_symbol:    data.currency,
      event_rate:         Number(data.event_rate || 0),
      inventory_rate:     Number(data.inventory_rate || 0),
      inventory_billable: data.inventory_addon === "true",
      supabase_url:       `https://${data.project_ref}.supabase.co`,
      shop_url:           data.shop_url || "",
    }})}catch{response={error:{code:'transport'}}}
    if(!current()){
      if(authorityCurrent(context)&&pState.clientWizard===draft){
        draft.submitting=false;draft.error='Creation response arrived after leaving this form. Retry the original creation to reconcile the unconfirmed outcome.';persistClientDraft();
        if(pState.modal?.type==='add-client')render();
      }
      return;
    }
    draft.submitting=false;
    const {data:savedClient,error}=response;
    if(error||!savedClient?.id){
      if(['22023','23514','23502','P0001'].includes(error?.code))draft.pending=false;
      draft.error=error?.code==='PGRST202'?'Creation service is unavailable. The reviewed migration must be approved and applied before client creation; no fallback write was attempted.':draft.pending?'Creation is unconfirmed. Retry the original creation with the same locked details.':'Client validation failed. Review the entered fields; no client was created by this rejected transaction.';
      persistClientDraft();render();return;
    }
    clearClientDraft();

    selectClient(savedClient);
    pState.page = 'client-detail';

    pState.modal=null;const added=captureView();
    await loadPlatform();if(!viewCurrent(added))return;
    if(await loadClientData(pState.selectedClient) && viewCurrent(added))render(); return;
  }

  /* ── Edit Client ── */
  if (type === "edit-client") {
    if(!clientDataMatches(selected)){notify.error('Refresh the selected client before saving changes. Your draft has been kept.');return;}
    if(data.currency!==selected.currency){await rpc('platform_set_currency',{p_client:selected.id,p_currency:data.currency});if(!current())return;}
    const { error } = await pb.rpc('platform_save_client',{p_client:selected.id,p_data:{
      name:            data.name,
      industry:        data.industry,
      plan:            data.plan,
      shop_url:        data.shop_url,
      ...(selected.onboarding_version === 2 ? { pairing_mode:data.pairing_mode } : {}),

    }});
    if(!current())return;
    if (error) { notify.error(error); return; }
    pState.selectedClient = { ...selected, ...data,id:selected.id };
    const notice=selected.onboarding_version===2 && data.plan!==selected.plan?await syncEntitlements(selected,data.plan,selected.inventory_billable):null;
    if(!current())return;
    await refresh(true);
    if(notice && viewCurrent(context,false))notify.warning(notice);
    return;
  }

  /* ── Edit Client Rates ── */
  if (type === "edit-client-rates") {
    const clientId    = Number(data.client_id);
    const newEvent    = parseFloat(data.event_rate);
    const newInv      = parseFloat(data.inventory_rate);
    const invBillable = data.inventory_billable === "true";
    const client      = pState.data.clients.find(c => c.id === clientId);

    await rpc('platform_set_rates', { p_client: clientId, p_bill: newEvent, p_inventory: newInv, p_inventory_billable: invBillable });
    if(!current())return;
    let notice;
    if(pState.currentUser.role==='master_admin' && client.onboarding_version===2)notice=await syncEntitlements(client,client.plan,invBillable);
    else if(invBillable!==client.inventory_billable)notice='Rates saved; inventory billing changed, but Shop entitlement synchronization is not confirmed. Ask a Master Admin or Portfolio Manager to verify and reconcile Shop settings.';
    if(!current())return;
    await refresh();
    if(notice && viewCurrent(context,false))notify.warning(notice);
    return;
  }

  /* ── Record Payment ── */
  if (type === "record-payment") {
    await recordPayment(data);
    await refresh(); return;
  }

  /* ── Add Platform User (invite flow) ── */
  if (type === "add-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      notify.error("Only Master Admin can add users."); return;
    }
    const retired=(pState.data.teamArchive || []).filter(u=>u.email.trim().toLowerCase()===data.email.trim().toLowerCase())
      .sort((a,b)=>b.deleted_at.localeCompare(a.deleted_at) || b.id.localeCompare(a.id))[0];
    if(retired && !await confirmDialog({title:'Invite as a fresh employee?',message:'This email belonged to a permanently retired employee. Create a new account and role assignment without restoring the old identity, password, permissions or sessions?',confirmLabel:'Invite fresh employee'}))return;
    if(!current())return;
    const { data: invitation, error: fnErr } = await pb.functions.invoke("create-platform-user", {
      body: { email: data.email, name: data.name, role: data.role, request_id:pState.modal.data.requestId,...(retired?{retired_employee_id:retired.id}:{}) },
    });
    if(!current())return;
    if (fnErr || invitation?.success!==true) { const message=await teamErrorMessage(invitation,fnErr,pState.modal.data.requestId);if(!current())return;notify.error(message);if(pState.page==='team'){pState.teamTab='Pending';await refresh();}return; }
    if (invitation?.already_invited) notify.info('This invitation was already recorded. No new invitation email was sent.');
    else notify.success("Employee invitation created. Setup email requested; delivery and password setup are not yet confirmed.",{duration:0});
    if(pState.page==='team')pState.teamTab='Pending';
    await refresh(); return;
  }

  /* ── Edit Platform User ── */
  if (type === "edit-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      notify.error("Only Master Admin can edit users."); return;
    }
    const payload = { id: data.id, name: data.name, email: data.email, role: data.role, request_id:pState.modal.data.requestId };
    const { data: updated, error: fnErr } = await pb.functions.invoke("update-platform-user", { body: payload });
    if(!current())return;
    if (fnErr || updated?.success!==true) { const message=await teamErrorMessage(updated,fnErr,payload.request_id);if(current())notify.error(message);return; }
    notify.success('Employee details and role updated.',{duration:0});
    await refresh(); return;
  }

  /* ── Change Own Password (non-admin roles) ── */
  if (type === "change-own-password") {
    if (data.newpass !== data.confirm) { notify.error("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { notify.error(pwErr); return; }
    if (!data.current) { notify.error("Enter your current password."); return; }
    const { error } = await pb.auth.updateUser({ current_password: data.current, password: data.newpass });
    if(!current())return;
    if (error) { notify.error(error); return; }
    cancelDialogs();
    notify.success("Password updated. Please log in again.");
    clearSensitiveState();
    pState.page = "login";
    render();await pb.auth.signOut({ scope: "local" });return;
  }

  /* ── Change Master Admin Username ── */
  if (type === "change-username") {
    if (pState.reauthLoading) return;
    const generation=pState.authorityGeneration;
    const username = data.new_username?.trim();
    if (!username || username.length > 100) { notify.error('Enter a username of 1–100 characters.'); return; }
    const token = pState.turnstileToken;
    pState.turnstileToken = null; pState.reauthLoading = true; captchaBusy();
    try {
      await reauthenticateMaster(data.current, token);
      if(!current())return;
      const { data: saved, error } = await pb.from("platform_config")
        .update({ admin_username: username }).eq("id", 1).select('id,admin_username').maybeSingle();
      if(!current())return;
      if (error || saved?.id !== 1 || saved.admin_username !== username) {
        notify.error('Username update could not be confirmed. Refresh Settings before retrying.'); return;
      }
      if(generation!==pState.authorityGeneration || !pState.authenticated)return;
      PCFG.admin_username = saved.admin_username;
      pState.currentUser = { ...pState.currentUser, username: saved.admin_username };
      form.reset(); notify.success('Username updated.'); render();
    } catch (error) { if(current())notify.error(error); }
    finally {
      if(authorityCurrent(context))pState.reauthLoading=false;
      if(current())resetTurnstile();
    }
    return;
  }

  /* ── Change Master Admin Password ── */
  if (type === "change-password") {
    if (data.newpass !== data.confirm) { notify.error("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { notify.error(pwErr); return; }
    if (!data.current) { notify.error("Enter your current password."); return; }
    const { error } = await pb.auth.updateUser({ current_password: data.current, password: data.newpass });
    if(!current())return;
    if (error) { notify.error(error); return; }
    cancelDialogs();
    notify.success("Password updated. Please log in again.");
    clearSensitiveState();
    pState.page = "login";
    render();await pb.auth.signOut({ scope: "local" });return;
  }
}
