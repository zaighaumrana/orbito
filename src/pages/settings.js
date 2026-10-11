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

    ${teamSections(platformUsers)}`;
}

function teamSections(users) {
  const operations=pState.data.teamOperations || [];
  const button=(action,u,label,request='')=>`<button class="${action==='delete-platform-user'?'danger-button':'secondary-button'}" data-p-action="${action}" data-p-id="${esc(u.id)}" ${request?`data-p-request="${esc(request)}"`:''}>${label}</button>`;
  const role=u=>u.role==='billing_person'?'Billing Person':'Portfolio Manager';
  const rows=status=>users.filter(u=>u.status===status).map(u=>{
    const op=operations.find(o=>o.target_id===u.id);
    let actions='';
    if(!op && status==='Active')actions=`<button class="secondary-button" data-p-action="edit-platform-user" data-p-id="${esc(u.id)}" data-p-name="${esc(u.name)}" data-p-email="${esc(u.email)}" data-p-role="${esc(u.role)}">Edit</button>`;
    if(status==='Pending')actions+=button('invitation-status',u,'View invitation status');
    if(!op && ['Active','Pending'].includes(status))actions+=button('deactivate-platform-user',u,'Deactivate');
    if(status==='Inactive' && !op && u.suspended_from)actions+=button('reactivate-platform-user',u,'Reactivate');
    if(op && ['reactivate','invite_setup'].includes(op.action))actions+=button('deactivate-platform-user',u,'Cancel setup');
    if(op?.action==='delete')actions+=button('reconcile-platform-user',u,'Verify deletion outcome',op.request_id);
    else if(!op || ['reactivate','invite_setup'].includes(op.action))actions+=button('delete-platform-user',u,'Delete Permanently');
    const note=op?`${op.action}: ${op.stage}. Request ${op.request_id}`:status==='Inactive' && !u.suspended_from?'Legacy inactive record: Auth identity requires review; reactivation is unavailable.':'';
    return `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${role(u)}</td><td>${esc(u.created_at?new Date(u.created_at).toLocaleDateString():'Unknown')}</td><td><div class="team-actions">${actions}</div><p class="muted">${esc(note)}</p></td></tr>`;
  }).join('');
  return `<section class="card"><div class="team-heading"><div><h2>Team Members</h2><p class="muted">Access and retained history</p></div><button class="primary-button" data-p-modal="add-platform-user">+ Add User</button></div>
    ${[['Active','Active Users'],['Pending','Pending Invitations'],['Inactive','Inactive Users']].map(([status,title])=>`<section aria-label="${title}"><h3>${title}</h3><p class="muted">${status==='Pending'?'Invitations remain Pending until verified password setup.':status==='Inactive'?'Reactivate sends recovery to the existing account. Access remains Inactive until password setup succeeds.':'Currently authorized employees.'}</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th>Actions / operation status</th></tr></thead><tbody>${rows(status) || '<tr><td colspan="5">No members in this section.</td></tr>'}</tbody></table></div></section>`).join('')}
    <section aria-label="Archived Users"><h3>Archived Users</h3><p class="muted">Permanent, read-only history. Archived accounts cannot be restored or reinvited through ordinary team controls.</p><div class="table-wrap"><table><thead><tr><th>Name / email</th><th>Previous role</th><th>Retained identity</th><th>Joined / deleted</th><th>Deletion evidence</th></tr></thead><tbody>${(pState.data.teamArchive || []).map(u=>`<tr><td>${esc(u.name)}<br>${esc(u.email)}</td><td>${role(u)}</td><td>${esc(u.id)}<br>${esc(u.auth_user_id || 'Legacy unlinked')}</td><td>${esc(u.joined_at || 'Unknown')}<br>${esc(u.deleted_at)}</td><td>${esc(u.final_status)}<br>Administrator: ${esc(u.deleted_by)}<br>Request: ${esc(u.operation_id)}<br>${esc(u.reason || '')}</td></tr>`).join('') || '<tr><td colspan="5">No archived members.</td></tr>'}</tbody></table></div></section></section>`;
}
