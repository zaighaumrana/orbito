import { esc } from "../operations.js";
import { pState } from "../state.js";
import { lifecycleState, visibleClients } from '../lifecycle.js';
import { computeClientBilling, getLifecycleFlag } from "../billing.js";
import { tit } from "../helpers.js";

export function pageOverview() {
  const role    = pState.currentUser.role;
  const clients = pState.data.clients;
  const active  = clients.filter(c => lifecycleState(c) === 'Active').length;
  const suspended = clients.filter(c => lifecycleState(c) === 'Suspended').length;
  const openTickets = pState.data.support.filter(s => s.status === "Open").length;

  const showFinancials = role === "master_admin" || role === "billing_person";
  const showAddClient  = role === "master_admin" || role === "portfolio_manager";

  const outstandingByCurrency = new Map();
  for (const invoice of pState.data.invoices) {
    const client = clients.find(c => c.id === invoice.client_id);
    const currency = client?.currency || 'Unconfigured';
    const paid = pState.data.payments.filter(p => p.invoice_id === invoice.id).reduce((n,p) => n + Number(p.amount),0);
    outstandingByCurrency.set(currency,(outstandingByCurrency.get(currency)||0)+Math.max(Number(invoice.total_due)-paid,0));
  }
  const outstandingText = [...outstandingByCurrency].map(([code,amount]) => `${esc(code)} ${amount.toLocaleString()}`).join(' · ') || 'No invoices';
  const kpis = [
    ["Total Clients",    clients.length,   ""],
    ["Active",           active,           "good"],
    ["Suspended",        suspended,        suspended ? "bad" : ""],
    ['Provisioning',clients.filter(c=>lifecycleState(c)==='Provisioning').length,''],
    ['Historical',clients.filter(c=>lifecycleState(c)==='Archived').length,''],
    ["Open Tickets",     openTickets,      openTickets ? "warn" : ""],
    ...(showFinancials ? [
      ["Revenue Due",      outstandingText,          "good"],
      ["Uninvoiced BILL events", clients.reduce((n,c) => n + computeClientBilling(c.id).billCount,0), ""],
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
            <th>Shop URL</th>
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
                <td>${/^https?:\/\//i.test(c.shop_url || "")
                  ? `<a href="${esc(c.shop_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);font-size:13px">Open ↗</a>`
                  : "—"}</td>
                ${showFinancials ? `<td><strong>${esc(c.currency || "Unconfigured")} ${b.grandTotal.toLocaleString()}</strong></td>` : ""}
                <td>
                  <button class="secondary-button" data-p-action="open-client" data-p-id="${c.id}">
                    Manage
                  </button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}
