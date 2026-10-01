import { copyValue } from '../client-setup.js';
import { provisioningPanel } from '../provisioning.js';
import { esc } from "../operations.js";
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
        value="${esc(pState.filter)}" style="min-width:260px">
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
                <strong>${esc(c.name)}</strong>
                <p class="muted" style="font-size:13px;margin-top:3px">${esc(c.industry || "—")} · ${esc(c.plan)}</p>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                <span class="badge ${c.status === "Active" ? "good" : "bad"}">${esc(c.status)}</span>
                ${lifecycle ? `<span class="badge ${lifecycle.cls}">${lifecycle.label}</span>` : ""}
              </div>
            </div>
            <div style="font-size:13px;color:var(--muted)">${esc(c.shop_url || "No shop URL set")}</div>
            <div style="font-size:13px;display:flex;gap:16px">
              <span>Currency: <strong>${esc(c.currency_symbol || "Rs.")}</strong></span>
              <span>Uninvoiced: <strong>${esc(c.currency || "Unconfigured")} ${b.grandTotal.toLocaleString()}</strong></span>
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
                Retain history
              </button>
            </div>
          </div>`;
      }).join("") : `<div class="empty">No clients yet. Add your first client.</div>`}
    </div>`;
}

export function pageClientDetail() {
  const c = pState.selectedClient;
  if (!c) return '<p>No client selected.</p>';
  const cd = pState.clientData, o = cd.operations;
  let openShop='';
  try {
    const url=new URL(c.shop_url);
    if(['https:','http:'].includes(url.protocol) && !url.username && !url.password)
      openShop=`<a class="secondary-button" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Open Shop ↗</a>`;
  } catch {}
  const head = `<div class="page-title client-detail-header"><div><div class="setup-heading"><h1>${esc(c.name)}</h1><span class="badge ${c.status==='Active'?'good':'bad'}">${esc(c.status)}</span><span class="badge">${esc(c.plan)}</span></div><p>Client #${esc(c.id)} ${copyValue(c.id,'Copy ID')} · ${esc(c.industry||'Business')} · ${c.pairing_mode==='byo'?'Client-owned Supabase':'Managed Supabase'}</p></div><div class="setup-secondary">${openShop}<button class="secondary-button" data-p-modal="edit-client">Edit Client</button><button class="secondary-button" data-p-page="clients">← Back</button></div></div>`;

  if (cd._error) return head + `<div class="card">Operations unavailable: ${esc(cd._error)}</div>`;
  if (!o) return head + '<div class="card">Loading operations…</div>';
  const billing = computeClientBilling(c.id), thermal = o.thermal || {}, source = o.source;
  const metres = value => (Number(value || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const flag = (label, field, action) => moduleToggleRow(label,
    field === 'paper_resupply_enabled' ? 'Owner request capability only; thermal collection always continues' : (cd.verifiedAt || c.config_synced_at) ? 'Last verified Shop configuration' : 'Not yet verified with Shop', cd.config?.[field] === true, action);
  const canConfig = ['master_admin','portfolio_manager'].includes(pState.currentUser.role);
  const canBill = ['master_admin','billing_person'].includes(pState.currentUser.role);
  const ready = c.billing_policy === 'usage-v1' && c.currency && !c.accounting_review_required;
  const projection = o.projection?.payload;
  const safeAmount = value => value == null ? 'Unavailable' : esc(`${c.currency || c.currency_symbol} ${Number(value).toLocaleString()}`);
  return head + provisioningPanel(c, cd) + `
  <div class="grid two-col">
    <div class="card"><h2>Modules / Entitlements</h2><details><summary>Manage modules</summary>
      ${canConfig ? [flag('Repairs','repair_module_enabled','toggle-repair'),flag('Inventory','inventory_module_enabled','toggle-inventory'),
        flag('Technician / Workshop','technician_module_enabled','toggle-technician'),flag('Live Tracking','live_tracking_enabled','toggle-tracking'),
        flag('EMS','ems_enabled','toggle-ems'),flag('Paper Resupply','paper_resupply_enabled','toggle-paper')].join('') : '<p>Module changes require a portfolio manager or master administrator.</p>'}
      <p class="muted">Shop config verified: ${esc(cd.verifiedAt || c.config_synced_at || 'Not synced')}. Paper capability reaches the Shop on its next bridge poll.</p>
      ${canConfig ? `<button class="secondary-button" data-p-action="${c.status === 'Active' ? 'suspend-client' : 'activate-client'}" data-p-id="${c.id}">${c.status === 'Active' ? 'Suspend' : 'Activate'}</button>` : ''}
      ${canConfig ? '<button class="secondary-button" data-p-action="read-shop-config">Read current Shop settings</button>' : ''}
      </details>
    </div>
    <div class="card"><h2>Billing</h2>
      <p>${ready ? 'Usage policy active' : 'Accounting blocked: select an agreed policy/currency and reconcile flagged history.'}</p>
      <p>BILL ${billing.billCount} · INVENTORY ${billing.inventoryCount}</p>
      <p>Estimated Current Charges: <strong>${ready ? safeAmount(billing.grandTotal) : 'Unavailable'}</strong></p>
      <p>Issued outstanding: <strong>${safeAmount(projection?.outstanding_total)}</strong></p>
      <p class="muted">Per-event rate snapshots; unpaid invoices remain separate. THERMAL adds no charge.</p>
      ${canBill ? `<button class="secondary-button" data-p-action="edit-client-rates" data-p-id="${c.id}">Edit Rates</button>
      <button class="secondary-button" data-p-action="generate-invoice" data-p-id="${c.id}" ${ready ? '' : 'disabled'}>Generate Invoice</button>` : ''}
      <details class="setup-advanced"><summary>Advanced / Technical Details · Billing Sync</summary>
      <p>Source: ${esc(source?.source_id || 'Not provisioned')}</p>
      <p>Last exchange: ${esc(source?.last_received_at || 'Never')} · ${source?.enabled ? 'Enabled' : 'Disabled'}</p>
      <p>Billing revision: ${esc(o.projection?.sync_version || 'Unavailable')} · ${esc(o.projection?.updated_at || '')}</p>
      <p>Received / billed / settled through: ${esc(projection?.estimate_through ?? "—")} / ${esc(projection?.billed_through ?? "—")} / ${esc(projection?.settled_through ?? "—")}</p>
      <p>Usage cutover sequence: ${esc(source?.usage_from_sequence ?? 'Not configured')}</p>
      <p class="muted">${esc(source?.last_error || 'No recorded event rejection')}. Exchange time does not prove the Shop applied a projection or that its outbox is empty.</p>
      <button class="secondary-button" data-p-action="refresh-operations">Refresh</button></details>
    </div>
  </div>
  <div class="card"><h2>Thermal Usage / Paper Audit</h2>
    <p>Estimated intent: <strong>${metres(thermal.estimated_mm)} m</strong> · Reprints: ${metres(thermal.reprint_mm)} m · Incomplete measurements: ${Number(thermal.unavailable || 0)} / ${Number(thermal.events || 0)}</p>
    <p>Confirmed delivered capacity: <strong>${metres(o.supplied_mm)} m</strong> · Capacity less estimated use: ${metres(Number(o.supplied_mm || 0)-Number(thermal.estimated_mm || 0))} m</p>
    <p class="muted">Software estimates, not verified physical output. Historical coverage may be incomplete. No automatic resupply denial. Collection continues with Paper Resupply ${c.paper_resupply_enabled ? 'ON' : 'OFF'}.</p>
    <h3>Monthly trend by document / width (UTC)</h3>
    <div class="table-wrap"><table><thead><tr><th>Month</th><th>Document</th><th>Width mm</th><th>Events</th><th>Estimated m</th><th>Reprint m</th><th>Incomplete</th></tr></thead><tbody>
    ${(o.thermal_periods || []).map(t=>`<tr><td>${esc(t.month)}</td><td>${esc(t.document_type)}</td><td>${esc(t.paper_width_mm)}</td><td>${t.events}</td><td>${metres(t.estimated_mm)}</td><td>${metres(t.reprint_mm)}</td><td>${t.unavailable}</td></tr>`).join('') || '<tr><td colspan="7">No thermal events ingested.</td></tr>'}
    </tbody></table></div><p class="muted">Latest 120 period/document/width groups. Lifetime totals above include all records.</p>
  </div>
  <div class="card"><h2>Paper Requests / Deliveries</h2>
    ${(o.requests || []).map(r=>`<div class="list-row"><span>${esc(r.request_id)}<br>${esc(r.requested_at)}</span><strong>${esc(r.status)} · v${r.sync_version}</strong>
    ${canConfig && r.status === 'requested' ? `<span><button data-p-action="paper-status" data-id="${r.request_id}" data-version="${r.sync_version}" data-status="rejected">Reject</button> <button data-p-action="paper-status" data-id="${r.request_id}" data-version="${r.sync_version}" data-status="cancelled">Cancel</button></span>` : ''}</div>`).join('') || '<p>No requests.</p>'}
    ${canConfig ? `<h3>Record confirmed delivery</h3><form data-p-form="paper-delivery" class="form-grid">
      <label class="field"><span>Related request</span><select name="request_id"><option value="">Standalone supply</option>${(o.requests || []).filter(r=>r.status==='requested').map(r=>`<option value="${r.request_id}">${esc(r.request_id)}</option>`).join('')}</select></label>
      <label class="field"><span>Delivery reference</span><input name="reference" required maxlength="150"></label>
      <label class="field"><span>Rolls</span><input name="roll_count" type="number" min="1" step="1" required></label>
      <label class="field"><span>Usable length per roll (mm)</span><input name="usable_length_mm" type="number" min="1" step="1" required></label>
      <label class="field"><span>Width (mm)</span><input name="paper_width_mm" type="number" min="1" step="1" value="80" required></label>
      <label class="field"><span>Delivered at (local time)</span><input name="delivered_at" type="datetime-local" required></label>
      <button class="secondary-button" type="submit">Confirm delivered supply / fulfill request</button></form>` : ''}
    <h3>Recent confirmed supplies</h3>${(o.supplies || []).map(d=>`<p>${esc(d.reference)} · ${d.roll_count} × ${metres(d.usable_length_mm)} m · width ${d.paper_width_mm} mm · ${esc(d.delivered_at)}</p>`).join('') || '<p>No delivered supply recorded.</p>'}
  </div>
  <div class="card"><h2>Invoice History</h2>${(pState.data.invoices || []).filter(i=>i.client_id===c.id).map(i=>`<div class="list-row"><span>INV-${i.id} · ${esc(i.period_start)} — ${esc(i.period_end)}</span><strong>${safeAmount(i.total_due)} · ${esc(i.payment_status)}</strong><span><button data-p-action="view-invoice" data-p-id="${i.id}">View</button>${canBill && ready && i.payment_status!=='Paid' ? `<button data-p-action="mark-paid" data-p-id="${i.id}" data-p-client-id="${c.id}">Record Payment</button>` : ''}</span></div>`).join('') || '<p>No invoices.</p>'}</div>
  <details class="card setup-advanced"><summary>Advanced / Reconciliation History</summary>
    ${(o.failures || []).map(f=>`<p>${esc(f.recorded_at)} · ${esc(f.event_id)} · ${esc(f.reason)}</p>`).join('') || '<p>No ingestion failures recorded.</p>'}
    ${(o.config_jobs || []).map(j=>`<p>${esc(j.created_at)} · ${esc(j.state)} · ${esc(JSON.stringify(j.changes))}</p>`).join('')}
    <p class="muted">Uncertain configuration writes require server-side read-back before releasing the pending operation. No automatic concurrent retry.</p>
  </details>`;
}
