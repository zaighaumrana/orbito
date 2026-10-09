import { pState, PCFG } from "../state.js";
import { tit } from "../helpers.js";
import { esc } from '../operations.js';

export function pageSettings() {
  const role          = pState.currentUser.role;
  const isMaster      = role === "master_admin";
  const platformUsers = pState.data.platformUsers || [];
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
    ${tit("Platform Settings", "Credentials and team management.", "")}
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">

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
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <h2>Team Members</h2>
          <p class="muted" style="font-size:13px;margin-top:3px">
            Billing Persons and Portfolio Managers
          </p>
        </div>
        <button class="primary-button" data-p-modal="add-platform-user">+ Add User</button>
      </div>
      ${platformUsers.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${platformUsers.map(u => `<tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.email}</td>
            <td>
              <span class="badge ${u.role === "billing_person" ? "good" : "warn"}">
                ${u.role === "billing_person" ? "Billing Person" : "Portfolio Manager"}
              </span>
            </td>
            <td><span class="badge ${u.status === "Pending" ? "warn" : "good"}">${u.status || "Active"}</span></td>
            <td style="font-size:12px">${new Date(u.created_at).toLocaleDateString()}</td>
            <td style="display:flex;gap:6px">
              <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                data-p-action="edit-platform-user"
                data-p-id="${u.id}"
                data-p-name="${u.name}"
                data-p-email="${u.email}"
                data-p-role="${u.role}">
                Edit
              </button>
              <button class="danger-button" style="font-size:12px;padding:4px 10px"
                data-p-action="remove-platform-user" data-p-id="${u.id}">
                Remove
              </button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>` : `
      <div class="empty">No team members yet.</div>`}
    </div>`;
}
