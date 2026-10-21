import { loadSupportPage } from './supabase.js';
import {refreshPaperStatus} from './paper-supply.js';
import {ensureClientDraft,rememberClientDraft,persistClientDraft,validateClientStage,openByoWizard,updateByoWizard} from './wizard-controller.js';
import { captureView, viewCurrent, selectClient, clientDataMatches } from './async-context.js';
import { notify, confirmDialog, showMessage, deleteUserDialog, cancelDialogs } from './dialogs.js';
import { resetTurnstile, mountTurnstile, cleanupTurnstile, captchaBusy } from './turnstile.js';
import { pState, clearSensitiveState }                          from "./state.js";
import { pb, PLATFORM_AUTH_EMAIL,
         loadConfig, loadPlatform, loadClientData, loadOperatorIdentity,
         updateClientConfig }              from "./supabase.js";
import { render, syncSidebar }             from "./render.js";
import { generateInvoice, printClientInvoices } from "./billing.js";
import { validateSession }                 from "./helpers.js";
import { rpc } from "./operations.js";
import { openShopSupport } from './support-handoff.js';
import { teamErrorMessage } from './team-errors.js';
import { teamStatus } from './team.js';

export function initEvents() {

  /* ── Click delegation ── */
  document.addEventListener("click", event => {
    // Auth buttons use the existing action handler; prevent a second native submit.
    if (event.target.closest('[data-auth-form] button[type="submit"]')) event.preventDefault();
    const eventContext=pState.authenticated?captureView():null,eventGeneration=pState.authorityGeneration;
    const current=()=>eventContext && viewCurrent(eventContext);
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
      if(el.dataset.pPage==='team'){
        const identity=await loadOperatorIdentity();
        if(!current() || identity.role!=='master_admin' || identity.auth_user_id!==pState.currentUser.auth_user_id){if(current())notify.error('Team Management is restricted to the verified Master Admin.');return;}
      }
      pState.page = el.dataset.pPage;
      pState.filter = "";
      selectClient(el.dataset.pPage==='client-detail'?pState.selectedClient:null);
      if(pState.page==='support'){pState.supportView={rows:[],offset:0,has_more:false};render();await loadSupportPage(0);if(pState.page==='support')render();return;}
      render(); return;
    }

    /* Open modal */
    if (el.dataset.pModal) {
      if(el.dataset.pModal==='byo-setup'){await openByoWizard(pb,render);return;}
      if(el.dataset.pModal==='add-client'){
        if(!['master_admin','portfolio_manager'].includes(pState.currentUser.role))return;
        ensureClientDraft();
      }
      if(['add-platform-user','master-continuity'].includes(el.dataset.pModal) && pState.currentUser.role!=='master_admin')return;
      pState.modal = { type: el.dataset.pModal, data:{requestId:crypto.randomUUID()} }; render(); return;
    }

    const action = el.dataset.pAction;
    if (!action) return;
    if(['byo-refresh','byo-back','byo-next','byo-ack','byo-skip','byo-block'].includes(action)){
      const category=document.querySelector('[data-byo-category]')?.value;
      await updateByoWizard(pb,render,action,category);return;
    }
    if(['client-back','client-next','client-review'].includes(action)){
      const form=document.querySelector('form[data-p-form="add-client"]'),draft=ensureClientDraft();if(!form||draft.pending||draft.submitting)return;
      rememberClientDraft(form);
      if(action!=='client-back'&&!validateClientStage(form,draft.step))return;
      if(action==='client-review')draft.reviewed=true;else draft.step=Math.max(0,Math.min(4,draft.step+(action==='client-next'?1:-1)));
      persistClientDraft();render();return;
    }
    if(action==='reload-platform'){await loadPlatform();if(current())render();return;}
    if(['generate-invoice','mark-paid','clear-credit','view-invoice','view-logs','print-invoice','edit-client-rates'].includes(action)
      && (!['master_admin','billing_person'].includes(pState.currentUser.role) || pState.dataReady===false))return;
    if(action==='open-shop-support'){
      if(!clientDataMatches() || pState.currentUser?.role!=='master_admin')return;
      el.disabled=true;
      try {await openShopSupport(pState.selectedClient);} catch(error){if(current())notify.error(error);} finally{if(el.isConnected)el.disabled=false;}
      return;
    }
    if (action === 'copy-setup') {
      try { await navigator.clipboard.writeText(el.dataset.copyValue || '');el.textContent='Copied'; }
      catch { notify.error('Copy is unavailable. Select the displayed value to copy it.'); }
      return;
    }
    if (action === 'retry-verification') { void mountTurnstile(); return; }
    if (action === 'retry-diagnostic-verification') { void mountTurnstile({containerId:'diagnostic-verification',statusId:'diagnostic-status',buttonSelector:'[data-diagnostic-submit]'}); return; }
    if (action === 'retry-setup') { await pState.setupRouter.retry(); return; }

    /* Theme toggle */
    if (action === "theme") {
      pState.theme = pState.theme === "dark" ? "light" : "dark";
      localStorage.setItem("retailos-platform-theme", pState.theme);
      render(); return;
    }

    /* Mobile sidebar */
    if (action === "toggle-sidebar") {
      const sidebar=document.getElementById('p-sidebar'),open=!sidebar?.classList.contains('open');
      syncSidebar(open);(open?sidebar?.querySelector('button'):document.getElementById('p-menu-btn'))?.focus();return;
    }

    /* ── Show forgot password page ── */
    if (action === "show-forgot-password") {
      pState.page = "forgot-password";
      render(); return;
    }

    /* ── Back to login ── */
    if (action === "back-to-login") {
      pState.setupRouter?.clear();
      pState.page = "login";
      render(); return;
    }

    /* ── Send reset link ── */
    if (action === "send-reset-link") {
      const email = document.getElementById("forgot-email")?.value?.trim();
      const statusEl = document.getElementById("forgot-status");
      if (!email) {
        statusEl.textContent = "Please enter your email.";
        statusEl.style.cssText += "color:var(--rs-danger);background:var(--rs-danger-bg)";
        statusEl.classList.remove("hidden"); return;
      }
      if (pState.resetLoading || !navigator.onLine || !pState.turnstileToken) return;
      const attempt={generation:pState.authorityGeneration};pState.resetAttempt=attempt;
      const ownsReset=()=>pState.resetAttempt===attempt && attempt.generation===pState.authorityGeneration && !pState.authenticated && pState.page==='forgot-password';
      const captchaToken = pState.turnstileToken;
      pState.resetLoading = true; captchaBusy();
      pState.page = "forgot-password"; // keep on this page after render
      let error;
      try { ({error}=await pb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?reset=true`, captchaToken })); }
      catch { error={code:'unavailable'}; }
      finally { if(pState.resetAttempt===attempt){pState.resetLoading=false;if(ownsReset())render();} }
      if(!ownsReset())return;
      const newStatusEl = document.getElementById("forgot-status");
      if (newStatusEl) {
        newStatusEl.textContent = error?.status===429 || /rate_limit/.test(error?.code || '') ? 'Too many requests. Please wait before trying again.' : error?.code==='captcha_failed' ? "Complete fresh verification and try again." : error ? 'Recovery could not be confirmed. Please try again later or contact your administrator.' : "Check your email for recovery instructions if recovery is available for that account. If no email arrives, retry later or contact your administrator.";
        newStatusEl.className='auth-status '+(error?'is-error':'is-info');
        newStatusEl.classList.remove("hidden");
      }
      return;
    }

    /* ── Confirm new password from reset link ── */
    if (action === "confirm-reset-password") {
      if (pState.passwordSaving || !pState.passwordFlow) return;
      const flow=pState.passwordFlow,generation=pState.authorityGeneration;
      const setupCurrent=()=>flow===pState.passwordFlow && generation===pState.authorityGeneration;
      const newpass = document.getElementById("reset-newpass")?.value;
      const confirm = document.getElementById("reset-confirm")?.value;
      const statusEl = document.getElementById("reset-status");

      if (newpass !== confirm) {
        statusEl.textContent = "Passwords don't match.";
        statusEl.style.cssText += "color:var(--rs-danger);background:var(--rs-danger-bg)";
        statusEl.classList.remove("hidden"); return;
      }
      if (newpass.length < 8 || !/[A-Z]/.test(newpass) || !/[0-9]/.test(newpass) || !/[^A-Za-z0-9]/.test(newpass)) {
        statusEl.textContent = "Password needs 8+ chars, an uppercase letter, a number, and a symbol.";
        statusEl.style.cssText += "color:var(--rs-danger);background:var(--rs-danger-bg)";
        statusEl.classList.remove("hidden"); return;
      }

      pState.passwordSaving=true;el.disabled=true;
      let result;
      try {
        result=await pb.functions.invoke('platform-password-setup',{body:{password:newpass,request_id:pState.passwordFlow.requestId}});
      } finally {if(setupCurrent())pState.passwordSaving=false;if(el.isConnected)el.disabled=false;}
      if(!setupCurrent())return;
      if (result.error || result.data?.success!==true) {
        statusEl.textContent = "Password setup or activation could not be confirmed. Your account may remain restricted. Retry the same setup, or contact your administrator if the outcome is uncertain.";
        statusEl.style.cssText += "color:var(--rs-danger);background:var(--rs-danger-bg)";
        statusEl.classList.remove("hidden"); return;
      }

      statusEl.textContent = "Password updated! Redirecting to login…";
      statusEl.style.cssText += "color:var(--rs-success);background:var(--rs-success-bg)";
      statusEl.classList.remove("hidden");

      pState.setupRouter?.clear();await pb.auth.signOut({ scope: "local" });
      setTimeout(() => {
        if(generation!==pState.authorityGeneration || pState.authenticated)return;
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
      // A login owns its lock and continuations; clearing authority invalidates it.
      const attempt={id:crypto.randomUUID(),generation:++pState.authorityGeneration,phase:'signing-out'};
      const owns=()=>pState.loginAttempt===attempt && attempt.generation===pState.authorityGeneration;
      pState.loginAttempt=attempt;pState.authRouting=false;
      pState.loginLoading = true;

      const isEmail = username.includes("@");
      try {
        captchaBusy();
        await pb.auth.signOut({ scope: "local" });
        if(!owns())return;
        attempt.phase='authenticating';
        if (!isEmail && !PLATFORM_AUTH_EMAIL) {
          errorEl.textContent = 'Use your Platform Auth email. Username login needs the optional email alias configured.';
          _loginFail(errorEl, true);return;
        }
        const { data: authData, error: authError } = await pb.auth.signInWithPassword({
          email: isEmail ? username : PLATFORM_AUTH_EMAIL, password, options: { captchaToken },
        });
        if(!owns())return;
        if (authError || !authData?.session) { _loginFail(errorEl);return; }
        const setup=await pb.rpc('platform_team_setup_context');
        if(!owns())return;
        if(!setup.error && setup.data?.kind==='pending') {await pState.setupRouter.retry();return;}
        const identity = await loadOperatorIdentity();
        if(!owns())return;
        if (!isEmail && (identity.role !== 'master_admin' || username.toLowerCase() !== String(identity.username || '').toLowerCase()))
          throw new Error('Access not authorised for this account.');
        attempt.phase='loading';
        pState.currentUser = { ...identity,sessionToken:crypto.randomUUID() };pState.authenticated=true;
        await loadConfig();if(!owns() || !pState.authenticated)return;
        await loadPlatform();if(!owns() || !pState.authenticated)return;
        pState.page = 'overview';pState.loginLoading=false;render();
      } catch (error) {
        if(!owns())return;
        clearSensitiveState();
        // Retain an owned cleanup lock until this local signout finishes. Its
        // expected SIGNED_OUT is not a cancellation of another login attempt.
        attempt.generation=pState.authorityGeneration;attempt.phase='signing-out';
        pState.loginAttempt=attempt;pState.loginLoading=true;pState.page='login';
        try{await pb.auth.signOut({ scope: "local" });}catch{/* Private state remains cleared offline. */}
        if(!owns())return;
        _loginFail(errorEl);
      } finally {
        if(owns()){pState.loginAttempt=null;pState.loginLoading=false;}
      }
      return;
    }

    /* ── LOGOUT ── */
    if (action === "logout") {
      cancelDialogs();
      pState.setupRouter?.clear();
      clearSensitiveState();
      pState.page          = "login";
      render();
      await pb.auth.signOut({ scope: "local" });return;
    }

    /* ── Open client detail ── */
    if (action === "open-client") {
      const client = pState.data.clients.find(c => String(c.id) === String(el.dataset.pId));
      if (!client) return;
      selectClient(client);
      pState.page           = "client-detail";
      pState.clientData     = {};
      render();
      if(await loadClientData(client))render(); return;
    }

    // Explicit recovery of a durable commercial intent; unresolved requests are
    // still blocked by the existing server operation protocol, never resent here.
    if(action==='reconcile-plan-config') {
      if(!['master_admin','portfolio_manager'].includes(pState.currentUser?.role) || !clientDataMatches(pState.selectedClient))return;
      const context=captureView(),client=pState.selectedClient,current=()=>viewCurrent(context,false);
      try {
        const intent=await pb.rpc('platform_config_intent',{p_client:client.id});
        if(!current())return;
        if(intent.error || !intent.data?.changes || !Number.isSafeInteger(intent.data.generation) || intent.data.generation<0)throw Error('Current entitlement intent could not be verified. Refresh status.');
        if(!intent.data.pending){notify.info('No pending commercial entitlement intent. Refresh status.');return;}
        if(!await updateClientConfig(client,intent.data.changes) || !current())return;
        const refreshed=await loadClientData(client);
        if(!current())return;
        render();
        const latest=pState.clientData.overhaul?.entitlement_intent;
        if(!refreshed || !clientDataMatches(client) || pState.clientData.overhaulError || latest?.generation!==intent.data.generation || latest?.pending!==false)throw Error('The requested plan generation is not confirmed by fresh server status. Refresh before retrying.');
        notify.success('Current plan entitlements verified with the Shop.');
      } catch(error) {if(current())notify.warning('Shop synchronization is not confirmed. Review the recorded request before retrying. '+error.message);}
      return;
    }

    /* Trusted subscription state update */
    if(action==='load-public-environment') {
      if(!clientDataMatches())return;
      const client=pState.selectedClient,request=pState.clientRequestGeneration;
      el.disabled=true;
      try {
        const {data,error}=await pb.functions.invoke('platform-provision',{body:{client_id:client.id,request_id:crypto.randomUUID(),action:'frontend-env',params:{}}});
        if(!current() || request!==pState.clientRequestGeneration)return;
        if(error || !data?.public_env)throw Error('Public configuration unavailable; check managed project access.');
        pState.clientData.publicEnv=data.public_env;render();
      }finally{el.disabled=false;}
      return;
    }
    if(action==='client-view') { pState.clientView=el.dataset.view;render();return; }
    if (action === 'suspend-client' || action === 'activate-client') {
      const client = pState.data.clients.find(c => c.id === Number(el.dataset.pId));
      if(!clientDataMatches(client))return;
      if (await updateClientConfig(client, { suspended: action === 'suspend-client' }) && current()) {
        await loadPlatform();
        if(!current())return;
        if(await loadClientData(pState.data.clients.find(c => c.id === client.id)))render();
      }
      return;
    }

    if (action === 'read-shop-config') {
      if(!clientDataMatches())return;
      const client=pState.selectedClient,request=++pState.clientRequestGeneration;
      const detail=pState.clientData={...pState.clientData,requestGeneration:request,loading:true};
      const readCurrent=()=>viewCurrent(eventContext,false) && request===pState.clientRequestGeneration;
      try {
        const { data, error } = await pb.functions.invoke('platform-config', { body: { client_id: client.id, action: 'read' } }).catch(()=>({error:true}));
        if(!readCurrent())return;
        detail.loading=false;
        if(error || !data?.config){detail._error='Shop configuration unavailable. Refresh status.';render();return;}
        detail.config={...client,...data.config,id:client.id};
        detail.verifiedAt = new Date().toISOString();render();
      } finally {
        // Clear only this request's owned loading state, never its successor's.
        if(pState.clientData===detail && request===pState.clientRequestGeneration && detail.loading){
          detail.loading=false;detail._error='Configuration read cancelled. Refresh status.';
        }
      }
      return;
    }
    if (action === 'refresh-paper') {
      await refreshPaperStatus(loadClientData,render);return;
    }
    if (action === 'refresh-operations') {
      const client=pState.selectedClient;if(!client)return;
      await loadPlatform();if(!current())return;
      if(await loadClientData(pState.selectedClient))render(); return;
    }
    if (action === 'paper-status') {
      if(!clientDataMatches())return;
      const client=pState.selectedClient;
      if(!['master_admin','portfolio_manager'].includes(pState.currentUser?.role))return;
      const request=pState.clientData.operations?.requests?.find(r=>r.request_id===el.dataset.id&&r.sync_version===Number(el.dataset.version));
      if(!request)return;
      pState.modal={type:'paper-decision',data:{client:client.id,request:request.request_id,version:request.sync_version,status:el.dataset.status}};
      render();return;
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
      if(!clientDataMatches())return;
      const client=pState.selectedClient;
      const field = toggleMap[action];
      const cfg   = pState.clientData.config || {};
      const next  = !cfg[field];
      if (field === 'paper_resupply_enabled') {
        await rpc('platform_set_paper', { p_client: pState.selectedClient.id, p_enabled: next });
      } else if (!await updateClientConfig(pState.selectedClient, { [field]: next })) return;
      if(!current())return;
      await loadPlatform();if(!current())return;
      if(await loadClientData(pState.data.clients.find(c => c.id === client.id)))render();
      return;
    }

    /* ── Generate invoice ── */
    if (action === "generate-invoice") {
      const clientId = Number(el.dataset.pId);
      const client    = pState.data.clients.find(c => c.id === clientId);
      const newInvoice = await generateInvoice(clientId);
      if(!current())return;
      await loadPlatform();if(current())render();
      if (current() && client && newInvoice) printClientInvoices(client, [newInvoice]);
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
      if(!client)return;selectClient(client);pState.page='client-detail';pState.modal=null;
      if(await loadClientData(client))render();return;
    }

    /* ── Edit platform user ── */
    if(action==='team-tab'){
      if(pState.currentUser.role!=='master_admin' || !['Active','Pending','Inactive','Archived'].includes(el.dataset.pTab))return;
      pState.teamTab=el.dataset.pTab;pState.filter='';pState.modal=null;render();
      document.getElementById('team-tab-'+pState.teamTab)?.focus();return;
    }
    if(action==='manage-platform-user'){
      if(pState.currentUser.role!=='master_admin')return;
      pState.modal={type:'manage-platform-user',data:{id:el.dataset.pId,archived:el.dataset.pArchived==='true'}};render();return;
    }
    if (action === "edit-platform-user") {
      if(pState.currentUser.role!=='master_admin')return;
      pState.modal = {
        type: "edit-platform-user",
        data: {
          requestId:crypto.randomUUID(),
          id:    el.dataset.pId,
          name:  el.dataset.pName,
          email: el.dataset.pEmail,
          role:  el.dataset.pRole,
        },
      };
      render(); return;
    }

    if (action === 'invitation-status') {
      const user=pState.data.platformUsers.find(u=>u.id===el.dataset.pId);if(!user)return;
      if(pState.currentUser?.role!=='master_admin' || user.status!=='Pending')return;
      const requestId=crypto.randomUUID();el.disabled=true;
      try {
        const operation=(pState.data.teamOperations || []).find(o=>o.target_id===user.id);
        if(operation || !user.auth_user_id){await showMessage({title:'Invitation needs review',message:teamStatus(user,operation).message});return;}
        const resend=await confirmDialog({title:'Invitation status',message:`${user.name}: ${teamStatus(user).message} Sending an email does not activate the employee.`,confirmLabel:'Resend invitation'});
        if(!resend || !current())return;
        const {data,error}=await pb.functions.invoke('resend-platform-invitation',{body:{id:user.id,request_id:requestId}});
        if(!current())return;
        if(error || data?.success!==true){const message=await teamErrorMessage(data,error,requestId);if(current())notify.error(message);}
        else notify.success(data.already_sent?'The setup email request was already recorded.':'Setup email requested. Delivery and link acceptance must still be verified.');
        await loadPlatform();if(current())render();
      }finally{if(el.isConnected)el.disabled=false;}
      return;
    }
    if(action==='clear-failed-invitation'){
      if(pState.currentUser.role!=='master_admin')return;
      const operation=(pState.data.teamOperations || []).find(o=>o.target_id===el.dataset.pId && o.request_id===el.dataset.pRequest && o.action==='create' && o.stage==='review_required');
      if(!operation)return;
      el.disabled=true;
      try{
        if(!await confirmDialog({title:'Clear Failed Invitation?',message:'The server will verify this exact failed creation request and that no matching Auth identity exists. It clears only the unused Pending reservation and retains the original audit evidence. It will not delete an Auth user or resend an invitation.',confirmLabel:'Clear Failed Invitation'}) || !current())return;
        const {data,error}=await pb.functions.invoke('clear-failed-platform-invitation',{body:{id:operation.target_id,request_id:operation.request_id,acknowledged:true}});
        if(!current())return;
        if(error || data?.success!==true){notify.error('Failed invitation could not be cleared. Auth absence, request ownership or the review waiting period could not be verified. Refresh and review the original request.');return;}
        notify.success(data.already_cleared?'This failed invitation was already cleared.':'Failed invitation cleared. Audit history retained; you may explicitly add a fresh invitation.',{duration:0});
        pState.modal=null;const refreshed=captureView();await loadPlatform();if(viewCurrent(refreshed))render();
      }finally{if(el.isConnected)el.disabled=false;}
      return;
    }
    /* ── Audited team lifecycle; server independently verifies every request. ── */
    if (['deactivate-platform-user','reactivate-platform-user','delete-platform-user','reconcile-platform-user'].includes(action)) {
      if (pState.currentUser.role !== "master_admin") {
        notify.error("Only Master Admin can manage team lifecycle."); return;
      }
      const user=pState.data.platformUsers.find(u=>u.id===el.dataset.pId);if(!user)return;
      const requestId=el.dataset.pRequest || crypto.randomUUID();el.disabled=true;
      let confirmation;
      try {
        const identity = await loadOperatorIdentity();
        if(!current() || identity.role!=='master_admin')return;
        const deletion=['delete-platform-user','reconcile-platform-user'].includes(action);
        if(deletion){
          confirmation=await deleteUserDialog({title:'Permanently Delete User',message:`${user.name} · ${user.email} · ${user.role}. This action permanently removes the user's Platform account and cannot be undone. Authorization is revoked first; an immutable archive is retained only after Auth absence is verified.`,accountEmail:identity.email,confirmLabel:action==='reconcile-platform-user'?'Verify deletion outcome':'Delete Permanently',captchaToken:()=>pState.turnstileToken,
            afterMount:()=>{void mountTurnstile({containerId:'team-delete-verification',statusId:'team-delete-verification-status',buttonSelector:'.platform-dialog [data-captcha-submit]'});},onClose:()=>cleanupTurnstile()});
          if(!confirmation)return;
        }else if(!await confirmDialog({title:action==='reactivate-platform-user'?'Reactivate employee?':'Deactivate employee?',message:action==='reactivate-platform-user'?`${user.name} (${user.email}) will regain access to their existing account and must sign in again. A Pending invitation will remain Pending.`:`${user.name} (${user.email}) will lose Platform authorization. Their Auth identity is retained and outstanding setup is cancelled.`,confirmLabel:action==='reactivate-platform-user'?'Reactivate':'Deactivate',danger:action!=='reactivate-platform-user'}))return;
        if(!current())return;
        const {data,error}=await pb.functions.invoke(deletion?'delete-platform-user':action,{body:{id:user.id,request_id:requestId,...(confirmation || {}),...(action==='reconcile-platform-user'?{reconcile:true}:{})}});
        if(!current())return;
        if(error || data?.success!==true){const message=await teamErrorMessage(data,error,requestId);if(!current())return;notify.error(message);await loadPlatform();if(current())render();return;}
        notify.success(deletion?'Employee permanently retired. Auth absence was verified and historical evidence retained.':action==='reactivate-platform-user'?'Employee reactivated with the existing identity. A fresh sign-in is required.':'Employee deactivated. Platform access is suspended and the existing identity is retained.',{duration:0});
        await loadPlatform(); if(current())render();
      } finally {if(confirmation){confirmation.password='';confirmation.captchaToken='';}if(el.isConnected)el.disabled=false;if(document.getElementById('verification-widget'))void mountTurnstile();}
      return;
    }

    if(action==='support-page'){
      el.disabled=true;
      try {await loadSupportPage(Number(el.dataset.offset));if(current())render();}finally{if(el.isConnected)el.disabled=false;}
      return;
    }
    /* ── Resolve support ticket ── */
    if (action === "resolve-ticket") {
      const ticket=(pState.supportView?.rows||[]).find(t=>t.id===Number(el.dataset.pId));
      if(!ticket)return;
      el.disabled=true;
      const resolution=document.getElementById('support-resolution-'+ticket.id)?.value.trim()||'';
      const { error } = await pb.rpc('platform_support_ticket_resolve',{p_ticket:ticket.id,p_revision:ticket.revision,p_resolution:resolution});
      if(el.isConnected)el.disabled=false;
      if(!current())return;
      if (error) { notify.error(error); return; }
      await loadPlatform(); if(!current())return;
      await loadSupportPage(pState.supportView?.offset||0); if(current())render(); return;
    }
    })().catch(error => {
      if(eventGeneration!==pState.authorityGeneration || (eventContext && !current()))return;
      if (pState.loginLoading) { pState.authenticated = false; pState.page = 'login'; pState.loginLoading = false; render(); }
      if (pState.resetLoading) { pState.resetLoading = false; resetTurnstile(); }
      notify.error(error);
    });
  });

  /* ── Input (filter + dynamic form) ── */
  document.addEventListener("input", event => {
    if (event.target.dataset.pFilter !== undefined) {
      const position=event.target.selectionStart;
      pState.filter = event.target.value; render();
      const input=document.querySelector('[data-p-filter]');input?.focus();if(input && position!==null && input.type!=='search')input.setSelectionRange(position,position);
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && document.getElementById('p-sidebar')?.classList.contains('open')){syncSidebar();document.getElementById('p-menu-btn')?.focus();return;}
    if(event.target.matches?.('.team-tab') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      const tabs=[...document.querySelectorAll('.team-tab')],at=tabs.indexOf(event.target);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      event.preventDefault();tabs[next]?.click();
    }
  });

  document.addEventListener("change", event => {
    if(event.target.matches?.('[data-byo-mode]')&&pState.byoWizard){pState.byoWizard.mode=['fresh','existing'].includes(event.target.value)?event.target.value:null;render();return;}
    if(event.target.matches?.('[data-byo-category]')&&pState.byoWizard){pState.byoWizard.category=event.target.value;pState.byoWizard.problemOpen=true;render();return;}
    if(event.target.matches?.('input[type="file"][name="enrollment"]')){
      const label=event.target.closest('.file-picker')?.querySelector('[data-file-name]');if(label)label.textContent=event.target.files?.[0]?.name||'No file selected';
    }
    if (event.target.id === "onboard-inv-select") {
      const rateField = document.getElementById("onboard-inv-rate-field");
      if (rateField) rateField.classList.toggle("hidden", event.target.value !== "true");
    }
  });
  document.addEventListener('input',event=>{const form=event.target.closest?.('form[data-p-form="add-client"]');if(form){rememberClientDraft(form);if(event.target.name==='plan'){const breaks=form.elements.ems_track_breaks;breaks.disabled=event.target.value!=='Pro Plus';if(breaks.disabled)breaks.value='false';rememberClientDraft(form)}}});

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
  window.addEventListener('resize',()=>{syncSidebar();});

  /* ── Session check every 60s ── */
  const recheck=()=>validateSession(render);
  setInterval(recheck, 60 * 1000);
  window.addEventListener("focus",recheck);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)recheck();});
}

/* ── Login failure helper ── */
function _loginFail(errorEl, keepMsg = false) {
  pState.loginLoading   = false;
  pState.turnstileToken = null;
  const message = keepMsg ? errorEl?.textContent : "Unable to sign in. Please check your credentials. If your account has been suspended, contact your administrator.";
  resetTurnstile();
  if (errorEl) errorEl.textContent = message;
  if (!keepMsg) {
    const el = document.getElementById("platform-pin-error");
    if (el) el.textContent = "Unable to sign in. Please check your credentials. If your account has been suspended, contact your administrator.";
  }
  document.getElementById("platform-pin-error")?.classList.remove("hidden");
}
