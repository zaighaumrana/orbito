import { notify, registerPrivateDialog } from './dialogs.js';
import { retryOperation, rpc, esc } from "./operations.js";
import { pState } from "./state.js";
import { pb } from "./supabase.js";
import { captureAuthority, authorityCurrent } from './async-context.js';

// ── Rate-locked billing computation ──────────────────────────────
export function computeClientBilling(clientId) {
  return (pState.data.usageSummary || []).find(u => u.client_id === clientId) || { billCount: 0, billTotal: 0, inventoryCount: 0, inventoryTotal: 0, todayTotal: 0, grandTotal: 0 };
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
  return retryOperation(`invoice:${clientId}`, { clientId }, request => rpc('platform_generate_invoice', { p_client: clientId, p_request: request }),{reconcile:request=>rpc('platform_financial_outcome',{p_kind:'invoice',p_request:request,p_target:clientId})});
}

// ── Lifecycle flag ────────────────────────────────────────────────
export function getLifecycleFlag(client) {
  const lastInvoice = (pState.data.latestInvoices || pState.data.invoices).find(i => i.client_id === client.id);
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
  const sym = esc(client.currency_symbol || "Rs.");

  const detailRows = includeDetailedLogs && usageLogs.length
    ? usageLogs.map(u => {
        const amount = Number(u.token_count || 1) * Number(u.rate_at_log || 0);
        const dt     = new Date(u.recorded_at);
        const dateStr = dt.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = dt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
        const desc    = u.module_type === "BILL" ? "POS / Repair Bill" : "Inventory Restock";
        return `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px;color:#526079">
              ${dateStr} ${timeStr}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;
                background:${u.module_type === "BILL" ? "#EEF2FF" : "#E8F5EE"};
                color:${u.module_type === "BILL" ? "#2548D8" : "#147D50"}">
                ${esc(u.module_type)}
              </span>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px">${desc}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px;text-align:center">
              ${u.token_count || 1}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px;text-align:right">
              ${sym} ${Number(u.rate_at_log || 0).toFixed(2)}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #DFE5F0;font-size:12px;text-align:right;font-weight:600">
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
        <tr style="background:#F5F7FC;border-bottom:2px solid #DFE5F0">
          <th style="padding:10px 8px;text-align:left;font-size:12px;color:#526079;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Description</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#526079;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#526079;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Rate</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;color:#526079;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.bill_count || 0) > 0 ? `
        <tr style="border-bottom:1px solid #DFE5F0">
          <td style="padding:10px 8px;font-size:13px">Bills Generated (POS &amp; Repair)</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${invoice.bill_count}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${sym} ${Number(invoice.event_rate || 0).toFixed(2)}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.bill_charges || 0).toLocaleString()}</td>
        </tr>` : ""}
        ${(invoice.inventory_count || 0) > 0 ? `
        <tr style="border-bottom:1px solid #DFE5F0">
          <td style="padding:10px 8px;font-size:13px">Inventory Additions</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${invoice.inventory_count}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px">${sym} ${Number(invoice.inventory_rate || 0).toFixed(2)}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.inventory_charges || 0).toLocaleString()}</td>
        </tr>` : ""}
        ${Number(invoice.carried_forward_balance || 0) > 0 ? `
        <tr style="border-bottom:1px solid #DFE5F0;color:#BB263B">
          <td style="padding:10px 8px;font-size:13px" colspan="3">Previous Outstanding Balance</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${Number(invoice.carried_forward_balance).toLocaleString()}</td>
        </tr>` : ""}
      </tbody>
      <tfoot>
        <tr style="background:#F5F7FC;border-top:2px solid #DFE5F0">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:700">Total Due</td>
          <td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700">${sym} ${Number(invoice.total_due || 0).toLocaleString()}</td>
        </tr>
        <tr style="color:#147D50">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:600">Total Paid</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:600">${sym} ${totalPaid.toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700;color:${Number(invoice.remaining_balance || 0) > 0 ? "#BB263B" : "#147D50"}">
          <td colspan="3" style="padding:10px 8px;font-size:13px;font-weight:700">Balance Remaining</td>
          <td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700">${sym} ${Number(invoice.remaining_balance || 0).toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>`;

  const detailSection = includeDetailedLogs && usageLogs.length ? `
    <div style="margin-top:28px">
      <h3 style="font-size:13px;font-weight:700;color:#0B1228;margin:0 0 10px;
                 padding-bottom:6px;border-bottom:2px solid #DFE5F0;text-transform:uppercase;
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
          <tr style="background:#F5F7FC;border-bottom:2px solid #DFE5F0">
            <th style="padding:8px;text-align:left;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Date &amp; Time</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Type</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Description</th>
            <th style="padding:8px;text-align:center;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Qty</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Rate</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#526079;font-weight:600;text-transform:uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>` : "";

  const paymentSection = payments.length ? `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #DFE5F0">
      <h3 style="font-size:12px;font-weight:700;color:#0B1228;margin:0 0 10px;
                 text-transform:uppercase;letter-spacing:0.5px">
        Payment History
      </h3>
      ${payments.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:6px 0;border-bottom:1px solid #DFE5F0;font-size:12px">
          <span style="color:#526079">${esc(p.payment_method)}</span>
          <span style="color:#526079">${new Date(p.payment_date).toLocaleDateString()}</span>
          <span style="font-weight:600;color:#147D50">${sym} ${Number(p.amount).toLocaleString()}</span>
        </div>`).join("")}
    </div>` : "";

  return `
    <div class="invoice-paper" style="font-family:Inter,Arial,sans-serif;
                color:#0B1228;max-width:780px;margin:0 auto;padding:40px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
        <div>
          <img src="/brand/logos/retrasell-horizontal-primary.svg" alt="RetraSell" width="180" height="63" style="display:block;margin:10px 0;object-fit:contain">
          <div style="font-size:12px;color:#526079;margin-top:4px">Platform Invoice Statement</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#0B1228">Invoice #INV-${invoice.id}</div>
          <div style="font-size:12px;color:#526079;margin-top:4px">
            Date: ${new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
          <div style="font-size:12px;color:#526079">
            Due: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
          </div>
          <div style="margin-top:8px">
            <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
              background:${invoice.payment_status === "Paid" ? "#E8F5EE" : invoice.payment_status === "Partial" ? "#FFF3DA" : "#FDEDF0"};
              color:${invoice.payment_status === "Paid" ? "#147D50" : invoice.payment_status === "Partial" ? "#8A5200" : "#BB263B"}">
              ${esc(invoice.payment_status || "Unpaid")}
            </span>
          </div>
        </div>
      </div>

      <!-- Client Info -->
      <div style="display:flex;justify-content:space-between;margin-bottom:28px;
                  padding:16px;background:#F5F7FC;border-radius:8px;border:1px solid #DFE5F0">
        <div>
          <div style="font-size:11px;color:#526079;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Bill To</div>
          <div style="font-size:15px;font-weight:700">${esc(client.name)}</div>
          <div style="font-size:12px;color:#526079;margin-top:2px">${esc(client.plan)} Plan</div>
          ${client.shop_url ? `<div style="font-size:12px;color:#2548D8;margin-top:2px">${esc(client.shop_url)}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#526079;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Billing Period</div>
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
      <div style="margin-top:36px;padding-top:16px;border-top:1px solid #DFE5F0;
                  text-align:center;font-size:11px;color:#526079">
        Generated by RetraSell Platform · ${new Date().toLocaleString()} ·
        ${includeDetailedLogs ? `${usageLogs.length} usage log entries included` : "Summary view"}
      </div>
    </div>`;
}

// ── Print invoice in a new clean window ──────────────────────────
// Opens a new blank window so browser chrome (URL, date, page number)
// shows that window's blank URL rather than the app URL.
function printInNewWindow(htmlContent) {
  const authority=captureAuthority();
  const current=()=>authorityCurrent(authority) && ['master_admin','billing_person'].includes(pState.currentUser.role) && pState.dataReady!==false;
  if(!current())return;
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    notify.error("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }
  let settled=false,deadline,watch;
  const finish=(ready=false,failed=false)=>{
    if(settled)return;
    settled=true;clearTimeout(deadline);clearInterval(watch);
    printWindow.removeEventListener('pagehide',cancel);
    window.removeEventListener('pagehide',cancel);
    try{if(ready && !printWindow.closed && current())printWindow.print();}
    catch{failed=true;}
    finally{
      const closed=printWindow.closed;
      if(!closed)printWindow.close();
      if(failed && !closed && current())notify.error('The invoice logo or Inter fonts could not load. Please reopen the preview before printing.');
    }
  };
  const cancel=()=>finish();
  window.addEventListener('pagehide',cancel,{once:true});
  // Bound asset failures and close private content even while readiness is pending.
  deadline=setTimeout(()=>finish(false,true),15000);
  watch=setInterval(()=>{if(printWindow.closed || !current())finish();},100);
  const weights=[400,500,600,700];
  const fontFaces=weights.map(weight=>`@font-face { font-family:Inter; font-style:normal; font-weight:${weight}; font-display:block; src:url("${esc(window.location.origin)}/brand/fonts/Inter-${weight}.woff2") format("woff2"); }`).join('\n');
  try{
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <base href="${esc(window.location.origin)}/">
  <title>Invoice</title>
  <style>
    ${fontFaces}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, Arial, sans-serif; }
    @media print {
      @page { margin: 15mm; size: A4; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>${htmlContent}</body>
</html>`);
    printWindow.document.close();
    printWindow.addEventListener('pagehide',cancel,{once:true});
    printWindow.focus();
    const fonts=printWindow.document.fonts;
    const fontsReady=Promise.all(weights.map(weight=>fonts.load(`${weight} 12px Inter`))).then(loaded=>{
      if(loaded.some(faces=>!faces.length))throw new Error('Invoice font unavailable');
      return fonts.ready;
    });
    const imagesReady=[...printWindow.document.images].map(image=>{
      if(image.complete && image.naturalWidth>0)return;
      return image.decode().then(()=>{if(!image.naturalWidth)throw new Error('Invoice logo unavailable');});
    });
    Promise.all([fontsReady,...imagesReady]).then(()=>finish(true),()=>finish(false,true));
  }catch{finish(false,true);}
}

// ── Print invoices (called from events.js after invoice generation) ─
export function printClientInvoices(client, invoices) {
  if(!pState.authenticated || !['master_admin','billing_person'].includes(pState.currentUser.role) || pState.dataReady===false)return;
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
  if(!pState.authenticated || !['master_admin','billing_person'].includes(pState.currentUser.role) || pState.dataReady===false)return '';
  const payments  = getInvoicePayments(invoice.id);
  const totalPaid = getInvoicePaidTotal(invoice.id);
  return buildInvoiceHTML(client, invoice, payments, totalPaid, [], false);
}

// ── Invoice confirmation modal (shown before printing) ────────────
// Call this from events.js for the "print-invoice" action.
// Shows a preview in a modal. User confirms → print with logs fires.
// User cancels → nothing happens (invoice already exists, no rollback needed).
export function showInvoiceConfirmModal(invoice) {
  if(!pState.authenticated || !['master_admin','billing_person'].includes(pState.currentUser.role) || pState.dataReady===false)return;
  const authority=captureAuthority();
  const client = pState.data.clients.find(c => c.id === invoice.client_id);
  if (!client) return;

  // Get usage logs for this invoice
  const usageLogs = (pState.data.usage || [])
    .filter(u => u.client_id === client.id && u.billing_cycle_id === invoice.id)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

  const payments  = getInvoicePayments(invoice.id);
  const totalPaid = getInvoicePaidTotal(invoice.id);

  const previewHTML = buildInvoiceHTML(client, invoice, payments, totalPaid, [], false);
  const sym = esc(client.currency_symbol || "Rs.");

  // Inject a temporary confirm overlay
  const overlay = document.createElement("div");
  overlay.id    = "invoice-confirm-overlay";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(5,9,11,0.7);
    display:grid;place-items:center;padding:18px;overflow-y:auto`;

  overlay.innerHTML = `
    <div id="invoice-preview-panel" class="invoice-preview" aria-labelledby="invoice-preview-title" style="background:var(--surface);border-radius:16px;max-width:820px;width:100%;
                max-height:92vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.3)">
      <!-- Modal header -->
      <div style="position:sticky;top:0;background:var(--surface);z-index:1;
                  padding:16px 20px;border-bottom:1px solid var(--border);
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 id="invoice-preview-title" style="font-size:18px">Invoice Preview — INV-${invoice.id}</h2>
          <p style="font-size:14px;color:var(--muted);margin-top:2px">
            ${usageLogs.length} usage log entries will be included when printed.
            Review the summary below and confirm to print.
          </p>
        </div>
        <button id="invoice-confirm-close" class="icon-button" aria-label="Close invoice preview"
          style="background:none;border:none;font-size:22px;cursor:pointer;
                 color:var(--muted);padding:4px 8px;line-height:1">✕</button>
      </div>

      <!-- Invoice preview (summary only) -->
      <div style="padding:0">
        ${previewHTML}
      </div>

      <!-- Log count info -->
      <div style="margin:0 40px 20px;padding:12px 16px;
                  background:var(--rs-info-bg);border:1px solid var(--rs-info);border-radius:8px;
                  font-size:14px;color:var(--rs-info)">
        ✓ When you click "Confirm &amp; Print", the full invoice with all
        <strong>${usageLogs.length} usage log entries</strong>
        (${usageLogs.filter(u => u.module_type === "BILL").length} bills +
        ${usageLogs.filter(u => u.module_type === "INVENTORY").length} inventory)
        will be included in the printed/PDF document.
      </div>

      <!-- Actions -->
      <div style="padding:16px 20px;border-top:1px solid var(--border);
                  display:flex;justify-content:flex-end;gap:10px;
                  position:sticky;bottom:0;background:var(--surface)">
        <button id="invoice-confirm-cancel" class="secondary-button">
          Cancel
        </button>
        <button id="invoice-confirm-print"
          class="primary-button" style="padding:10px 24px;border:none;border-radius:8px;
                 background:var(--primary);color:var(--rs-on-primary);cursor:pointer;
                 font-size:14px;font-weight:600">
          Confirm &amp; Print with Logs
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close handlers
  let detach=()=>{};
  const close = () => {detach();overlay.remove();};
  detach=registerPrivateDialog(document.getElementById('invoice-preview-panel'),close);
  document.getElementById("invoice-confirm-close").addEventListener("click", close);
  document.getElementById("invoice-confirm-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // Print handler
  document.getElementById("invoice-confirm-print").addEventListener("click", () => {
    close();
    if(!authorityCurrent(authority))return;
    const fullHTML = buildInvoiceHTML(client, invoice, payments, totalPaid, usageLogs, true);
    printInNewWindow(fullHTML);
  });
}
