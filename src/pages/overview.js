import { esc } from "../operations.js";
import { pState } from "../state.js";
import { lifecycleState, visibleClients } from '../lifecycle.js';
import { computeClientBilling, getLifecycleFlag } from "../billing.js";
import { tit } from "../helpers.js";

export function pageOverview() {
  const role    = pState.currentUser.role;
  const clients = pState.data.clients;
  const active  = pState.data.overview?.active ?? 0;
  const suspended = pState.data.overview?.suspended ?? 0;
  const openTickets = pState.data.openTickets ?? 'Unavailable';

  const showFinancials = role === "master_admin" || role === "billing_person";
  const showAddClient  = role === "master_admin" || role === "portfolio_manager";

  const outstandingText=(pState.data.overview?.revenue||[]).map(v=>esc(v.currency)+' '+Number(v.amount).toLocaleString()).join(' · ')||'No invoices';
  const kpis = [
    ["Total Clients",    pState.data.overview?.clients ?? clients.length,   ""],
    ["Active",           active,           "good"],
    ["Suspended",        suspended,        suspended ? "bad" : ""],
    ['Provisioning',pState.data.overview?.provisioning ?? 0,''],
    ['Historical',pState.data.overview?.historical ?? 0,''],
    ["Open Tickets",     openTickets,      openTickets ? "warn" : ""],
    ...(showFinancials ? [
      ["Revenue Due",      outstandingText,          "good"],
      ["Uninvoiced BILL events", pState.data.overview?.bill_count ?? 0, ""],
    ] : []),
  ];

  return `
    ${tit("Platform Overview", "Live status across all clients.",
      showAddClient ? `<button class="primary-button" data-p-modal="add-client">+ Add Client</button>` : ""
    )}
    <div class="grid kpi-grid">
      ${kpis.map(([l, v, mod]) => `
        <div class="card kpi">
          <span class="label">${l}</span>
          <span class="value">${v}</span>
          ${mod ? `<span class="badge ${mod}" style="width:fit-content">${
            mod === "good" ? "Healthy" : mod === "bad" ? "Attention" : "Pending"
          }</span>` : ""}
        </div>`).join("")}
    </div>
    <div class="card">
      <h2 style="margin-bottom:12px">All Clients</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Business</th><th>Plan</th><th>Status</th>
            ${role==='billing_person'?'':'<th>Shop URL</th>'}
            ${showFinancials ? "<th>Uninvoiced estimate</th>" : ""}
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${visibleClients(clients).map(c => {
              const b         = computeClientBilling(c.id);
              const lifecycle = getLifecycleFlag(c);
              return `<tr>
                <td>
                  <strong>${esc(c.name)}</strong><br>
                  <small class="muted">${esc(c.industry || "—")}</small>
                </td>
                <td>${esc(c.plan)}</td>
                <td>
                  <span class="badge ${lifecycleState(c) === 'Active' ? 'good' : 'warn'}">${esc(lifecycleState(c))}</span>
                  ${lifecycle ? `<span class="badge ${lifecycle.cls}" style="margin-left:4px">${lifecycle.label}</span>` : ""}
                </td>
                ${role==='billing_person'?'':`<td>${/^https?:\/\//i.test(c.shop_url || "")
                  ? `<a href="${esc(c.shop_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);font-size:13px">Open ↗</a>`
                  : "—"}</td>`}
                ${showFinancials ? `<td><strong>${esc(c.currency || "Unconfigured")} ${b.grandTotal.toLocaleString()}</strong></td>` : ""}
                <td>
                  <button class="secondary-button" ${role==='billing_person'?'data-p-page="billing"':`data-p-action="open-client" data-p-id="${c.id}"`}>
                    ${role==='billing_person'?'Billing':'Manage'}
                  </button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}
