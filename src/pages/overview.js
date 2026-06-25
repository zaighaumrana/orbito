import { pState } from "../state.js";
import { computeClientBilling, getLifecycleFlag } from "../billing.js";
import { tit } from "../helpers.js";

export function pageOverview() {
  const role    = pState.currentUser.role;
  const clients = pState.data.clients;
  const active  = clients.filter(c => c.status === "Active").length;
  const suspended = clients.filter(c => c.status === "Suspended").length;
  const openTickets = pState.data.support.filter(s => s.status === "Open").length;

  const showFinancials = role === "master_admin" || role === "billing_person";
  const showAddClient  = role === "master_admin" || role === "portfolio_manager";

  const mrr = pState.data.invoices
    .filter(i => i.status === "Unpaid")
    .reduce((s, i) => s + Number(i.total_due || 0), 0);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayRevenue = pState.data.usage
    .filter(u => new Date(u.recorded_at) >= todayStart)
    .reduce((s, u) => s + Number(u.token_count || 1) * Number(u.rate_at_log || 0), 0);

  const kpis = [
    ["Total Clients",    clients.length,   ""],
    ["Active",           active,           "good"],
    ["Suspended",        suspended,        suspended ? "bad" : ""],
    ["Open Tickets",     openTickets,      openTickets ? "warn" : ""],
    ...(showFinancials ? [
      ["Revenue Due",      `Rs. ${mrr.toLocaleString()}`,          "good"],
      ["Today's Activity", `Rs. ${todayRevenue.toLocaleString()}`, ""],
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
            ${showFinancials ? "<th>This Month</th>" : ""}
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${clients.map(c => {
              const b         = computeClientBilling(c.id);
              const lifecycle = getLifecycleFlag(c);
              return `<tr>
                <td>
                  <strong>${c.name}</strong><br>
                  <small class="muted">${c.industry || "—"}</small>
                </td>
                <td>${c.plan}</td>
                <td>
                  <span class="badge ${c.status === "Active" ? "good" : "bad"}">${c.status}</span>
                  ${lifecycle ? `<span class="badge ${lifecycle.cls}" style="margin-left:4px">${lifecycle.label}</span>` : ""}
                </td>
                <td>${c.shop_url
                  ? `<a href="${c.shop_url}" target="_blank" style="color:var(--primary);font-size:13px">Open ↗</a>`
                  : "—"}</td>
                ${showFinancials ? `<td><strong>Rs. ${b.grandTotal.toLocaleString()}</strong></td>` : ""}
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
