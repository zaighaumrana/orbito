import { notify, confirmDialog, cancelDialogs } from './dialogs.js';
import { resetTurnstile, mountTurnstile, captchaBusy } from './turnstile.js';
import { pState }                          from "./state.js";
import { pb, PLATFORM_AUTH_EMAIL,
         loadConfig, loadPlatform, loadClientData, loadOperatorIdentity,
         updateClientConfig }              from "./supabase.js";
import { render }                          from "./render.js";
import { generateInvoice, printClientInvoices } from "./billing.js";
import { validateSession }                 from "./helpers.js";
import { rpc } from "./operations.js";
import { openShopSupport } from './support-handoff.js';

export function initEvents() {

  /* ── Click delegation ── */
  document.addEventListener("click", event => {
    // Auth buttons use the existing action handler; prevent a second native submit.
    if (event.target.closest('[data-auth-form] button[type="submit"]')) event.preventDefault();
    (async () => {
    const el = event.target.closest(
      "button,a,[data-p-page],[data-p-action],[data-p-modal],[data-p-close]"
    );
    if (!el || el.disabled) return;

    /* Close modal */
    if (el.dataset.pClose !== undefined) {
      pState.modal = null; render(); return;
    }

    /* Page navigation */
    if (el.dataset.pPage) {
      if (!pState.authenticated) return;
      pState.page = el.dataset.pPage;
      pState.filter = "";
      if (el.dataset.pPage !== "client-detail") pState.selectedClient = null;
      render(); return;
    }

    /* Open modal */
    if (el.dataset.pModal) {
      pState.modal = { type: el.dataset.pModal }; render(); return;
    }

    const action = el.dataset.pAction;
    if (!action) return;
    if(action==='open-shop-support'){
      if(!pState.authenticated || pState.currentUser?.role!=='master_admin' || !pState.selectedClient)return;
      el.disabled=true;
      try {await openShopSupport(pState.selectedClient);} catch(error){notify.error(error);} finally{if(el.isConnected)el.disabled=false;}
      return;
    }
    if (action === 'copy-setup') {
      try { await navigator.clipboard.writeText(el.dataset.copyValue || '');el.textContent='Copied'; }
      catch { notify.error('Copy is unavailable. Select the displayed value to copy it.'); }
      return;
    }
    if (action === 'retry-verification') { void mountTurnstile(); return; }

    /* Theme toggle */
    if (action === "theme") {
      pState.theme = pState.theme === "dark" ? "light" : "dark";
      localStorage.setItem("retailos-platform-theme", pState.theme);
      render(); return;
    }

    /* Mobile sidebar */
    if (action === "toggle-sidebar") {
      document.getElementById("p-sidebar")?.classList.toggle("open"); return;
    }

    /* ── Show forgot password page ── */
    if (action === "show-forgot-password") {
      pState.page = "forgot-password";
      render(); return;
    }

    /* ── Back to login ── */
    if (action === "back-to-login") {
      pState.page = "login";
      render(); return;
    }

    /* ── Send reset link ── */
    if (action === "send-reset-link") {
      const email = document.getElementById("forgot-email")?.value?.trim();
      const statusEl = document.getElementById("forgot-status");
      if (!email) {
        statusEl.textContent = "Please enter your email.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }
      if (pState.resetLoading || !navigator.onLine || !pState.turnstileToken) return;
      const captchaToken = pState.turnstileToken;
      pState.resetLoading = true; captchaBusy();
      pState.page = "forgot-password"; // keep on this page after render
      const { error } = await pb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?reset=true`, captchaToken,
      });
      pState.resetLoading = false;
      render();
      const newStatusEl = document.getElementById("forgot-status");
      if (newStatusEl) {
        newStatusEl.textContent = error ? "Reset request failed. Verify again and retry." : "If an account exists for that email, a reset link has been sent.";
        newStatusEl.style.cssText += "color:#7aada0;background:rgba(122,173,160,0.1)";
        newStatusEl.classList.remove("hidden");
      }
      return;
    }

    /* ── Confirm new password from reset link ── */
    if (action === "confirm-reset-password") {
      const newpass = document.getElementById("reset-newpass")?.value;
      const confirm = document.getElementById("reset-confirm")?.value;
      const statusEl = document.getElementById("reset-status");

      if (newpass !== confirm) {
        statusEl.textContent = "Passwords don't match.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }
      if (newpass.length < 8 || !/[A-Z]/.test(newpass) || !/[0-9]/.test(newpass) || !/[^A-Za-z0-9]/.test(newpass)) {
        statusEl.textContent = "Password needs 8+ chars, an uppercase letter, a number, and a symbol.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }

      const { error } = await pb.auth.updateUser({ password: newpass });
      if (error) {
        statusEl.textContent = "Error: " + error.message;
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }

      /* Mark platform user as Active if they were Pending */
      const { data: { user } } = await pb.auth.getUser();
      if (user?.email) {
        await pb.rpc('platform_accept_invite');
      }

      statusEl.textContent = "Password updated! Redirecting to login…";
      statusEl.style.cssText += "color:#7aada0;background:rgba(122,173,160,0.1)";
      statusEl.classList.remove("hidden");

      await pb.auth.signOut();
      setTimeout(() => {
        pState.page = "login";
        render();
      }, 1500);
      return;
    }

    /* ── LOGIN ── */
    if (action === "do-login") {
      if (pState.loginLoading || !navigator.onLine) return;
      const username = document.getElementById("platform-username")?.value?.trim();
      const password = document.getElementById("platform-pin")?.value;
      const errorEl  = document.getElementById("platform-pin-error");
      errorEl?.classList.add("hidden");

      if (!pState.turnstileToken) {
        errorEl.textContent = "Please complete the CAPTCHA first.";
        errorEl?.classList.remove("hidden"); return;
      }
      if (!username || !password) {
        errorEl.textContent = "Username and password are required.";
        errorEl?.classList.remove("hidden"); return;
      }

      const captchaToken = pState.turnstileToken;
      pState.loginLoading = true; captchaBusy();

      const isEmail = username.includes("@");
      await pb.auth.signOut();

      if (!isEmail && !PLATFORM_AUTH_EMAIL) {
        errorEl.textContent = 'Use your Platform Auth email. Username login needs the optional email alias configured.';
        _loginFail(errorEl, true);return;
      }
      const { data: authData, error: authError } = await pb.auth.signInWithPassword({
        email: isEmail ? username : PLATFORM_AUTH_EMAIL, password, options: { captchaToken },
      });
      if (authError || !authData?.session) { _loginFail(errorEl);return; }
      try {
        const identity = await loadOperatorIdentity();
        if (!isEmail && (identity.role !== 'master_admin' || username.toLowerCase() !== String(identity.username || '').toLowerCase()))
          throw new Error('Access not authorised for this account.');
        pState.currentUser = { ...identity,sessionToken:crypto.randomUUID() };
        await loadConfig();await loadPlatform();
        pState.authenticated = true;pState.loginLoading = false;pState.page = 'overview';render();
      } catch (error) {
        await pb.auth.signOut();errorEl.textContent = error.message;_loginFail(errorEl,true);
      }
      return;
    }

    /* ── LOGOUT ── */
    if (action === "logout") {
      cancelDialogs();
      await pb.auth.signOut();
      pState.authenticated = false;
      pState.currentUser   = { role: "master_admin", username: "admin" };
      pState.page          = "login";
      pState.turnstileToken = null;
      render(); return;
    }

    /* ── Open client detail ── */
    if (action === "open-client") {
      const client = pState.data.clients.find(c => String(c.id) === String(el.dataset.pId));
      if (!client) return;
      pState.selectedClient = client;
      pState.page           = "client-detail";
      pState.clientData     = {};
      render();
      await loadClientData(client);
      render(); return;
    }

    /* Trusted subscription state update */
    if(action==='load-public-environment') {
      el.disabled=true;
      try {
        const {data,error}=await pb.functions.invoke('platform-provision',{body:{client_id:pState.selectedClient.id,request_id:crypto.randomUUID(),action:'frontend-env',params:{}}});
        if(error || !data?.public_env)throw Error('Public configuration unavailable; check managed project access.');
        pState.clientData.publicEnv=data.public_env;render();
      }finally{el.disabled=false;}
      return;
    }
    if(action==='client-view') { pState.clientView=el.dataset.view;render();return; }
    if (action === 'suspend-client' || action === 'activate-client') {
      const client = pState.data.clients.find(c => c.id === Number(el.dataset.pId));
      if (await updateClientConfig(client, { suspended: action === 'suspend-client' })) {
        await loadPlatform();
        if (pState.selectedClient?.id === client.id) await loadClientData(pState.data.clients.find(c => c.id === client.id));
        render();
      }
      return;
    }

    if (action === 'read-shop-config') {
      const { data, error } = await pb.functions.invoke('platform-config', { body: { client_id: pState.selectedClient.id, action: 'read' } });
      if (error || !data?.config) throw new Error(data?.error || error?.message || 'Shop configuration unavailable');
      pState.clientData.config = { ...pState.selectedClient, ...data.config };
      pState.clientData.verifiedAt = new Date().toISOString(); render(); return;
    }
    if (action === 'refresh-operations') {
      await loadPlatform(); await loadClientData(pState.selectedClient); render(); return;
    }
    if (action === 'paper-status') {
      await rpc('platform_paper_action', { p_client: pState.selectedClient.id, p_request: el.dataset.id, p_version: Number(el.dataset.version), p_status: el.dataset.status, p_delivery: null });
      await loadClientData(pState.selectedClient); render(); return;
    }

    /* ── Module toggles ── */
    const toggleMap = {
      "toggle-repair":     "repair_module_enabled",
      "toggle-inventory":  "inventory_module_enabled",
      "toggle-technician": "technician_module_enabled",
      "toggle-tracking":   "live_tracking_enabled",
      "toggle-ems":        "ems_enabled",
      "toggle-paper":      "paper_resupply_enabled",
    };
    if (toggleMap[action]) {
      const field = toggleMap[action];
      const cfg   = pState.clientData.config || {};
      const next  = !cfg[field];
      if (field === 'paper_resupply_enabled') {
        await rpc('platform_set_paper', { p_client: pState.selectedClient.id, p_enabled: next });
      } else if (!await updateClientConfig(pState.selectedClient, { [field]: next })) return;
      await loadPlatform();
      await loadClientData(pState.data.clients.find(c => c.id === pState.selectedClient.id));
      render();
      return;
    }

    /* ── Generate invoice ── */
    if (action === "generate-invoice") {
      const clientId = Number(el.dataset.pId);
      const client    = pState.data.clients.find(c => c.id === clientId);
      const newInvoice = await generateInvoice(clientId);
      await loadPlatform(); render();
      if (client && newInvoice) printClientInvoices(client, [newInvoice]);
      return;
    }

    /* ── Mark paid → open payment modal ── */
    if (action === "mark-paid") {
      pState.modal = {
        type: "record-payment",
        data: { invoiceId: Number(el.dataset.pId), clientId: Number(el.dataset.pClientId) },
      };
      render(); return;
    }

    /* Legacy credit needs reconciliation; payment always targets the original invoice. */
    if (action === 'clear-credit') {
      pState.modal = { type: 'record-payment', data: { invoiceId: Number(el.dataset.pInvoiceId), clientId: Number(el.dataset.pClientId) } };
      render(); return;
    }

    /* ── View invoice ── */
    if (action === "view-invoice") {
      pState.modal = { type: "view-invoice", data: { invoiceId: Number(el.dataset.pId) } };
      render(); return;
    }

    /* ── View logs ── */
    if (action === "view-logs") {
      pState.modal = { type: "view-logs", data: { clientId: Number(el.dataset.pId) } };
      render(); return;
    }

    /* ── Print invoice ── */
    if (action === "print-invoice") {
      const invoice = pState.data.invoices.find(i => i.id === Number(el.dataset.pId));
      const client  = pState.data.clients.find(c => c.id === invoice?.client_id);
      if (!invoice || !client) return;
      printClientInvoices(client, [invoice]); return;
    }

    /* ── Edit client rates ── */
    if (action === "edit-client-rates") {
      const client = pState.data.clients.find(c => String(c.id) === String(el.dataset.pId));
      if (!client) return;
      pState.modal = { type: "edit-client-rates", data: { client } };
      render(); return;
    }

    if (action === 'archive-client') {
      const client=pState.data.clients.find(c=>c.id===Number(el.dataset.pId));
      await loadClientData(client);pState.page='client-detail';pState.modal=null;render();return;
    }

    /* ── Edit platform user ── */
    if (action === "edit-platform-user") {
      pState.modal = {
        type: "edit-platform-user",
        data: {
          id:    el.dataset.pId,
          name:  el.dataset.pName,
          email: el.dataset.pEmail,
          role:  el.dataset.pRole,
        },
      };
      render(); return;
    }

    /* ── Remove platform user ── */
    if (action === "remove-platform-user") {
      if (pState.currentUser.role !== "master_admin") {
        notify.error("Only Master Admin can remove users."); return;
      }
      const userId = el.dataset.pId; el.disabled = true;
      try {
        if (!await confirmDialog({title:'Remove team member?',message:'This user will lose all access immediately.',confirmLabel:'Remove user',danger:true})) return;
        const identity = await loadOperatorIdentity();
        if (identity.role !== 'master_admin') { notify.error('Only Master Admin can remove users.'); return; }
        const { error: fnErr } = await pb.functions.invoke("delete-platform-user", { body: { id: userId } });
        if (fnErr) { notify.error('Team removal could not be confirmed. Review the server audit before retrying.'); return; }
        await loadPlatform(); render();
      } finally { if (el.isConnected) el.disabled = false; }
      return;
    }

    /* ── Resolve support ticket ── */
    if (action === "resolve-ticket") {
      const { error } = await pb.from("support_tickets")
        .update({ status: "Resolved", resolved_at: new Date().toISOString() })
        .eq("id", el.dataset.pId);
      if (error) { notify.error(error); return; }
      await loadPlatform(); render(); return;
    }
    })().catch(error => {
      if (pState.loginLoading) { pState.authenticated = false; pState.page = 'login'; pState.loginLoading = false; render(); }
      if (pState.resetLoading) { pState.resetLoading = false; resetTurnstile(); }
      notify.error(error);
    });
  });

  /* ── Input (filter + dynamic form) ── */
  document.addEventListener("input", event => {
    if (event.target.dataset.pFilter !== undefined) {
      pState.filter = event.target.value; render();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "onboard-inv-select") {
      const rateField = document.getElementById("onboard-inv-rate-field");
      if (rateField) rateField.classList.toggle("hidden", event.target.value !== "true");
    }
  });

  /* Native Enter/assistive-technology submission follows the same Auth action. */
  document.addEventListener("submit", event => {
    if (event.target.dataset.authForm === undefined) return;
    event.preventDefault();
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button && !button.disabled) button.click();
  });

  /* ── Online / offline ── */
  window.addEventListener("online",  () => { pState.online = true;  if (pState.authenticated) render(); });
  window.addEventListener("offline", () => { pState.online = false; if (pState.authenticated) render(); });

  /* ── Session check every 60s ── */
  setInterval(() => validateSession(render), 60 * 1000);
}

/* ── Login failure helper ── */
function _loginFail(errorEl, keepMsg = false) {
  pState.loginLoading   = false;
  pState.turnstileToken = null;
  const message = keepMsg ? errorEl?.textContent : "Invalid username or password.";
  resetTurnstile();
  if (errorEl) errorEl.textContent = message;
  if (!keepMsg) {
    const el = document.getElementById("platform-pin-error");
    if (el) el.textContent = "Invalid username or password.";
  }
  document.getElementById("platform-pin-error")?.classList.remove("hidden");
}
