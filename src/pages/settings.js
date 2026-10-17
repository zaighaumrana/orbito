import { pState, PCFG } from "../state.js";
import { tit } from "../helpers.js";
import { esc } from '../operations.js';

export function pageSettings() {
  const role          = pState.currentUser.role;
  const isMaster      = role === "master_admin";
  const accountField = `<label class="field"><span>Account</span><input name="username" type="text" autocomplete="username" readonly value="${esc(pState.currentUser.email || pState.currentUser.username || '')}"></label>`;

  /* Non-master roles: password change only */
  if (!isMaster) {
    return `
      ${tit("Settings", "Manage your account.", "")}
      <div style="max-width:420px">
        <div class="card" style="display:grid;gap:14px">
          <h2>Change Password</h2>
          <form data-p-form="change-own-password" method="post" style="display:grid;gap:10px">
            ${accountField}
            <label class="field">
              <span>Current Password</span>
              <input name="current" type="password" autocomplete="current-password">
            </label>
            <label class="field">
              <span>New Password</span>
              <input name="newpass" type="password" autocomplete="new-password"
                placeholder="Min 8 chars, letter + number + symbol">
            </label>
            <label class="field">
              <span>Confirm New Password</span>
              <input name="confirm" type="password" autocomplete="new-password">
            </label>
            <button class="primary-button">Update Password</button>
          </form>
        </div>
      </div>`;
  }

  /* Master admin: full settings */
  return `
    ${tit("Platform Settings", "Your account, verification and platform information.", "")}
    <div class="grid settings-grid">

      <div class="card" style="display:grid;gap:14px">
        <h2>Change Username</h2>
        <form data-p-form="change-username" method="post" style="display:grid;gap:10px">
          ${accountField}
          <label class="field">
            <span>Current Password (to confirm)</span>
            <input name="current" type="password" autocomplete="current-password">
          </label>
          <label class="field">
            <span>New Username</span>
            <input name="new_username" type="text" autocomplete="off" value="${esc(PCFG.admin_username || '')}">
          </label>
          <div id="verification-widget" class="verification-widget"></div>
          <p id="verification-status" class="muted" role="status">Complete fresh verification to confirm your password.</p>
          <button type="button" class="secondary-button" data-p-action="retry-verification">Retry verification</button>
          <button type="submit" class="primary-button" data-captcha-submit disabled>Update Username</button>
        </form>
      </div>

      <div class="card" style="display:grid;gap:14px">
        <h2>Change Password</h2>
        <form data-p-form="change-password" method="post" style="display:grid;gap:10px">
          ${accountField}
          <label class="field">
            <span>Current Password</span>
            <input name="current" type="password" autocomplete="current-password">
          </label>
          <label class="field">
            <span>New Password</span>
            <input name="newpass" type="password" autocomplete="new-password">
          </label>
          <label class="field">
            <span>Confirm New Password</span>
            <input name="confirm" type="password" autocomplete="new-password">
          </label>
          <button class="primary-button">Update Password</button>
        </form>
      </div>

      <div class="card" style="display:grid;gap:8px">
        <h2>Platform Info</h2>
        <div class="list-row">
          <span class="muted">Total Clients</span>
          <strong>${pState.data.clients.length}</strong>
        </div>
        <div class="list-row">
          <span class="muted">Active</span>
          <strong>${pState.data.clients.filter(c => c.status === "Active").length}</strong>
        </div>
        <div class="list-row">
          <span class="muted">Archived</span>
          <strong>${pState.data.clients.filter(c => c.status === "Archived").length}</strong>
        </div>
        <div class="list-row">
          <span class="muted">Open Tickets</span>
          <strong>${pState.data.support.filter(s => s.status === "Open").length}</strong>
        </div>
        <hr class="divider"><h3>Master session continuity</h3>
        <p class="muted">A non-destructive diagnostic checks temporary password verification, cleanup and the original session's refresh. Single-session Auth settings may sign you out. This never enables permanent deletion.</p>
        <button class="secondary-button" data-p-modal="master-continuity">Check session continuity</button>
      </div>
    </div>`;
}
