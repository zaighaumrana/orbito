import {routePath} from './client-routes.js';
import { cleanupTurnstile, mountTurnstile } from './turnstile.js';
import { pState, PCFG, getNav } from "./state.js";
import { pModal }        from "./modals/index.js";
import { pageOverview }  from "./pages/overview.js";
import { pageClients, pageClientDetail } from "./pages/clients.js";
import { pageBilling }   from "./pages/billing.js";
import { pageSupport }   from "./pages/support.js";
import { pageSettings }  from "./pages/settings.js";
import { pageTeam } from './pages/team.js';
import { teamRoles } from './team.js';
import { esc } from './operations.js';
import { captureView, viewCurrent } from './async-context.js';
import { syncModalFocus, resetModalFocus } from './modal-focus.js';
import {hydratePaperDelivery} from './paper-delivery.js';

let editView;
export function syncSidebar(open=false) {
  const sidebar=document.getElementById('p-sidebar'),menu=document.getElementById('p-menu-btn');
  if(!sidebar?.classList)return;
  const mobile=window.innerWidth<=1180;
  sidebar.classList.toggle('open',mobile && open);sidebar.inert=mobile && !open;
  if(mobile && !open)sidebar.setAttribute('aria-hidden','true');else sidebar.removeAttribute('aria-hidden');
  menu?.setAttribute('aria-expanded',String(mobile && open));
}

const verification = () => `<div class="auth-verification"><div id="verification-widget"></div><p id="verification-status" class="muted" role="status" aria-live="polite"></p><button type="button" class="secondary-button" data-p-action="retry-verification">Retry verification</button></div>`;

// ── Role-gated page router ────────────────────────────────────────
function platformPage() {
  const ownSettings=pState.page==='settings' && ['portfolio_manager','billing_person'].includes(pState.currentUser.role);
  if(pState.dataError && !ownSettings)return `<div class="card" role="alert">${esc(pState.dataError)} <button class="secondary-button" data-p-action="reload-platform">Refresh</button></div>`;
  if(pState.dataReady===false && !ownSettings)return '<div class="card" role="status">Loading authorized Platform data…</div>';
  const role    = pState.currentUser.role;
  const blocked = () => `
    <div class="empty" style="min-height:300px">
      <div>
        <p style="font-size:18px">🔒 Access Restricted</p>
        <p class="muted" style="margin-top:8px">Your role does not have access to this section.</p>
      </div>
    </div>`;

  if (role === "billing_person" &&
      ["clients","client-detail","support"].includes(pState.page)) return blocked();
  if (role === "portfolio_manager" &&
      ["billing"].includes(pState.page)) return blocked();
  if(pState.page==='team' && role!=='master_admin')return blocked();

  switch (pState.page) {
    case "overview":      return pageOverview();
    case "clients":       return pageClients();
    case "client-detail": return pageClientDetail();
    case "billing":       return pageBilling();
    case "support":       return pageSupport();
    case "settings":      return pageSettings();
    case "team":          return pageTeam();
    default:              return pageOverview();
  }
}

// Official artwork is served unchanged from stable public paths.
const brand = () => `<div class="brand-lockup"><img class="brand-light" src="/brand/logos/retrasell-horizontal-primary.svg" alt="RetraSell" width="1340" height="470"><img class="brand-dark" src="/brand/logos/retrasell-horizontal-reversed.svg" alt="RetraSell" width="1340" height="470"></div>`;
function authFrame(content) {
  return `<main class="auth-layout"><aside class="auth-brand"><img src="/brand/logos/retrasell-horizontal-reversed.svg" alt="RetraSell" width="1340" height="470"><div><p class="eyebrow">Platform Console</p><h1>A clear view.<br>Confident control.</h1><p>Manage clients, billing and employee access from your secure Platform workspace.</p></div><p class="auth-brand-footer">Authorized operators only</p></aside><section class="auth-content"><button class="secondary-button auth-theme" data-p-action="theme" aria-label="Switch to ${pState.theme==='dark'?'light':'dark'} theme">${pState.theme==='dark'?'☀ Light':'◑ Dark'}</button><div class="auth-card">${brand()}${content}</div><p class="auth-footer">RetraSell Platform · Secure account access</p></section></main>`;
}
function loginPage() {
  return authFrame(`<form data-auth-form="login" method="post" class="auth-form"><div class="auth-heading"><p class="eyebrow">Welcome back</p><h2>Sign in to your workspace</h2><p class="muted">Use your authorized Platform account.</p></div><label class="field"><span>Username or email</span><input id="platform-username" name="username" type="text" autocomplete="username" placeholder="Enter username or email" required></label><label class="field"><span>Password</span><input id="platform-pin" name="password" type="password" autocomplete="current-password" aria-describedby="platform-pin-error" placeholder="Enter your password" required></label>${verification()}<div id="platform-pin-error" class="auth-status is-error hidden" role="alert">Unable to sign in. Please check your credentials. If your account has been suspended, contact your administrator.</div><button type="submit" class="primary-button" data-p-action="do-login" data-captcha-submit disabled ${pState.loginLoading?'aria-busy="true"':''}>${pState.loginLoading?'Signing in…':'Sign in'}</button><button type="button" class="text-button" data-p-action="show-forgot-password">Forgot password?</button><p class="muted auth-protection">Protected by Cloudflare Turnstile</p></form>`);
}
function forgotPasswordPage() {
  return authFrame(`<form data-auth-form="forgot-password" method="post" class="auth-form"><div class="auth-heading"><p class="eyebrow">Account recovery</p><h2>Reset your password</h2><p class="muted">If recovery is available for your account, you can request a secure link.</p></div><label class="field"><span>Account email</span><input id="forgot-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>${verification()}<div id="forgot-status" class="auth-status hidden" role="status" aria-live="polite"></div><button type="submit" class="primary-button" data-p-action="send-reset-link" data-captcha-submit disabled ${pState.resetLoading?'aria-busy="true"':''}>${pState.resetLoading?'Sending…':'Send reset link'}</button><button type="button" class="text-button" data-p-action="back-to-login">← Back to sign in</button></form>`);
}
function resetPasswordPage() {
  return authFrame(`<form data-auth-form="reset-password" method="post" class="auth-form"><div class="auth-heading"><p class="eyebrow">Secure account setup</p><h2>Set your new password</h2><p class="muted">Complete password setup for your verified account.</p></div><label class="field"><span>Account email</span><input name="username" type="email" autocomplete="username" readonly value="${esc(pState.recoveryEmail || '')}"></label><label class="field"><span>New password</span><input id="reset-newpass" name="newpass" type="password" autocomplete="new-password" required aria-describedby="password-requirements"><small id="password-requirements" class="muted">At least 8 characters, an uppercase letter, a number and a symbol.</small></label><label class="field"><span>Confirm new password</span><input id="reset-confirm" name="confirm" type="password" autocomplete="new-password" required></label><div id="reset-status" class="auth-status hidden" role="status" aria-live="polite"></div><button type="submit" class="primary-button" data-p-action="confirm-reset-password">Update password</button></form>`);
}

// ── Main render ───────────────────────────────────────────────────
export function render() {
  const app = document.getElementById("platform-app");
  if (!app) return;
  const previousFocus=document.activeElement;
  // Background reads may redraw details, but must retain the actual unsaved form.
  // A departed authority/view/client/modal can never retain its private DOM.
  const editRoot=editView && viewCurrent(editView) && pState.modal?.type==='edit-client'
    ? app.querySelector?.('form[data-p-form="edit-client"]')?.closest('.modal-backdrop') : null;
  const active=editRoot?.contains(document.activeElement)?document.activeElement:null;
  const selection=active && Number.isInteger(active.selectionStart)
    ? [active.selectionStart,active.selectionEnd,active.selectionDirection] : null;
  cleanupTurnstile();
  document.documentElement.dataset.theme = pState.theme;
  /* Sync URL with current page state */
  if (pState.authenticated) {
    const target = routePath();
    if (window.location.pathname+window.location.search !== target) {
      history.pushState({ page: pState.page }, "", target);
    }
  }

  if (!pState.authenticated) {
    editView=null;
    resetModalFocus();
    if (pState.authRouting) {
      app.innerHTML='<main class="auth-wait" role="status" style="padding:32px">Verifying your account…</main>';
      return;
    }
    if (pState.page === 'setup-error') {
      app.innerHTML=authFrame(`<section class="auth-form" role="alert"><h2>Account setup unavailable</h2><p>${esc(pState.setupMessage || 'Account verification failed.')}</p><button class="secondary-button" data-p-action="retry-setup">Retry verification</button><button class="secondary-button" data-p-action="back-to-login">Return to login</button></section>`);
      return;
    }
    if (pState.page === "forgot-password") {
      app.innerHTML = forgotPasswordPage();
      void mountTurnstile();
      return;
    }
    if (pState.page === "reset-password") {
      app.innerHTML = resetPasswordPage();
      return;
    }
    app.innerHTML = loginPage();
    void mountTurnstile();
    return;
  }

  const nav = getNav();

  app.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to content</a><div class="platform-shell">
      <aside class="platform-sidebar" id="p-sidebar">
        <div class="sidebar-brand"><img src="/brand/logos/retrasell-horizontal-reversed.svg" alt="RetraSell" width="1340" height="470"><span>Platform Console</span></div>
        <button class="secondary-button sidebar-close" data-p-action="toggle-sidebar">Close navigation</button>
        <nav class="platform-nav" aria-label="Platform navigation">
          ${nav.map(n => `
            <button class="platform-nav-btn ${
              pState.page === n.page ||
              (pState.page === "client-detail" && n.page === "clients") ? "active" : ""}"
              ${pState.page===n.page || pState.page==='client-detail' && n.page==='clients'?'aria-current="page"':''} data-p-page="${n.page}">
              <span>${n.icon}</span><span>${n.label}</span>
            </button>`).join("")}
        </nav>
        <div class="sidebar-account"><p class="sidebar-caption">Signed in as</p><strong>${esc(pState.currentUser.username || PCFG.admin_username || 'Administrator')}</strong><span class="sidebar-role">${esc(teamRoles[pState.currentUser.role] || 'Unverified role')}</span><button class="platform-nav-btn sidebar-logout" data-p-action="logout"><span aria-hidden="true">⏻</span><span>Sign out</span></button></div>
      </aside>

      <div class="platform-main">
        <header class="platform-topbar">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="icon-button" id="p-menu-btn" aria-label="Toggle navigation" aria-controls="p-sidebar"
              style="display:none" data-p-action="toggle-sidebar">☰</button>
            <span class="compact-brand"><img class="brand-light" src="/brand/logos/retrasell-icon-primary.svg" alt="RetraSell" width="36" height="36"><img class="brand-dark" src="/brand/logos/retrasell-icon-reversed.svg" alt="RetraSell" width="36" height="36"></span>
            <h2 style="font-size:16px;color:var(--muted)">
              ${pState.page === "client-detail" && pState.selectedClient
                ? `Clients — ${esc(pState.selectedClient.name)}`
                : nav.find(n => n.page === pState.page)?.label || "Platform"}
            </h2>
          </div>
          <div class="top-actions">
            <span class="chip">
              <i class="dot ${pState.online ? "" : "offline"}"></i>
              ${pState.online ? "Online" : "Offline"}
            </span>
            <span class="chip">${pState.data.clients.length} clients</span>
            <button class="icon-button" data-p-action="theme">
              ${pState.theme === "dark" ? "☀ Light" : "◑ Dark"}
            </button>
          </div>
        </header>
        <main class="content" id="main-content">${pState.routeError?`<p role="alert">${esc(pState.routeError)}</p>`:""}${platformPage()}</main>
      </div>
    </div>
    ${pModal()}
  `;

  if(editRoot){
    app.querySelector('form[data-p-form="edit-client"]')?.closest('.modal-backdrop')?.replaceWith(editRoot);
    active?.focus({preventScroll:true});
    if(selection)active.setSelectionRange(...selection);
  }
  editView=pState.modal?.type==='edit-client'?captureView():null;
  hydrateClientDraft();
  hydratePaperDelivery();
  syncModalFocus(app,()=>{pState.modal=null;render();},previousFocus);

  if(pState.modal?.type==='master-continuity')void mountTurnstile({containerId:'diagnostic-verification',statusId:'diagnostic-status',buttonSelector:'[data-diagnostic-submit]'});
  else if (document.getElementById("verification-widget")) void mountTurnstile();
  const menuBtn = document.getElementById("p-menu-btn");
  if (menuBtn && window.innerWidth <= 1180) menuBtn.style.display = "inline-flex";
  syncSidebar();
}
import {hydrateClientDraft} from './wizard-controller.js';
