import { esc } from "../operations.js";
import { pState } from "../state.js";

export function clientModals(type, md) {
  const c = pState.selectedClient || {};

  if (type === "add-client") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:580px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Add New Client</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="add-client">
            <div class="form-grid">
              <label class="field"><span>Business Name</span>
                <input name="name" required placeholder="e.g. Your Business Name"></label>
              <p class="muted">Owner Setup Method: Manual (default). Create the confirmed owner Auth account directly in the Shop project after provisioning; no owner password is entered here. Email invitation is an optional action once infrastructure is ready.</p>
              <label class="field"><span>Business Owner Name</span><input name="owner_name" required maxlength="160" autocomplete="name"></label>
              <label class="field"><span>Business Owner Email</span><input name="owner_email" type="email" required maxlength="254" autocomplete="email"></label>
              <label class="field"><span>Paper Resupply / Thermal Paper Service</span><select name="paper_resupply_enabled"><option value="false">Not included</option><option value="true">Included</option></select></label>
              <p class="muted">Printing &amp; Thermal Tracking: Included</p>
              <label class="field"><span>Shop ownership</span><select name="pairing_mode"><option value="managed">Managed Shop</option><option value="byo">Client-owned Supabase — one-time manual pairing</option></select></label>
              <label class="field"><span>Industry</span>
                <input name="industry" value="Mobile Repair Shop"></label>
              <label class="field"><span>Plan</span>
                <select name="plan" id="onboard-plan-select">
                  <option value="Basic">Basic — POS + Tickets</option>
                  <option value="Pro">Pro — Basic + Workshop + Live Tracking</option>
                  <option value="Pro Plus">Pro Plus — Pro + Employee Management</option>
                </select>
              </label>
              <label class="field"><span>Break Tracking (requires Pro Plus / EMS)</span><select name="ems_track_breaks"><option value="false">Not selected</option><option value="true">Selected</option></select></label>
              <label class="field"><span>Billing Currency (ISO code)</span>
                <input name="currency" required pattern="[A-Z]{3}" maxlength="3" placeholder="USD / PKR / EUR" list="currency-codes"><datalist id="currency-codes"><option>PKR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>SAR</option><option>CAD</option><option>AUD</option></datalist></label>
              <label class="field" style="grid-column:1/-1"><span>Shop URL</span>
                <input name="shop_url" type="url" required placeholder="https://…"></label>
            </div>

            <div style="margin:16px 0 8px;padding:12px;background:var(--surface-2);border-radius:8px">
              <strong style="font-size:14px">Billing Rates</strong>
              <p class="muted" style="font-size:12px;margin:4px 0 12px">
                Rates agreed with client. Decimals supported (e.g. 4.50, 0.75, 12).
              </p>
              <div class="form-grid">
                <label class="field">
                  <span>Bill Rate (per receipt/bill generated)</span>
                  <input name="event_rate" type="number" min="0" step="any"
                    placeholder="e.g. 5 or 3.50 or 0.75" required>
                </label>
                <label class="field">
                  <span>Inventory Addon</span>
                  <select name="inventory_addon" id="onboard-inv-select">
                    <option value="false">Not included</option>
                    <option value="true">Included — charge per inventory item created</option>
                  </select>
                </label>
                <label class="field hidden" id="onboard-inv-rate-field" style="grid-column:1/-1">
                  <span>Inventory Rate (per inventory item created instance)</span>
                  <input name="inventory_rate" type="number" min="0" step="any"
                    placeholder="e.g. 1 or 0.50" value="0">
                </label>
              </div>
            </div>

            <div style="margin:16px 0 8px;padding:12px;background:var(--surface-2);border-radius:8px">
              <strong style="font-size:14px">Client Supabase Connection</strong>
              <div class="form-grid" style="margin-top:10px">
                <label class="field" style="grid-column:1/-1"><span>Shop Supabase Project Ref</span>
                  <input name="project_ref" pattern="[a-z]{20}" maxlength="20" placeholder="20-letter Shop project ref" required></label>
                <p class="muted">Next: provision the Shop securely from Client Detail. No public or privileged API key is saved in this client form.</p>
              </div>
            </div>

            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Save Client</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  if (type === "edit-client") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:520px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Edit — ${esc(c.name)}</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="edit-client">
            ${c.onboarding_version === 2 ? `<p>Shop ownership: ${c.pairing_mode==='byo'?'Client-owned / BYO':'Managed'} · immutable to preserve bindings and history.</p><input type="hidden" name="pairing_mode" value="${esc(c.pairing_mode)}">` : ''}
            <div class="form-grid">
              <label class="field"><span>Business Name</span>
                <input name="name" value="${esc(c.name || "")}"></label>
              <label class="field"><span>Industry</span>
                <input name="industry" value="${esc(c.industry || "")}"></label>
              <label class="field"><span>Plan</span>
                <select name="plan">
                  ${["Basic","Pro","Pro Plus"].map(p =>
                    `<option ${c.plan === p ? "selected" : ""}>${p}</option>`).join("")}
                </select>
              </label>
              <label class="field"><span>Billing Currency (ISO code)</span>
                <input name="currency" required pattern="[A-Z]{3}" maxlength="3" value="${esc(c.currency || "")}" placeholder="USD / PKR / EUR"></label>
              <label class="field" style="grid-column:1/-1"><span>Shop URL</span>
                <input name="shop_url" value="${esc(c.shop_url || "")}"></label>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Save</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  return null;
}
