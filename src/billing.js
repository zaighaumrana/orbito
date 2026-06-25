import { pState } from "./state.js";
import { pb } from "./supabase.js";

// ── Rate-locked billing computation ──────────────────────────────
export function computeClientBilling(clientId) {
  const logs   = pState.data.usage.filter(u => u.client_id === clientId && !u.is_invoiced);
  const client = pState.data.clients.find(c => c.id === clientId) || {};

  let billCount = 0, billTotal = 0;
  let inventoryCount = 0, inventoryTotal = 0;
  let todayTotal = 0;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  logs.forEach(u => {
    const count   = Number(u.token_count || 1);
    const rate    = Number(u.rate_at_log || 0);
    const amount  = count * rate;
    const isToday = new Date(u.recorded_at) >= todayStart;

    if (u.module_type === "BILL") {
      billCount += count;
      if (client.bill_billable !== false) {
        billTotal += amount;
        if (isToday) todayTotal += amount;
      }
    } else if (u.module_type === "INVENTORY") {
      inventoryCount += count;
      if (client.inventory_billable) {
        inventoryTotal += amount;
        if (isToday) todayTotal += amount;
      }
    }
  });

  return { billCount, billTotal, inventoryCount, inventoryTotal, todayTotal, grandTotal: billTotal + inventoryTotal };
}

// ── Payment helpers ───────────────────────────────────────────────
export function getInvoicePayments(invoiceId) {
  return (pState.data.payments || []).filter(p => p.invoice_id === invoiceId);
}

export function getInvoicePaidTotal(invoiceId) {
  return getInvoicePayments(invoiceId).reduce((s, p) => s + Number(p.amount || 0), 0);
}

export function getClientActiveCredit(clientId) {
  return (pState.data.credits || [])
    .filter(c => c.client_id === clientId && !c.is_cleared)
    .reduce((s, c) => s + Number(c.amount_outstanding || 0), 0);
}

// ── Invoice generation ────────────────────────────────────────────
export async function generateInvoice(clientId) {
  const client = pState.data.clients.find(c => c.id === clientId);
  if (!client) return;

  const now            = new Date();
  const periodStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const periodEnd      = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const dueDate        = new Date(now.getFullYear(), now.getMonth() + 1, 3).toISOString().split("T")[0];
  const b              = computeClientBilling(clientId);
  const activeCredit   = getClientActiveCredit(clientId);
  const currentCharges = b.grandTotal;
  const totalDue       = currentCharges + activeCredit;

  const { data: inv, error } = await pb.from("billing_cycles").insert({
    client_id:               clientId,
    period_start:            periodStart,
    period_end:              periodEnd,
    bill_count:              b.billCount,
    event_rate:              Number(client.event_rate || 0),
    inventory_count:         b.inventoryCount,
    inventory_rate:          Number(client.inventory_rate || 0),
    bill_charges:            b.billTotal,
    inventory_charges:       b.inventoryTotal,
    current_charges:         currentCharges,
    carried_forward_balance: activeCredit,
    total_due:               totalDue,
    remaining_balance:       totalDue,
    invoice_date:            now.toISOString(),
    due_date:                dueDate,
    status:                  "Unpaid",
    payment_status:          "Unpaid",
  }).select().single();
  if (error) { alert(error.message); return; }

  const prevCredits = (pState.data.credits || []).filter(c => c.client_id === clientId && !c.is_cleared);
  for (const cr of prevCredits) {
    await pb.from("client_credit").update({ is_cleared: true, cleared_at: now.toISOString() }).eq("id", cr.id);
  }

  await pb.from("usage_logs")
    .update({ is_invoiced: true, billing_cycle_id: inv.id })
    .eq("client_id", clientId)
    .eq("is_invoiced", false);

  await pb.from("clients")
    .update({ grace_period_ends_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() })
    .eq("id", clientId);
}

// ── Lifecycle flag ────────────────────────────────────────────────
export function getLifecycleFlag(client) {
  const lastInvoice = pState.data.invoices.find(i => i.client_id === client.id);
  if (!lastInvoice) return null;
  if (lastInvoice.status === "Paid") return { label: "Upfront Paid", cls: "good" };
  if (client.grace_period_ends_at && new Date(client.grace_period_ends_at) > new Date())
    return { label: "Grace Period", cls: "warn" };
  if (lastInvoice.status === "Unpaid") {
    const billing = computeClientBilling(client.id);
    if (billing.grandTotal > 5000) return { label: "Low Balance", cls: "warn" };
    return { label: "Overdue", cls: "bad" };
  }
  return null;
}

// ── Print invoices ────────────────────────────────────────────────
export function printClientInvoices(client, invoices) {
  const sym       = client.currency_symbol || "Rs.";
  const printZone = document.getElementById("print-zone");
  printZone.innerHTML = `
    <div style="font-family:sans-serif;padding:32px;max-width:700px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <h1 style="font-size:24px;margin:0">RetailOS</h1>
          <p style="color:#666;margin:4px 0 0">Platform Invoice Statement</p>
        </div>
        <div style="text-align:right">
          <strong>${client.name}</strong>
          <p style="color:#666;margin:4px 0 0">${client.plan} Plan</p>
          <p style="color:#666;margin:0">${client.shop_url || ""}</p>
        </div>
      </div>
      ${invoices.map(inv => {
        const payments  = getInvoicePayments(inv.id);
        const totalPaid = getInvoicePaidTotal(inv.id);
        return `
          <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:24px;page-break-inside:avoid">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px">
              <div>
                <strong>Invoice #INV-${inv.id}</strong>
                <p style="color:#666;margin:4px 0 0">Period: ${inv.period_start} → ${inv.period_end}</p>
              </div>
              <div style="text-align:right">
                <span style="background:${inv.payment_status === "Paid" ? "#dcfce7" : "#fee2e2"};
                  color:${inv.payment_status === "Paid" ? "#166534" : "#991b1b"};
                  padding:4px 10px;border-radius:20px;font-size:13px">
                  ${inv.payment_status || "Unpaid"}
                </span>
                <p style="color:#666;margin:6px 0 0;font-size:13px">Due: ${inv.due_date || "—"}</p>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
              <thead><tr style="background:#f5f5f5">
                <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd">Description</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #ddd">Qty</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #ddd">Rate</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #ddd">Amount</th>
              </tr></thead>
              <tbody>
                ${(inv.bill_count || 0) > 0 ? `<tr>
                  <td style="padding:8px">Bills Generated</td>
                  <td style="padding:8px;text-align:right">${inv.bill_count}</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.event_rate || 0)}</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.bill_charges || 0).toLocaleString()}</td>
                </tr>` : ""}
                ${(inv.inventory_count || 0) > 0 ? `<tr>
                  <td style="padding:8px">Inventory Additions</td>
                  <td style="padding:8px;text-align:right">${inv.inventory_count}</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.inventory_rate || 0)}</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.inventory_charges || 0).toLocaleString()}</td>
                </tr>` : ""}
                ${Number(inv.carried_forward_balance || 0) > 0 ? `<tr style="color:#991b1b">
                  <td style="padding:8px">Previous Outstanding</td>
                  <td colspan="2"></td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.carried_forward_balance).toLocaleString()}</td>
                </tr>` : ""}
                <tr style="background:#f5f5f5;font-weight:700">
                  <td colspan="3" style="padding:8px">Total Due</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.total_due || 0).toLocaleString()}</td>
                </tr>
                <tr style="color:#166534">
                  <td colspan="3" style="padding:8px">Total Paid</td>
                  <td style="padding:8px;text-align:right">${sym} ${totalPaid.toLocaleString()}</td>
                </tr>
                <tr style="font-weight:700;color:${Number(inv.remaining_balance || 0) > 0 ? "#991b1b" : "#166534"}">
                  <td colspan="3" style="padding:8px">Balance</td>
                  <td style="padding:8px;text-align:right">${sym} ${Number(inv.remaining_balance || 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            ${payments.length ? `
            <div style="border-top:1px solid #eee;padding-top:10px">
              <p style="font-size:12px;color:#666;margin:0 0 6px">Payment History</p>
              ${payments.map(p => `
                <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
                  <span>${p.payment_method} · ${new Date(p.payment_date).toLocaleDateString()}</span>
                  <span>${sym} ${Number(p.amount).toLocaleString()}</span>
                </div>`).join("")}
            </div>` : ""}
          </div>`;
      }).join("")}
      <p style="text-align:center;color:#999;font-size:12px;margin-top:32px">
        Generated by RetailOS Platform · ${new Date().toLocaleString()}
      </p>
    </div>`;
  window.print();
  setTimeout(() => { printZone.innerHTML = ""; }, 2000);
}
