import { esc } from '../operations.js';
import { pState } from '../state.js';
import { teamRoles,teamStatus } from '../team.js';
export function userModals(type, md) {
  if(!pState.authenticated || pState.currentUser.role!=='master_admin')return null;
  if(type==='master-continuity')return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="continuity-title"><div class="team-heading"><h2 id="continuity-title">Master session diagnostic</h2><button class="icon-button" aria-label="Close diagnostic" data-p-close>×</button></div><p>This creates and cleans up one temporary Auth session, then checks the original session and refresh. Single-session settings may sign you out. No employee, password, deletion policy or account configuration is changed.</p><form data-p-form="master-continuity" method="post" class="grid"><label class="field"><span>Administrator account</span><input name="username" autocomplete="username" readonly value="${esc(pState.currentUser.email)}"></label><label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required maxlength="256"></label><div id="diagnostic-verification"></div><p id="diagnostic-status" role="status" class="muted"></p><button type="button" class="secondary-button" data-p-action="retry-diagnostic-verification">Retry verification</button><div class="modal-actions"><button class="secondary-button" type="button" data-p-close>Cancel</button><button type="submit" class="primary-button" data-diagnostic-submit disabled>Run diagnostic</button></div></form></section></div>`;
  if(type==='manage-platform-user') {
    const archived=md.archived===true;
    const u=(archived?pState.data.teamArchive:pState.data.platformUsers)?.find(u=>u.id===md.id);if(!u)return null;
    const op=(pState.data.teamOperations || []).find(o=>o.target_id===u.id),status=teamStatus(u,op);
    const button=(action,label,danger=false,request='')=>`<button class="${danger?'danger-button':'secondary-button'}" data-p-action="${action}" data-p-id="${esc(u.id)}" ${request?`data-p-request="${esc(request)}"`:''}>${label}</button>`;
    let actions='';
    if(!archived){
      if(!op && u.status==='Active')actions+=`<button class="secondary-button" data-p-action="edit-platform-user" data-p-id="${esc(u.id)}" data-p-name="${esc(u.name)}" data-p-email="${esc(u.email)}" data-p-role="${esc(u.role)}">Edit employee</button>`;
      if(u.status==='Pending')actions+=button('invitation-status','View invitation status');
      if(op?.action==='create' && op.stage==='review_required')actions+=button('clear-failed-invitation','Clear Failed Invitation',false,op.request_id);
      if(!op && ['Active','Pending'].includes(u.status) && u.auth_user_id)actions+=button('deactivate-platform-user','Deactivate');
      if(!op && u.status==='Inactive' && u.suspended_from)actions+=button('reactivate-platform-user','Reactivate');
      if(op && ['reactivate','invite_setup'].includes(op.action))actions+=button('deactivate-platform-user','Cancel setup');
      if(op?.action==='delete')actions+=button('reconcile-platform-user','Verify deletion outcome',false,op.request_id);
      else if((!op || ['reactivate','invite_setup'].includes(op.action)) && !(u.status==='Pending' && !u.auth_user_id))actions+=button('delete-platform-user','Delete Permanently',true);
    }
    return `<div class="modal-backdrop"><section class="modal employee-detail" role="dialog" aria-modal="true" aria-labelledby="employee-title"><div class="team-heading"><div><p class="eyebrow">${archived?'Retained evidence':'Employee access'}</p><h2 id="employee-title">${esc(u.name)}</h2></div><button class="icon-button" aria-label="Close employee details" data-p-close>×</button></div><p class="muted">${esc(u.email)}</p><div class="team-heading"><strong>${esc(teamRoles[u.role])}</strong><span class="badge ${status.tone}">${archived?'Archived':esc(status.label)}</span></div><p>${archived?'Permanent, read-only history. This identity cannot be restored.':esc(status.message)}</p>${op?`<details class="technical-details"><summary>Operation details</summary><dl><dt>Request</dt><dd>${esc(op.request_id)}</dd><dt>Action / stage</dt><dd>${esc(op.action)} · ${esc(op.stage)}</dd></dl></details>`:''}${archived?`<dl class="technical-details"><dt>Employee / Auth identity</dt><dd>${esc(u.id)}<br>${esc(u.auth_user_id || 'Legacy unlinked')}</dd><dt>Joined / archived</dt><dd>${esc(u.joined_at || 'Unknown')}<br>${esc(u.deleted_at)}</dd><dt>Verified evidence</dt><dd>${esc(u.final_status)}<br>Administrator: ${esc(u.deleted_by)}<br>Request: ${esc(u.operation_id)}<br>${esc(u.reason || '')}</dd></dl>`:''}<div class="team-actions">${actions}</div><div class="modal-actions"><button class="secondary-button" data-p-close>Close</button></div></section></div>`;
  }

  if (type === "add-platform-user") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:460px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Add Team Member</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="add-platform-user">
            <div class="form-grid">
              <label class="field"><span>Full Name</span>
                <input name="name" required placeholder="e.g. Sarah Khan"></label>
              <label class="field"><span id="team-role-label">Role</span>
                <select name="role" aria-labelledby="team-role-label" required>
                  <option value="billing_person">Billing Person</option>
                  <option value="portfolio_manager">Portfolio Manager</option>
                </select></label>
              <label class="field" style="grid-column:1/-1"><span>Email</span>
                <input name="email" type="email" required placeholder="user@example.com"></label>
            </div>
            <p class="muted" style="font-size:12px;margin-top:10px">
              An invite email will be sent. They'll set their own password to activate the account.
            </p>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Send Invite</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  if (type === "edit-platform-user") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:460px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Edit Team Member</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="edit-platform-user" method="post">
            <input type="hidden" name="id"        value="${esc(md.id)}">
            <input type="hidden" name="old_email" value="${esc(md.email)}">
            <div class="form-grid">
              <label class="field"><span>Full Name</span>
                <input name="name" required value="${esc(md.name)}"></label>
              <label class="field"><span id="team-role-label">Role</span>
                <select name="role" aria-labelledby="team-role-label" required>
                  <option value="billing_person"
                    ${md.role === "billing_person" ? "selected" : ""}>Billing Person</option>
                  <option value="portfolio_manager"
                    ${md.role === "portfolio_manager" ? "selected" : ""}>Portfolio Manager</option>
                </select></label>
              <label class="field" style="grid-column:1/-1"><span>Email</span>
                <input name="email" type="email" autocomplete="username" required value="${esc(md.email)}"></label>
              <p class="muted">Employees set their own passwords. Reactivation retains the existing password and requires a fresh sign-in.</p>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Save Changes</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  return null;
}
