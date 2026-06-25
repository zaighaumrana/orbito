import { pState } from "../state.js";
import { computeClientBilling, getLifecycleFlag, getInvoicePayments, getInvoicePaidTotal } from "../billing.js";
import { tit, moduleToggleRow, money } from "../helpers.js";

export function pageClients() {
  const clients = pState.data.clients
    .filter(c => c.name.toLowerCase().includes(pState.filter.toLowerCase()));

  return `
    ${tit("All Clients", "Manage every client on the platform.", `
      <button class="primary-button" data-p-modal="add-client">+ Add Client</button>`)}
    <div class="toolbar">
      <input class="search" data-p-filter placeholder="Search clients…"
        value="${pState.filter}" style="min-width:260px">
    </div>
    <div class="grid tenant-grid">
      ${clients.length ? clients.map(c => {
        const b         = computeClientBilling(c.id);
        const lifecycle = getLifecycleFlag(c);
        const role      = pState.currentUser.role;
        return `
          <div class="tenant-card">
            <div class="tenant-card-head">
              <div>
                <strong>${c.name}</strong>
                <p class="muted" style="font-size:13px;margin-top:3px">${c.industry || "—"} · ${c.plan}</p>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                <span class="badge ${c.status === "Active" ? "good" : "bad"}">${c.status}</span>
                ${lifecycle ? `<span class="badge ${lifecycle.cls}">${lifecycle.label}</span>` : ""}
              </div>
            </div>
            <div style="font-size:13px;color:var(--muted)">${c.shop_url || "No shop URL set"}</div>
            <div style="font-size:13px;display:flex;gap:16px">
              <span>Currency: <strong>${c.currency_symbol || "Rs."}</strong></span>
              <span>This month: <strong>Rs. ${b.grandTotal.toLocaleString()}</strong></span>
            </div>
            <div class="tenant-card-actions">
              <button class="secondary-button" data-p-action="open-client" data-p-id="${c.id}">Manage</button>
              <button class="${c.status === "Active" ? "danger-button" : "primary-button"}"
                data-p-action="${c.status === "Active" ? "suspend-client" : "activate-client"}"
                data-p-id="${c.id}">
                ${c.status === "Active" ? "Suspend" : "Activate"}
              </button>
              <button class="danger-button" style="font-size:12px;padding:5px 10px"
                data-p-action="delete-client" data-p-id="${c.id}">
                ${role === "master_admin" ? "🗑 Delete" : "Archive"}
              </button>
            </div>
          </div>`;
      }).join("") : `<div class="empty">No clients yet. Add your first client.</div>`}
    </div>`;
}

export function pageClientDetail() {
  const c = pState.selectedClient;
  if (!c) return `<p class="muted">No client selected.</p>`;
  const cd  = pState.clientData;
  const cfg = cd.config || {};

  if (cd._error) return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="secondary-button" data-p-page="clients">← Back</button>
      <h1 style="font-size:22px">${c.name}</h1>
    </div>
    <div class="empty" style="color:var(--danger)">Could not connect to client database: ${cd._error}</div>`;

  if (!cd.tickets) return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="secondary-button" data-p-page="clients">← Back</button>
      <h1 style="font-size:22px">${c.name}</h1>
    </div>
    <div class="empty">Loading client data…</div>`;

  const sym       = c.currency_symbol || "Rs.";
  const revenue   = (cd.sales || []).reduce((s, x) => s + Number(x.total_bill || 0), 0);
  const pending   = (cd.tickets || []).filter(t => !["Delivered","Declined"].includes(t.status)).length;
  const udharBal  = (cd.udhar || []).filter(u => u.status !== "Settled").reduce((s, u) => s + Number(u.balance_due || 0), 0);

  const hasRepair   = !!cfg.repair_module_enabled;
  const hasInventory = !!cfg.inventory_module_enabled;
  const hasTech     = !!cfg.technician_module_enabled;
  const hasTracking = !!cfg.live_tracking_enabled;
  const hasEms      = !!cfg.ems_enabled;

  const billing = computeClientBilling(c.id);

  /* Invoice history for this client */
  const clientInvoices = (pState.data.invoices || [])
    .filter(i => i.client_id === c.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="secondary-button" data-p-page="clients">← Back</button>
      <h1 style="font-size:22px">${c.name}</h1>
      <span class="badge ${c.status === "Active" ? "good" : "bad"}">${c.status}</span>
    </div>

    <div class="grid kpi-grid">
      ${[
        ["Total Sales",     (cd.sales||[]).length],
        ["Revenue",         money(revenue, sym)],
        ["Pending Repairs", pending],
        ["Udhar Balance",   money(udharBal, sym)],
        ["Employees",       (cd.employees||[]).length],
        ["Plan",            c.plan],
      ].map(([l,v]) => `
        <div class="card kpi">
          <span class="label">${l}</span>
          <span class="value" style="font-size:20px">${v}</span>
        </div>`).join("")}
    </div>

    <div class="grid two-col">
      <div class="card">
        <h2 style="margin-bottom:12px">Module Controls</h2>
        <div style="display:grid;gap:10px">
          ${moduleToggleRow("Repair & Ticket Module", "Basic plan and above", hasRepair, "toggle-repair")}
          ${moduleToggleRow("Workshop / Technician", "Pro plan and above", hasTech, "toggle-technician")}
          ${moduleToggleRow("Live Tracking", "Customer-facing repair status page", hasTracking, "toggle-tracking")}
          ${moduleToggleRow("Inventory Addon", "Stock catalog management", hasInventory, "toggle-inventory")}
          ${moduleToggleRow("Employee Management", "Pro Plus plan", hasEms, "toggle-ems")}
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:10px;background:var(--surface-2);border-radius:8px">
            <div>
              <strong>Subscription Status</strong>
              <p class="muted" style="font-size:12px;margin:2px 0 0">Global access control</p>
            </div>
            <button class="${c.status === "Active" ? "danger-button" : "primary-button"}"
              data-p-action="${c.status === "Active" ? "suspend-client" : "activate-client"}"
              data-p-id="${c.id}">
              ${c.status === "Active" ? "Suspend" : "Activate"}
            </button>
          </div>
        </div>

        <div style="margin-top:18px">
          <h2 style="margin-bottom:10px">This Month's Usage</h2>
          <div style="display:grid;gap:8px">
            <div class="list-row">
              <span>Bills Generated</span>
              <span class="muted">${billing.billCount} × ${sym} ${Number(c.event_rate||0)}</span>
              <strong>${sym} ${billing.billTotal.toLocaleString()}</strong>
            </div>
            ${c.inventory_billable ? `
            <div class="list-row">
              <span>Inventory Additions</span>
              <span class="muted">${billing.inventoryCount} × ${sym} ${Number(c.inventory_rate||0)}</span>
              <strong>${sym} ${billing.inventoryTotal.toLocaleString()}</strong>
            </div>` : ""}
            <div class="list-row" style="border:1px solid var(--primary)">
              <strong>Grand Total</strong><span></span>
              <strong style="color:var(--primary)">${sym} ${billing.grandTotal.toLocaleString()}</strong>
            </div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:flex-end">
            <button class="secondary-button" style="font-size:13px"
              data-p-action="edit-client-rates" data-p-id="${c.id}">
              Edit Rates
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-bottom:12px">Quick Access</h2>
        <div style="display:grid;gap:8px">
          ${c.shop_url ? `
            <a class="secondary-button link-button" href="${c.shop_url}" target="_blank">Open Client POS ↗</a>
            <a class="secondary-button link-button" href="${c.shop_url}?route=admin" target="_blank">Open Client Admin ↗</a>
          ` : ""}
          <button class="secondary-button" data-p-modal="edit-client">Edit Client Details</button>
          <button class="danger-button" data-p-action="delete-client" data-p-id="${c.id}">
            ${pState.currentUser.role === "master_admin" ? "🗑 Delete Client" : "Archive Client"}
          </button>
        </div>

        <div style="margin-top:16px">
          <h2 style="margin-bottom:8px">Recent Sales</h2>
          ${(cd.sales||[]).slice(0,5).map(s => `
            <div class="list-row" style="margin-bottom:6px">
              <span>INV-${s.id}</span>
              <span class="muted" style="font-size:12px">${new Date(s.created_at||s.date).toLocaleDateString()}</span>
              <strong>${money(s.total_bill, sym)}</strong>
            </div>`).join("") || `<div class="empty" style="min-height:60px">No sales yet.</div>`}
        </div>
      </div>
    </div>

    ${hasRepair ? `
    <div class="card">
      <h2 style="margin-bottom:12px">Open Repair Tickets</h2>
      ${pending === 0 ? `<div class="empty">No open tickets.</div>` : `
        <div class="table-wrap"><table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Status</th></tr></thead>
          <tbody>
            ${(cd.tickets||[]).filter(t => !["Delivered","Declined"].includes(t.status)).map(t => `<tr>
              <td>${t.ticket_number || t.id}</td>
              <td>${t.customer_name || "—"}</td>
              <td>${t.device_brand || ""} ${t.device_model || ""}</td>
              <td><span class="badge warn">${t.status}</span></td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
    </div>` : ""}

    ${clientInvoices.length ? `
    <div class="card">
      <h2 style="margin-bottom:12px">Invoice History</h2>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Invoice</th><th>Period</th><th>Bills</th><th>Inventory</th>
          <th>Total Due</th><th>Paid</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${clientInvoices.map(inv => {
            const totalPaid = getInvoicePaidTotal(inv.id);
            return `<tr>
              <td><strong>INV-${inv.id}</strong></td>
              <td style="font-size:12px">${inv.period_start} → ${inv.period_end}</td>
              <td>${inv.bill_count||0} × ${sym}${Number(inv.event_rate||0)}</td>
              <td>${inv.inventory_count||0} × ${sym}${Number(inv.inventory_rate||0)}</td>
              <td><strong>${sym} ${Number(inv.total_due||0).toLocaleString()}</strong></td>
              <td style="color:var(--success)">${sym} ${totalPaid.toLocaleString()}</td>
              <td><span class="badge ${inv.payment_status==="Paid"?"good":inv.payment_status==="Partial"?"warn":"bad"}">
                ${inv.payment_status||"Unpaid"}
              </span></td>
              <td>
                <button class="secondary-button" style="font-size:12px;padding:4px 8px"
                  data-p-action="view-invoice" data-p-id="${inv.id}">View</button>
                ${inv.payment_status !== "Paid" ? `
                <button class="primary-button" style="font-size:12px;padding:4px 8px"
                  data-p-action="mark-paid"
                  data-p-id="${inv.id}"
                  data-p-client-id="${c.id}">Pay</button>` : ""}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
    </div>` : ""}`;
}
