import { pState, PCFG, getNav } from "./state.js";
import { pModal }        from "./modals/index.js";
import { pageOverview }  from "./pages/overview.js";
import { pageClients, pageClientDetail } from "./pages/clients.js";
import { pageBilling }   from "./pages/billing.js";
import { pageSupport }   from "./pages/support.js";
import { pageSettings }  from "./pages/settings.js";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_KEY;

// ── Role-gated page router ────────────────────────────────────────
function platformPage() {
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

  switch (pState.page) {
    case "overview":      return pageOverview();
    case "clients":       return pageClients();
    case "client-detail": return pageClientDetail();
    case "billing":       return pageBilling();
    case "support":       return pageSupport();
    case "settings":      return pageSettings();
    default:              return pageOverview();
  }
}

// ── Login page ────────────────────────────────────────────────────
function loginPage() {
  return `
    <div style="min-height:100vh;display:grid;place-items:center;background:#0d1714">
      <div class="card" style="width:min(400px,92vw);display:grid;gap:18px;padding:36px;
                               background:#151f1c;border-color:#1e3830">
        <div style="text-align:center">
          <div class="platform-logo" style="margin:0 auto 16px;width:56px;height:56px;font-size:18px">
            RA
          </div>
          <h2 style="color:#f3f7fa;font-size:22px">RetailOS Platform</h2>
          <p style="color:#5c9986;font-size:14px;margin-top:4px">Authorised access only</p>
        </div>
        <label class="field">
          <span style="color:#7aada0;font-size:13px">Username</span>
          <input id="platform-username" type="text" class="search" autocomplete="username"
            placeholder="Enter username"
            style="background:#0d1714;border-color:#1e3830;color:#f3f7fa;font-size:15px">
        </label>
        <label class="field">
          <span style="color:#7aada0;font-size:13px">Password</span>
          <input id="platform-pin" type="password" class="search" autocomplete="current-password"
            placeholder="Enter password"
            style="background:#0d1714;border-color:#1e3830;color:#f3f7fa;font-size:15px">
        </label>
        <div style="display:flex;justify-content:center">
          <div class="cf-turnstile"
            data-sitekey="${TURNSTILE_SITE_KEY}"
            data-callback="onTurnstileSuccess"
            data-theme="dark">
          </div>
        </div>
        <div id="platform-pin-error" class="hidden"
          style="color:#c24132;text-align:center;font-size:13px;
                 background:rgba(194,65,50,0.1);padding:10px;border-radius:8px">
          Invalid username or password.
        </div>
        <button class="primary-button" data-p-action="do-login"
          style="min-height:48px;font-size:16px;
                 ${pState.loginLoading ? "opacity:0.6;pointer-events:none" : ""}">
          ${pState.loginLoading ? "Signing in…" : "Login"}
        </button>

        <button type="button" data-p-action="show-forgot-password"
          style="background:none;border:none;color:#7aada0;font-size:13px;
                 text-align:center;cursor:pointer;text-decoration:underline">
          Forgot password?
        </button>

        <p style="text-align:center;font-size:12px;color:#3d6659;margin:0">
          Protected by Cloudflare Turnstile
        </p>
      </div>
    </div>`;
}

function forgotPasswordPage() {
  return `
    <div style="min-height:100vh;display:grid;place-items:center;background:#0d1714">
      <div class="card" style="width:min(400px,92vw);display:grid;gap:18px;padding:36px;
                               background:#151f1c;border-color:#1e3830">
        <div style="text-align:center">
          <h2 style="color:#f3f7fa;font-size:20px">Reset Password</h2>
          <p style="color:#5c9986;font-size:13px;margin-top:6px">
            Enter your email. If an account exists, a reset link will be sent.
          </p>
        </div>

        <label class="field">
          <span style="color:#7aada0;font-size:13px">Email</span>
          <input id="forgot-email" type="email" class="search" autocomplete="email"
            placeholder="your@email.com"
            style="background:#0d1714;border-color:#1e3830;color:#f3f7fa;font-size:15px">
        </label>

        <div id="forgot-status" class="hidden"
          style="text-align:center;font-size:13px;padding:10px;border-radius:8px"></div>

        <button class="primary-button" data-p-action="send-reset-link"
          style="min-height:48px;font-size:16px;
                 ${pState.resetLoading ? "opacity:0.6;pointer-events:none" : ""}">
          ${pState.resetLoading ? "Sending…" : "Send Reset Link"}
        </button>

        <button type="button" data-p-action="back-to-login"
          style="background:none;border:none;color:#7aada0;font-size:13px;
                 text-align:center;cursor:pointer;text-decoration:underline">
          ← Back to login
        </button>
      </div>
    </div>`;
}

function resetPasswordPage() {
  return `
    <div style="min-height:100vh;display:grid;place-items:center;background:#0d1714">
      <div class="card" style="width:min(400px,92vw);display:grid;gap:18px;padding:36px;
                               background:#151f1c;border-color:#1e3830">
        <div style="text-align:center">
          <h2 style="color:#f3f7fa;font-size:20px">Set New Password</h2>
          <p style="color:#5c9986;font-size:13px;margin-top:6px">
            Choose a strong new password to finish.
          </p>
        </div>

        <label class="field">
          <span style="color:#7aada0;font-size:13px">New Password</span>
          <input id="reset-newpass" type="password" class="search" autocomplete="new-password"
            placeholder="Min 8 chars, letter + number + symbol"
            style="background:#0d1714;border-color:#1e3830;color:#f3f7fa;font-size:15px">
        </label>

        <label class="field">
          <span style="color:#7aada0;font-size:13px">Confirm Password</span>
          <input id="reset-confirm" type="password" class="search" autocomplete="new-password"
            style="background:#0d1714;border-color:#1e3830;color:#f3f7fa;font-size:15px">
        </label>

        <div id="reset-status" class="hidden"
          style="text-align:center;font-size:13px;padding:10px;border-radius:8px"></div>

        <button class="primary-button" data-p-action="confirm-reset-password"
          style="min-height:48px;font-size:16px">
          Update Password
        </button>
      </div>
    </div>`;
}

export function initTurnstile() {
  window.onTurnstileSuccess = (token) => { pState.turnstileToken = token; };
  if (window.turnstile) {
    const widget = document.querySelector(".cf-turnstile");
    if (widget) {
      window.turnstile.render(widget, {
        sitekey:  TURNSTILE_SITE_KEY,
        callback: (token) => { pState.turnstileToken = token; },
        theme:    "dark",
      });
    }
  }
}

// ── Main render ───────────────────────────────────────────────────
export function render() {
  const app = document.getElementById("platform-app");
  if (!app) return;
  document.documentElement.dataset.theme = pState.theme;
  /* Sync URL with current page state */
  if (pState.authenticated) {
    const urlMap = {
      "overview":      "/",
      "clients":       "/clients",
      "client-detail": "/clients",
      "billing":       "/billing",
      "support":       "/support",
      "settings":      "/settings",
    };
    const target = urlMap[pState.page] || "/";
    if (window.location.pathname !== target) {
      history.pushState({ page: pState.page }, "", target);
    }
  }

  if (!pState.authenticated) {
    if (pState.page === "forgot-password") {
      app.innerHTML = forgotPasswordPage();
      return;
    }
    if (pState.page === "reset-password") {
      app.innerHTML = resetPasswordPage();
      return;
    }
    app.innerHTML = loginPage();
    initTurnstile();
    return;
  }

  const nav = getNav();

  app.innerHTML = `
    <div class="platform-shell">
      <aside class="platform-sidebar" id="p-sidebar">
        <div class="brand" style="padding:4px 0 14px">
          <div class="platform-logo">RA</div>
          <div>
            <strong style="color:#f3f7fa;font-size:15px">RetailOS</strong>
            <span style="color:#5c9986;font-size:12px;display:block">Platform Console</span>
          </div>
        </div>
        <nav class="platform-nav">
          ${nav.map(n => `
            <button class="platform-nav-btn ${
              pState.page === n.page ||
              (pState.page === "client-detail" && n.page === "clients") ? "active" : ""}"
              data-p-page="${n.page}">
              <span>${n.icon}</span><span>${n.label}</span>
            </button>`).join("")}
        </nav>
        <div style="margin-top:auto;padding-top:14px;border-top:1px solid #1e3830">
          <div style="color:#4a7a6e;font-size:12px;padding:6px 12px">
            Signed in as
            <strong style="color:#7aada0">
              ${pState.currentUser.username || PCFG.admin_username || "admin"}
            </strong>
            ${pState.currentUser.role !== "master_admin" ? `
            <span style="display:block;font-size:11px;margin-top:2px;color:#3d6659">
              ${pState.currentUser.role === "billing_person" ? "Billing Person" : "Portfolio Manager"}
            </span>` : ""}
          </div>
          <button class="platform-nav-btn" data-p-action="logout" style="color:#c24132">
            <span>⏻</span><span>Logout</span>
          </button>
        </div>
      </aside>

      <div class="platform-main">
        <header class="platform-topbar">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="icon-button" id="p-menu-btn"
              style="display:none" data-p-action="toggle-sidebar">☰</button>
            <h2 style="font-size:16px;color:var(--muted)">
              ${pState.page === "client-detail" && pState.selectedClient
                ? `Clients — ${pState.selectedClient.name}`
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
        <section class="content">${platformPage()}</section>
      </div>
    </div>
    ${pModal()}
  `;

  const menuBtn = document.getElementById("p-menu-btn");
  if (menuBtn && window.innerWidth <= 1180) menuBtn.style.display = "inline-flex";
}
