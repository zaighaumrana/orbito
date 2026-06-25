import { pState } from "../state.js";
import { computeClientBilling, getInvoicePayments, getInvoicePaidTotal } from "../billing.js";
import { tit } from "../helpers.js";

export function pageBilling() {
  const clients  = pState.data.clients || [];
  const invoices = pState.data.invoices || [];
  const now      = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  const rows = clients.filter(c => c.status === "Active").map(c => {
    const b           = computeClientBilling(c.id);
    const lastInvoice = invoices
      .filter(i => i.client_id === c.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    return { c, b, lastInvoice, hasInventory: !!c.inventory_billable };
  });

  const anyInventory = rows.some(r => r.hasInventory);
  const totalDue   = rows.reduce((s, r) => s + r.b.grandTotal, 0);
  const totalToday = rows.reduce((s, r) => s + r.b.todayTotal, 0);
  const unpaid     = rows.filter(r => r.lastInvoice?.payment_status === "Unpaid").length;

  return `
    ${tit("Billing", `${monthLabel} — Usage-Based Invoicing`, "")}

    <div class="grid kpi-grid" style="margin-bottom:4px">
      ${[
        ["Total Revenue Due", `Rs. ${totalDue.toLocaleString()}`,  "good"],
        ["Today's Activity",  `Rs. ${totalToday.toLocaleString()}`, ""],
        ["Unpaid Invoices",   unpaid,                               unpaid ? "bad" : "good"],
        ["Active Clients",    rows.length,                          ""],
      ].map(([l,v,m]) => `
        <div class="card kpi">
          <span class="label">${l}</span>
          <span class="value" style="font-size:18px">${v}</span>
          ${m ? `<span class="badge ${m}" style="width:fit-content">${m==="good"?"Healthy":"Attention"}</span>` : ""}
        </div>`).join("")}
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 16px 0;display:flex;justify-content:space-between;align-items:center">
        <h2>Client Billing Matrix</h2>
        <span class="muted" style="font-size:13px">Unbilled usage this month</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Client</th><th>Plan</th><th>Bills Generated</th>
            ${anyInventory ? "<th>Inventory Additions</th>" : ""}
            <th>Today</th><th>Grand Total</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ c, b, lastInvoice, hasInventory }) => {
              const payStatus = lastInvoice?.payment_status || "No Invoice";
              const sym       = c.currency_symbol || "Rs.";
              return `<tr>
                <td>
                  <strong>${c.name}</strong>
                  <div class="muted" style="font-size:11px">${c.industry || ""}</div>
                </td>
                <td><span class="badge">${c.plan || "—"}</span></td>
                <td>
                  <strong>${b.billCount}</strong>
                  <div class="muted" style="font-size:11px">
                    ${sym} ${Number(c.event_rate||0)} / bill = ${sym} ${b.billTotal.toLocaleString()}
                  </div>
                </td>
                ${anyInventory ? `<td>${hasInventory
                  ? `<strong>${b.inventoryCount}</strong>
                     <div class="muted" style="font-size:11px">
                       ${sym} ${Number(c.inventory_rate||0)} / item = ${sym} ${b.inventoryTotal.toLocaleString()}
                     </div>`
                  : `<span class="muted">—</span>`}</td>` : ""}
                <td><strong>${sym} ${b.todayTotal.toLocaleString()}</strong></td>
                <td><strong style="font-size:16px;color:var(--primary)">${sym} ${b.grandTotal.toLocaleString()}</strong></td>
                <td>
                  <span class="badge ${
                    payStatus==="Paid"?"good":payStatus==="Partial"?"warn":payStatus==="Unpaid"?"bad":""}">
                    ${payStatus}
                  </span>
                </td>
                <td style="display:flex;gap:6px;flex-wrap:wrap">
                  ${b.grandTotal > 0 && payStatus !== "Paid" ? `
                    <button class="primary-button" style="font-size:12px;padding:5px 10px"
                      data-p-action="generate-invoice" data-p-id="${c.id}">
                      Gen Invoice
                    </button>` : ""}
                  ${(payStatus === "Unpaid" || payStatus === "Partial") && lastInvoice ? `
                    <button class="secondary-button" style="font-size:12px;padding:5px 10px"
                      data-p-action="mark-paid"
                      data-p-id="${lastInvoice.id}"
                      data-p-client-id="${c.id}">
                      Record Payment
                    </button>` : ""}
                  <button class="secondary-button" style="font-size:12px;padding:5px 10px"
                    data-p-action="edit-client-rates" data-p-id="${c.id}">
                    Edit Rates
                  </button>
                  <button class="secondary-button" style="font-size:12px;padding:5px 10px"
                    data-p-action="view-logs" data-p-id="${c.id}">
                    Logs
                  </button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>

    ${invoices.length ? `
    <div class="card">
      <h2 style="margin-bottom:12px">Invoice History</h2>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Invoice</th><th>Client</th><th>Period</th>
          <th>Bills</th><th>Inventory</th><th>Total Due</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${invoices.slice(0, 30).map(inv => {
            const cl  = clients.find(c => c.id === inv.client_id);
            const sym = cl?.currency_symbol || "Rs.";
            const totalPaid = getInvoicePaidTotal(inv.id);
            return `<tr>
              <td><strong>INV-${inv.id}</strong></td>
              <td>${cl?.name || "—"}</td>
              <td style="font-size:12px">${inv.period_start} → ${inv.period_end}</td>
              <td>${inv.bill_count||0} × ${sym}${Number(inv.event_rate||0)}</td>
              <td>${inv.inventory_count||0} × ${sym}${Number(inv.inventory_rate||0)}</td>
              <td><strong>${sym} ${Number(inv.total_due||0).toLocaleString()}</strong></td>
              <td>
                <span class="badge ${inv.payment_status==="Paid"?"good":inv.payment_status==="Partial"?"warn":"bad"}">
                  ${inv.payment_status||"Unpaid"}
                </span>
              </td>
              <td style="display:flex;gap:4px">
                <button class="secondary-button" style="font-size:12px;padding:4px 8px"
                  data-p-action="view-invoice" data-p-id="${inv.id}">View</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
    </div>` : ""}`;
}
