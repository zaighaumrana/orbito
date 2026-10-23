import {pState} from '../state.js';
import {tit} from '../helpers.js';
import {esc} from '../operations.js';
import {teamRoles,teamStatus} from '../team.js';

export function pageTeam() {
  if(!pState.authenticated || pState.currentUser.role!=='master_admin')return '<div class="empty" role="alert">Team Management is restricted to the verified Master Admin.</div>';
  const users=pState.data.platformUsers || [],archive=pState.data.teamArchive || [],operations=pState.data.teamOperations || [];
  const tabs=[['Active','Active users'],['Pending','Pending invitations'],['Inactive','Inactive users'],['Archived','Archived users']];
  const active=tabs.some(([id])=>id===pState.teamTab)?pState.teamTab:'Active';
  const all=active==='Archived'?archive:users.filter(u=>u.status===active);
  const filter=(pState.filter || '').trim().toLowerCase();
  const rows=all.filter(u=>[u.name,u.email,teamRoles[u.role]].some(v=>String(v || '').toLowerCase().includes(filter)));
  const reviews=operations.filter(o=>o.stage==='review_required');
  const date=value=>value && Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString():'Unknown';
  return `${tit('Team Management','Employee access, invitations and retained history.',`<div class="team-actions"><button class="secondary-button" data-p-action="reload-platform">Refresh</button><button class="primary-button" data-p-modal="add-platform-user">+ Add employee</button></div>`)}
    ${reviews.length?`<div class="platform-alert" role="status"><div><strong>${reviews.length} operation${reviews.length===1?' needs':'s need'} review</strong><p>Open the employee's Manage view to inspect the original request. Uncertain invitations cannot be resent.</p></div><button class="secondary-button" data-p-action="team-tab" data-p-tab="Pending">Review invitations</button></div>`:''}
    <section class="card team-workspace" aria-label="Team directory">
      <div class="team-tabs" role="tablist" aria-label="Employee status">${tabs.map(([id,label])=>`<button id="team-tab-${id}" class="team-tab" role="tab" aria-selected="${active===id}" aria-controls="team-panel" tabindex="${active===id?'0':'-1'}" data-p-action="team-tab" data-p-tab="${id}">${label}<span class="count">${id==='Archived'?archive.length:users.filter(u=>u.status===id).length}</span></button>`).join('')}</div>
      <div class="toolbar"><label class="team-search field"><span>Search employees</span><input class="search" type="search" data-p-filter value="${esc(pState.filter)}" placeholder="Name, email or role" autocomplete="off"></label><span class="muted">${rows.length} shown · ${active==='Archived'?'Read-only history':'Existing identities retained'}</span></div>
      <section id="team-panel" role="tabpanel" aria-labelledby="team-tab-${active}" tabindex="0"><div class="table-wrap"><table class="team-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>${active==='Archived'?'Archived':'Added'}</th><th>Action</th></tr></thead><tbody>${rows.map(u=>{
        const op=operations.find(o=>o.target_id===u.id),status=teamStatus(u,op);
        return `<tr><td data-label="Employee"><strong>${esc(u.name)}</strong><span class="muted employee-email">${esc(u.email)}</span></td><td data-label="Role">${esc(teamRoles[u.role] || 'Unknown role')}</td><td data-label="Status"><span class="badge ${active==='Archived'?'':status.tone}">${esc(active==='Archived'?'Archived':status.label)}</span></td><td data-label="${active==='Archived'?'Archived':'Added'}">${esc(date(active==='Archived'?u.deleted_at:u.created_at))}</td><td data-label="Action"><button class="secondary-button" data-p-action="manage-platform-user" data-p-id="${esc(u.id)}" ${active==='Archived'?'data-p-archived="true"':''}>${active==='Archived'?'View history':'Manage'}</button></td></tr>`;
      }).join('') || `<tr><td colspan="5"><div class="empty"><strong>${filter?'No matching employees':'No '+active.toLowerCase()+' employees'}</strong><p>${filter?'Try another name, email or role.':active==='Archived'?'Retained employee evidence appears here after verified retirement. Check the other pages for more records.':'Employees appear here when their server status matches this tab. Check the other pages for more records.'}</p></div></td></tr>`}</tbody></table></div></section>
    </section>`;
}
