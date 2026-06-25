import { pState } from "../state.js";
import { getInvoicePayments, getInvoicePaidTotal } from "../billing.js";

export function billingModals(type, md) {

  /* ── Usage Logs ── */
  if (type === "view-logs") {
    const clientId = md?.clientId;
    const client   = pState.data.clients.find(x => x.id === clientId);
    const logs     = (pState.data.usage || [])
      .filter(u => u.client_id === clientId)
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:680px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>Usage Logs — ${client?.name || "Client"}</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <div class="table-wrap" style="max-height:420px;overflow-y:auto">
            <table>
              <thead><tr>
                <th>Type</th><th>Tokens</th><th>Rate</th><th>Amount</th><th>Invoiced</th><th>Date</th>
              </tr></thead>
              <tbody>
                ${logs.length ? logs.map(u => `<tr>
                  <td><span class="badge">${u.module_type}</span></td>
                  <td>${u.token_count}</td>
                  <td>Rs. ${u.rate_at_log}</td>
                  <td>Rs. ${(Number(u.token_count||1)*Number(u.rate_at_log||0)).toLocaleString()}</td>
                  <td>${u.is_invoiced
                    ? `<span class="badge good">Yes</span>`
                    : `<span class="badge warn">No</span>`}</td>
                  <td style="font-size:12px">${new Date(u.recorded_at).toLocaleString()}</td>
                </tr>`).join("")
                : `<tr><td colspan="6" style="text-align:center;color:var(--muted)">
                    No logs this month
                  </td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" data-p-close>Close</button>
          </div>
        </div>
      </div>`;
  }

  /* ── Record Payment ── */
  if (type === "record-payment") {
    const invoiceId = md?.invoiceId;
    const clientId  = md?.clientId;
    const invoice   = pState.data.invoices.find(i => i.id === invoiceId);
    const client    = pState.data.clients.find(c => c.id === clientId);
    const payments  = getInvoicePayments(invoiceId);
    const totalPaid = getInvoicePaidTotal(invoiceId);
    const totalDue  = Number(invoice?.total_due || 0);
    const remaining = totalDue - totalPaid;
    const sym       = client?.currency_symbol || "Rs.";
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:520px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Record Payment</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <div style="background:var(--surface-2);padding:12px;border-radius:8px;margin-bottom:14px;
                      font-size:14px;display:grid;gap:6px">
            <div class="list-row" style="border:none;padding:0">
              <span class="muted">Client</span><strong>${client?.name || "—"}</strong>
            </div>
            <div class="list-row" style="border:none;padding:0">
              <span class="muted">Invoice Total</span>
              <strong>${sym} ${totalDue.toLocaleString()}</strong>
            </div>
            <div class="list-row" style="border:none;padding:0">
              <span class="muted">Already Paid</span>
              <strong style="color:var(--success)">${sym} ${totalPaid.toLocaleString()}</strong>
            </div>
            <div class="list-row" style="border:none;padding:0">
              <span class="muted">Remaining</span>
              <strong style="color:${remaining > 0 ? "var(--danger)" : "var(--success)"}">
                ${sym} ${remaining.toLocaleString()}
              </strong>
            </div>
          </div>
          ${payments.length ? `
          <div style="margin-bottom:14px">
            <p style="font-size:13px;color:var(--muted);margin-bottom:8px">Payment History</p>
            ${payments.map(p => `
              <div class="list-row" style="font-size:13px;margin-bottom:4px">
                <span>${p.payment_method}</span>
                <span class="muted">${new Date(p.payment_date).toLocaleDateString()}</span>
                <strong>${sym} ${Number(p.amount).toLocaleString()}</strong>
              </div>`).join("")}
          </div>` : ""}
          <form data-p-form="record-payment">
            <input type="hidden" name="invoice_id" value="${invoiceId}">
            <input type="hidden" name="client_id"  value="${clientId}">
            <div class="form-grid">
              <label class="field"><span>Amount Received (${sym})</span>
                <input name="amount" type="number" min="1" max="${remaining}"
                  value="${remaining}" required>
              </label>
              <label class="field"><span>Payment Date</span>
                <input name="payment_date" type="date"
                  value="${new Date().toISOString().split("T")[0]}" required>
              </label>
              <label class="field" style="grid-column:1/-1"><span>Payment Method</span>
                <select name="payment_method" required>
                  <option value="Cash">Cash</option>
                  <option value="Raast">Raast</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="Easypaisa">Easypaisa</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </label>
              <label class="field" style="grid-column:1/-1"><span>Notes (optional)</span>
                <input name="notes" type="text" placeholder="Any reference or note…">
              </label>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Record Payment</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  /* ── View Invoice ── */
  if (type === "view-invoice") {
    const invoice   = pState.data.invoices.find(i => i.id === md?.invoiceId);
    const client    = pState.data.clients.find(c => c.id === invoice?.client_id);
    const payments  = getInvoicePayments(md?.invoiceId);
    const totalPaid = getInvoicePaidTotal(md?.invoiceId);
    const sym       = client?.currency_symbol || "Rs.";
    if (!invoice) return `
      <div class="modal-backdrop">
        <div class="modal"><button data-p-close>Close</button></div>
      </div>`;
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:620px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h2>Invoice #INV-${invoice.id}</h2>
            <div style="display:flex;gap:8px">
              <button class="secondary-button"
                data-p-action="print-invoice" data-p-id="${invoice.id}">
                Print / PDF
              </button>
              <button class="icon-button" data-p-close>✕</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:14px">
            <div>
              <p class="muted" style="font-size:12px">CLIENT</p>
              <strong>${client?.name || "—"}</strong><br>
              <span class="muted">${client?.plan || ""} Plan</span>
            </div>
            <div style="text-align:right">
              <p class="muted" style="font-size:12px">INVOICE DATE</p>
              <strong>${new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString()}</strong><br>
              <span class="muted">Due: ${invoice.due_date
                ? new Date(invoice.due_date).toLocaleDateString() : "—"}</span>
            </div>
          </div>
          <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px">
            <table style="min-width:unset">
              <thead><tr style="background:var(--surface-2)">
                <th>Description</th>
                <th style="text-align:right">Qty</th>
                <th style="text-align:right">Rate</th>
                <th style="text-align:right">Amount</th>
              </tr></thead>
              <tbody>
                ${(invoice.bill_count || 0) > 0 ? `<tr>
                  <td>Bills Generated</td>
                  <td style="text-align:right">${invoice.bill_count}</td>
                  <td style="text-align:right">${sym} ${Number(invoice.event_rate||0)}</td>
                  <td style="text-align:right">${sym} ${Number(invoice.bill_charges||0).toLocaleString()}</td>
                </tr>` : ""}
                ${(invoice.inventory_count || 0) > 0 ? `<tr>
                  <td>Inventory Additions</td>
                  <td style="text-align:right">${invoice.inventory_count}</td>
                  <td style="text-align:right">${sym} ${Number(invoice.inventory_rate||0)}</td>
                  <td style="text-align:right">${sym} ${Number(invoice.inventory_charges||0).toLocaleString()}</td>
                </tr>` : ""}
                ${Number(invoice.carried_forward_balance||0) > 0 ? `<tr style="color:var(--danger)">
                  <td>Previous Outstanding Balance</td>
                  <td style="text-align:right">—</td>
                  <td style="text-align:right">—</td>
                  <td style="text-align:right">${sym} ${Number(invoice.carried_forward_balance).toLocaleString()}</td>
                </tr>` : ""}
                <tr style="background:var(--surface-2);font-weight:700">
                  <td colspan="3">Total Due</td>
                  <td style="text-align:right">${sym} ${Number(invoice.total_due||0).toLocaleString()}</td>
                </tr>
                <tr style="color:var(--success)">
                  <td colspan="3">Total Paid</td>
                  <td style="text-align:right">${sym} ${totalPaid.toLocaleString()}</td>
                </tr>
                <tr style="font-weight:700;color:${Number(invoice.remaining_balance||0) > 0
                  ? "var(--danger)" : "var(--success)"}">
                  <td colspan="3">Balance Remaining</td>
                  <td style="text-align:right">${sym} ${Number(invoice.remaining_balance||0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          ${payments.length ? `
          <div style="margin-bottom:14px">
            <p style="font-size:13px;color:var(--muted);margin-bottom:8px">Payment History</p>
            ${payments.map(p => `
              <div class="list-row" style="font-size:13px;margin-bottom:4px">
                <span>${p.payment_method}</span>
                <span class="muted">${new Date(p.payment_date).toLocaleDateString()} · ${p.recorded_by}</span>
                <strong style="color:var(--success)">${sym} ${Number(p.amount).toLocaleString()}</strong>
              </div>`).join("")}
          </div>` : ""}
          <div class="modal-actions" style="margin-top:14px">
            ${Number(invoice.remaining_balance||0) > 0 ? `
              <button class="primary-button"
                data-p-action="mark-paid"
                data-p-id="${invoice.id}"
                data-p-client-id="${invoice.client_id}">
                + Record Payment
              </button>` : ""}
            <button class="secondary-button" data-p-close>Close</button>
          </div>
        </div>
      </div>`;
  }

  /* ── Edit Client Rates ── */
  if (type === "edit-client-rates") {
    const cl  = md?.client;
    const sym = cl?.currency_symbol || "Rs.";
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:420px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Edit Rates — ${cl?.name}</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <p class="muted" style="font-size:13px;margin-bottom:14px">
            Rate changes apply going forward only. Historical billing is locked at the rate logged at time of event.
          </p>
          <form data-p-form="edit-client-rates">
            <input type="hidden" name="client_id" value="${cl?.id}">
            <div style="display:grid;gap:12px">
              <label class="field">
                <span>Bill Rate (${sym} per bill/receipt)</span>
                <input name="event_rate" type="number" min="0" step="0.01"
                  value="${Number(cl?.event_rate||0)}"
                  placeholder="e.g. 5 or 4.50 or 0.75">
                <span style="font-size:12px;color:var(--muted)">
                  Charged for every bill generated — sales and repair jobs
                </span>
              </label>
              <label class="field">
                <span>Inventory Rate (${sym} per restock)</span>
                <input name="inventory_rate" type="number" min="0" step="0.01"
                  value="${Number(cl?.inventory_rate||0)}"
                  placeholder="e.g. 1 or 0.50">
                <span style="font-size:12px;color:var(--muted)">
                  Charged per restock instance regardless of quantity
                </span>
              </label>
              <label class="field">
                <span>Inventory Addon</span>
                <select name="inventory_billable">
                  <option value="true"  ${cl?.inventory_billable ? "selected" : ""}>
                    Enabled — client is billed for inventory
                  </option>
                  <option value="false" ${!cl?.inventory_billable ? "selected" : ""}>
                    Disabled — inventory not charged
                  </option>
                </select>
              </label>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Save Rates</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  return null;
}
