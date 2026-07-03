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
  if (error) { alert(error.message); return null; }

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

  return inv;
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

// ── Build invoice HTML (shared between preview modal and print) ───
function buildInvoiceHTML(client, invoice, payments, totalPaid, usageLogs, includeDetailedLogs) {
  const sym = client.currency_symbol || "Rs.";

  const detailRows = includeDetailedLogs && usageLogs.length
    ? usageLogs.map(u => {
        const amount = Number(u.token_count || 1) * Number(u.rate_at_log || 0);
        const dt     = new Date(u.recorded_at);
        const dateStr = dt.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = dt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
        const desc    = u.module_type === "BILL" ? "POS / Repair Bill" : "Inventory Restock";
        return `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555">
              ${dateStr} ${timeStr}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;
                background:${u.module_type === "BILL" ? "#e8f4fd" : "#f0fdf4"};
                color:${u.module_type === "BILL" ? "#1a6fa8" : "#166534"}">
                ${u.module_type}
              </span>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">${desc}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:center">
              ${u.token_count || 1}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right">
              ${sym} ${Number(u.rate_at_log || 0).toFixed(2)}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-weight:600">
              ${sym} ${amount.toFixed(2)}
            </td>
          </tr>`;
      }).join("")
    : "";

  const summarySection = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <colgroup>
        <col style="width:45%">
        <col style="width:15%;text-align:right">
        <col style="width:20%;text-align:right">
        <col style="width:20%;text-align:right">
      </colgroup>
      <thead>
        <tr style="background:#f8f8f8;border-bottom:2px solid #e0e0e0">
          <th style="padding:10px 8px;text-align:left;font-size:12px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Description</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Rate</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.bill_count || 0) > 0 ? `
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:10px 8px;font-size:13px">Bills Generated (POS &amp; Repair)</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${invoice.bill_count}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${sym} ${Number(invoice.event_rate || 0).toFixed(2)}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.bill_charges || 0).toLocaleString()}</td>
        </tr>` : ""}
        ${(invoice.inventory_count || 0) > 0 ? `
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:10px 8px;font-size:13px">Inventory Additions</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${invoice.inventory_count}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${sym} ${Number(invoice.inventory_rate || 0).toFixed(2)}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.inventory_charges || 0).toLocaleString()}</td>
        </tr>` : ""}
        ${Number(invoice.carried_forward_balance || 0) > 0 ? `
        <tr style="border-bottom:1px solid #f0f0f0;color:#c0392b">
          <td style="padding:10px 8px;font-size:13px" colspan="3">Previous Outstanding Balance</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.carried_forward_balance).toLocaleString()}</td>
        </tr>` : ""}
      </tbody>
      <tfoot>
        <tr style="background:#f8f8f8;border-top:2px solid #e0e0e0">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:700">Total Due</td>
          <td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700">${sym} ${Number(invoice.total_due || 0).toLocaleString()}</td>
        </tr>
        <tr style="color:#166534">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:600">Total Paid</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${totalPaid.toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700;color:${Number(invoice.remaining_balance || 0) > 0 ? "#c0392b" : "#166534"}">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:700">Balance Remaining</td>
          <td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700">${sym} ${Number(invoice.remaining_balance || 0).toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>`;

  const detailSection = includeDetailedLogs && usageLogs.length ? `
    <div style="margin-top:28px">
      <h3 style="font-size:13px;font-weight:700;color:#333;margin:0 0 10px;
                 padding-bottom:6px;border-bottom:2px solid #e0e0e0;text-transform:uppercase;
                 letter-spacing:0.5px">
        Detailed Usage Log
      </h3>
      <table style="width:100%;border-collapse:collapse">
        <colgroup>
          <col style="width:20%">
          <col style="width:15%">
          <col style="width:28%">
          <col style="width:10%">
          <col style="width:12%">
          <col style="width:15%">
        </colgroup>
        <thead>
          <tr style="background:#f8f8f8;border-bottom:2px solid #e0e0e0">
            <th style="padding:8px;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Date &amp; Time</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Type</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Description</th>
            <th style="padding:8px;text-align:center;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Qty</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Rate</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>` : "";

  const paymentSection = payments.length ? `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e0e0e0">
      <h3 style="font-size:12px;font-weight:700;color:#333;margin:0 0 10px;
                 text-transform:uppercase;letter-spacing:0.5px">
        Payment History
      </h3>
      ${payments.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px">
          <span style="color:#555">${p.payment_method}</span>
          <span style="color:#888">${new Date(p.payment_date).toLocaleDateString()}</span>
          <span style="font-weight:600;color:#166534">${sym} ${Number(p.amount).toLocaleString()}</span>
        </div>`).join("")}
    </div>` : "";

  return `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                color:#333;max-width:780px;margin:0 auto;padding:40px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
        <div>
          <div style="font-size:26px;font-weight:800;color:#126c5b;letter-spacing:-0.5px">RetailOS</div>
          <div style="font-size:12px;color:#888;margin-top:4px">Platform Invoice Statement</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#333">Invoice #INV-${invoice.id}</div>
          <div style="font-size:12px;color:#888;margin-top:4px">
            Date: ${new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
          <div style="font-size:12px;color:#888">
            Due: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
          </div>
          <div style="margin-top:8px">
            <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
              background:${invoice.payment_status === "Paid" ? "#dcfce7" : invoice.payment_status === "Partial" ? "#fef3c7" : "#fee2e2"};
              color:${invoice.payment_status === "Paid" ? "#166534" : invoice.payment_status === "Partial" ? "#92400e" : "#991b1b"}">
              ${invoice.payment_status || "Unpaid"}
            </span>
          </div>
        </div>
      </div>

      <!-- Client Info -->
      <div style="display:flex;justify-content:space-between;margin-bottom:28px;
                  padding:16px;background:#f9f9f9;border-radius:8px;border:1px solid #e8e8e8">
        <div>
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Bill To</div>
          <div style="font-size:15px;font-weight:700">${client.name}</div>
          <div style="font-size:12px;color:#666;margin-top:2px">${client.plan} Plan</div>
          ${client.shop_url ? `<div style="font-size:12px;color:#126c5b;margin-top:2px">${client.shop_url}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Billing Period</div>
          <div style="font-size:13px;font-weight:600">${invoice.period_start} → ${invoice.period_end}</div>
        </div>
      </div>

      <!-- Summary Table -->
      ${summarySection}

      <!-- Detailed Logs -->
      ${detailSection}

      <!-- Payment History -->
      ${paymentSection}

      <!-- Footer -->
      <div style="margin-top:36px;padding-top:16px;border-top:1px solid #e0e0e0;
                  text-align:center;font-size:11px;color:#aaa">
        Generated by RetailOS Platform · ${new Date().toLocaleString()} ·
        ${includeDetailedLogs ? `${usageLogs.length} usage log entries included` : "Summary view"}
      </div>
    </div>`;
}

// ── Print invoice in a new clean window ──────────────────────────
// Opens a new blank window so browser chrome (URL, date, page number)
// shows that window's blank URL rather than the app URL.
function printInNewWindow(htmlContent) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    @media print {
      @page { margin: 15mm; size: A4; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>${htmlContent}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

// ── Print invoices (called from events.js after invoice generation) ─
export function printClientInvoices(client, invoices) {
  // Get usage logs that belong to these invoices
  const invoiceIds = invoices.map(i => i.id);
  const usageLogs = (pState.data.usage || [])
    .filter(u => u.client_id === client.id && invoiceIds.includes(u.billing_cycle_id))
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

  const allHTML = invoices.map(inv => {
    const payments  = getInvoicePayments(inv.id);
    const totalPaid = getInvoicePaidTotal(inv.id);
    const invLogs   = usageLogs.filter(u => u.billing_cycle_id === inv.id);
    return buildInvoiceHTML(client, inv, payments, totalPaid, invLogs, true);
  }).join('<div style="page-break-after:always"></div>');

  printInNewWindow(allHTML);
}

// ── Preview modal (called from billing page view-invoice action) ──
// Returns HTML string for the in-app preview modal (no detailed logs).
// The modal has a "Confirm & Print with Logs" button that calls printClientInvoices.
export function getInvoicePreviewHTML(client, invoice) {
  const payments  = getInvoicePayments(invoice.id);
  const totalPaid = getInvoicePaidTotal(invoice.id);
  return buildInvoiceHTML(client, invoice, payments, totalPaid, [], false);
}

// ── Invoice confirmation modal (shown before printing) ────────────
// Call this from events.js for the "print-invoice" action.
// Shows a preview in a modal. User confirms → print with logs fires.
// User cancels → nothing happens (invoice already exists, no rollback needed).
export function showInvoiceConfirmModal(invoice) {
  const client = pState.data.clients.find(c => c.id === invoice.client_id);
  if (!client) return;

  // Get usage logs for this invoice
  const usageLogs = (pState.data.usage || [])
    .filter(u => u.client_id === client.id && u.billing_cycle_id === invoice.id)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

  const payments  = getInvoicePayments(invoice.id);
  const totalPaid = getInvoicePaidTotal(invoice.id);

  const previewHTML = buildInvoiceHTML(client, invoice, payments, totalPaid, [], false);
  const sym = client.currency_symbol || "Rs.";

  // Inject a temporary confirm overlay
  const overlay = document.createElement("div");
  overlay.id    = "invoice-confirm-overlay";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(5,9,11,0.7);
    display:grid;place-items:center;padding:18px;overflow-y:auto`;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:820px;width:100%;
                max-height:92vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.3)">
      <!-- Modal header -->
      <div style="position:sticky;top:0;background:#fff;z-index:1;
                  padding:16px 20px;border-bottom:1px solid #e5e7eb;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong style="font-size:16px">Invoice Preview — INV-${invoice.id}</strong>
          <p style="font-size:12px;color:#6b7280;margin-top:2px">
            ${usageLogs.length} usage log entries will be included when printed.
            Review the summary below and confirm to print.
          </p>
        </div>
        <button id="invoice-confirm-close"
          style="background:none;border:none;font-size:22px;cursor:pointer;
                 color:#6b7280;padding:4px 8px;line-height:1">✕</button>
      </div>

      <!-- Invoice preview (summary only) -->
      <div style="padding:0">
        ${previewHTML}
      </div>

      <!-- Log count info -->
      <div style="margin:0 40px 20px;padding:12px 16px;
                  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                  font-size:13px;color:#166534">
        ✓ When you click "Confirm &amp; Print", the full invoice with all
        <strong>${usageLogs.length} usage log entries</strong>
        (${usageLogs.filter(u => u.module_type === "BILL").length} bills +
        ${usageLogs.filter(u => u.module_type === "INVENTORY").length} inventory)
        will be included in the printed/PDF document.
      </div>

      <!-- Actions -->
      <div style="padding:16px 20px;border-top:1px solid #e5e7eb;
                  display:flex;justify-content:flex-end;gap:10px;
                  position:sticky;bottom:0;background:#fff">
        <button id="invoice-confirm-cancel"
          style="padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;
                 background:#f9fafb;cursor:pointer;font-size:14px;font-weight:500">
          Cancel
        </button>
        <button id="invoice-confirm-print"
          style="padding:10px 24px;border:none;border-radius:8px;
                 background:#126c5b;color:white;cursor:pointer;
                 font-size:14px;font-weight:600">
          Confirm &amp; Print with Logs
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close handlers
  const close = () => overlay.remove();
  document.getElementById("invoice-confirm-close").addEventListener("click", close);
  document.getElementById("invoice-confirm-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // Print handler
  document.getElementById("invoice-confirm-print").addEventListener("click", () => {
    close();
    const fullHTML = buildInvoiceHTML(client, invoice, payments, totalPaid, usageLogs, true);
    printInNewWindow(fullHTML);
  });
}