import { submitProvisioning } from './provisioning.js';
import { publicEnvironment } from './lifecycle.js';
import { validateOwner } from './onboarding.js';
import { rpc, recordPayment, retryOperation } from "./operations.js";
import { pState, PCFG } from "./state.js";
import { pb, reauthenticateMaster, loadPlatform, loadClientData, updateClientConfig } from "./supabase.js";
import { resetTurnstile, captchaBusy } from './turnstile.js';
import { notify, showMessage, cancelDialogs } from './dialogs.js';
import { render } from "./render.js";

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
  if(['client-lifecycle','config-recovery','provision-recovery','public-environment'].includes(type)) {
    // main.js owns the busy flag for the entire submit/refresh lifecycle.
    const client=pState.selectedClient,action=event.submitter?.value;
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
        if(data.config)pState.clientData.config={...client,...data.config};
        if(data.state==='unresolved')await showMessage({title:'Operation unresolved',message:'Read-back has not confirmed the intended change. The operation remains unresolved. Refresh server status before retrying.'});
      }
      pState.modal=null;await loadPlatform();await loadClientData(pState.selectedClient);render();
    }catch(error){notify.error(error);await loadPlatform();await loadClientData(pState.selectedClient);render();}
    return;
  }
  if (type === 'client-provisioning') { await submitProvisioning(form, event.submitter?.value); return; }
  const data = Object.fromEntries(new FormData(form).entries());

  if (type === 'paper-delivery') {
    const clientId = pState.selectedClient.id;
    const request = (pState.clientData.operations?.requests || []).find(r => r.request_id === data.request_id);
    const delivery = { reference: data.reference, roll_count: Number(data.roll_count), usable_length_mm: Number(data.usable_length_mm), paper_width_mm: Number(data.paper_width_mm), delivered_at: new Date(data.delivered_at).toISOString() };
    const payload = { p_client: clientId, p_request: request?.request_id || null, p_version: request?.sync_version || null, p_status: 'fulfilled', delivery };
    await retryOperation(`supply:${clientId}`, payload, id => rpc('platform_paper_action', { p_client: payload.p_client, p_request: payload.p_request, p_version: payload.p_version, p_status: payload.p_status, p_delivery: { ...delivery, delivery_id: id } }));
    await loadClientData(pState.selectedClient); render(); return;
  }

  /* ── Add Client ── */
  if (type === "add-client") {
    let owner;
    try { owner = validateOwner(data.owner_name, data.owner_email); } catch (error) { notify.error(error.message); return; }
    if (data.ems_track_breaks === 'true' && data.plan !== 'Pro Plus') { notify.error('Break Tracking requires Pro Plus / EMS.'); return; }
    const { data: savedClient, error } = await pb.from("clients").insert({
      ...owner,
      onboarding_version: 2,
      pairing_mode: data.pairing_mode,
      ems_track_breaks: data.ems_track_breaks === 'true',
      paper_resupply_enabled: data.paper_resupply_enabled === 'true',
      name:               data.name,
      industry:           data.industry || "Mobile Repair Shop",
      plan:               data.plan     || "Basic",
      status:             "Active",
      currency:           data.currency,
      currency_symbol:    data.currency,
      event_rate:         Number(data.event_rate || 0),
      inventory_rate:     Number(data.inventory_rate || 0),
      bill_billable:      true,
      inventory_billable: data.inventory_addon === "true",
      supabase_url:       `https://${data.project_ref}.supabase.co`,
      supabase_anon:      "",
      shop_url:           data.shop_url || "",
    }).select().single();
    if (error) { notify.error(error); return; }

    pState.selectedClient = savedClient;
    pState.page = 'client-detail';

    pState.modal = null;
    await loadPlatform();
    await loadClientData(pState.selectedClient); render(); return;
  }

  /* ── Edit Client ── */
  if (type === "edit-client") {
    if (data.currency !== pState.selectedClient.currency) await rpc("platform_set_currency", { p_client: pState.selectedClient.id, p_currency: data.currency });
    const { error } = await pb.from("clients").update({
      name:            data.name,
      industry:        data.industry,
      plan:            data.plan,
      shop_url:        data.shop_url,
      ...(pState.selectedClient.onboarding_version === 2 ? { pairing_mode:data.pairing_mode } : {}),

    }).eq("id", pState.selectedClient.id);
    if (error) { notify.error(error); return; }
    pState.selectedClient = { ...pState.selectedClient, ...data };
    if (pState.selectedClient.onboarding_version === 2 && pState.clientData.provisioning?.connection?.verified_at) {
      const modules = await rpc('platform_plan_entitlements',{p_plan:data.plan,p_inventory:pState.selectedClient.inventory_billable,p_breaks:pState.selectedClient.ems_track_breaks});
      await updateClientConfig(pState.selectedClient, modules);
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Client Rates ── */
  if (type === "edit-client-rates") {
    const clientId    = Number(data.client_id);
    const newEvent    = parseFloat(data.event_rate);
    const newInv      = parseFloat(data.inventory_rate);
    const invBillable = data.inventory_billable === "true";
    const client      = pState.data.clients.find(c => c.id === clientId);

    await rpc('platform_set_rates', { p_client: clientId, p_bill: newEvent, p_inventory: newInv, p_inventory_billable: invBillable });
    if (client.onboarding_version === 2 && pState.clientData.provisioning?.connection?.verified_at) {
      const modules = await rpc('platform_plan_entitlements',{p_plan:client.plan,p_inventory:invBillable,p_breaks:client.ems_track_breaks});
      await updateClientConfig(client,modules);
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Record Payment ── */
  if (type === "record-payment") {
    await recordPayment(data);
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Add Platform User (invite flow) ── */
  if (type === "add-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      notify.error("Only Master Admin can add users."); return;
    }
    const { data: invitation, error: fnErr } = await pb.functions.invoke("create-platform-user", {
      body: { email: data.email, name: data.name, role: data.role },
    });
    if (fnErr) { notify.error('Invitation could not be confirmed. Review the server audit before retrying.'); return; }
    if (invitation?.already_invited) notify.info('This invitation was already recorded. No new invitation email was sent.');
    else notify.success("Invite sent. They'll receive an email to set up their account.");
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Platform User ── */
  if (type === "edit-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      notify.error("Only Master Admin can edit users."); return;
    }
    if (data.password) {
      const pwErr = validatePassword(data.password);
      if (pwErr) { notify.error(pwErr); return; }
    }
    const payload = { id: data.id, name: data.name, email: data.email, role: data.role };
    if (data.password) payload.password = data.password;
    const { error: fnErr } = await pb.functions.invoke("update-platform-user", { body: payload });
    if (fnErr) { notify.error('Team update could not be confirmed. Review the server audit before retrying.'); return; }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Change Own Password (non-admin roles) ── */
  if (type === "change-own-password") {
    if (data.newpass !== data.confirm) { notify.error("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { notify.error(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { notify.error(error); return; }
    notify.success("Password updated. Please log in again.");
    cancelDialogs();
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }

  /* ── Change Master Admin Username ── */
  if (type === "change-username") {
    if (pState.reauthLoading) return;
    const username = data.new_username?.trim();
    if (!username || username.length > 100) { notify.error('Enter a username of 1–100 characters.'); return; }
    const token = pState.turnstileToken;
    pState.turnstileToken = null; pState.reauthLoading = true; captchaBusy();
    try {
      await reauthenticateMaster(data.current, token);
      const { data: saved, error } = await pb.from("platform_config")
        .update({ admin_username: username }).eq("id", 1).select('id,admin_username').maybeSingle();
      if (error || saved?.id !== 1 || saved.admin_username !== username) {
        notify.error('Username update could not be confirmed. Refresh Settings before retrying.'); return;
      }
      PCFG.admin_username = saved.admin_username;
      pState.currentUser = { ...pState.currentUser, username: saved.admin_username };
      form.reset(); notify.success('Username updated.'); render();
    } catch (error) { notify.error(error); }
    finally { pState.reauthLoading = false; resetTurnstile(); }
    return;
  }

  /* ── Change Master Admin Password ── */
  if (type === "change-password") {
    if (data.newpass !== data.confirm) { notify.error("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { notify.error(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { notify.error(error); return; }
    notify.success("Password updated. Please log in again.");
    cancelDialogs();
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }
}
