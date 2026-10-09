import { pState, PCFG } from "./state.js";
import { pb } from "./supabase.js";

export const money = (v, sym) =>
  `${sym || PCFG.currency_symbol || "Rs."} ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const tit = (h, sub, action) => `
  <div class="page-title">
    <div><h1>${h}</h1><p class="muted">${sub}</p></div>
    <div>${action}</div>
  </div>`;

export function moduleToggleRow(label, sub, enabled, action) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:10px;background:var(--surface-2);border-radius:8px">
      <div>
        <strong>${label}</strong>
        <p class="muted" style="font-size:12px;margin:2px 0 0">${sub}</p>
      </div>
      <button class="${enabled ? "danger-button" : "primary-button"}"
        data-p-action="${action}" style="min-width:80px">
        ${enabled ? "Disable" : "Enable"}
      </button>
    </div>`;
}

// Supabase Auth owns sessions. Backend role checks remain authoritative.
export async function validateSession(onInvalid) {
  if (!pState.authenticated) return;
  const { data, error } = await pb.auth.getUser();
  if (error || !data.user) {
    await pb.auth.signOut(); pState.authenticated = false; pState.page = 'login';
    // The caller already imports render. Avoid a helpers → render → pages cycle.
    onInvalid();
  }
}
