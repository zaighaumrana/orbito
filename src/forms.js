import { submitProvisioning } from './provisioning.js';
import { rpc, recordPayment, retryOperation } from "./operations.js";
import { pState, PCFG } from "./state.js";
import { pb, PLATFORM_AUTH_EMAIL, loadPlatform, loadClientData } from "./supabase.js";
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
    const { data: savedClient, error } = await pb.from("clients").insert({
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
    if (error) { alert("Error: " + error.message); return; }

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

    }).eq("id", pState.selectedClient.id);
    if (error) { alert("Error: " + error.message); return; }
    pState.selectedClient = { ...pState.selectedClient, ...data };
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
      alert("Only Master Admin can add users."); return;
    }
    const { error: fnErr } = await pb.functions.invoke("create-platform-user", {
      body: { email: data.email, name: data.name, role: data.role },
    });
    if (fnErr) { alert("Error sending invite: " + fnErr.message); return; }
    alert("Invite sent. They'll receive an email to set up their account.");
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Platform User ── */
  if (type === "edit-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      alert("Only Master Admin can edit users."); return;
    }
    if (data.password) {
      const pwErr = validatePassword(data.password);
      if (pwErr) { alert(pwErr); return; }
    }
    const { error: dbErr } = await pb.from("platform_users").update({
      name: data.name, email: data.email, role: data.role,
    }).eq("id", data.id);
    if (dbErr) { alert("Error: " + dbErr.message); return; }

    if (data.email !== data.old_email || data.password) {
      const user = pState.data.platformUsers.find(u => u.id === data.id);
      const payload = { auth_user_id: user?.auth_user_id };
      if (data.email !== data.old_email) payload.email    = data.email;
      if (data.password)                 payload.password = data.password;
      const { error: fnErr } = await pb.functions.invoke("update-platform-user", { body: payload });
      if (fnErr) { alert("DB updated but auth error: " + fnErr.message); }
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Change Own Password (non-admin roles) ── */
  if (type === "change-own-password") {
    if (data.newpass !== data.confirm) { alert("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { alert(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { alert("Error: " + error.message); return; }
    alert("Password updated. Please log in again.");
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }

  /* ── Change Master Admin Username ── */
  if (type === "change-username") {
    const { error: authErr } = await pb.auth.signInWithPassword({
      email: PLATFORM_AUTH_EMAIL, password: data.current,
    });
    if (authErr) { alert("Current password is wrong."); return; }
    const { error } = await pb.from("platform_config")
      .update({ admin_username: data.new_username }).eq("id", 1);
    if (error) { alert("Error: " + error.message); return; }
    PCFG.admin_username = data.new_username;
    alert("Username updated.");
    render(); return;
  }

  /* ── Change Master Admin Password ── */
  if (type === "change-password") {
    if (data.newpass !== data.confirm) { alert("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { alert(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { alert("Error: " + error.message); return; }
    alert("Password updated. Please log in again.");
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }
}
