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

// ── Single session enforcement ────────────────────────────────────
export async function validateSession() {
  if (!pState.authenticated || !pState.currentUser.sessionToken) return;
  try {
    let storedToken = null;
    if (pState.currentUser.isMember) {
      const { data } = await pb.from("platform_users")
        .select("session_token")
        .eq("id", pState.currentUser.userId)
        .single();
      storedToken = data?.session_token;
    } else {
      const { data } = await pb.from("platform_config")
        .select("session_token")
        .eq("id", 1)
        .single();
      storedToken = data?.session_token;
    }
    if (storedToken !== pState.currentUser.sessionToken) {
      await pb.auth.signOut();
      pState.authenticated = false;
      pState.currentUser   = { role: "master_admin", username: "admin" };
      pState.page          = "login";
      pState.modal         = null;
      alert("Your session was ended because you logged in on another device.");
      const { render } = await import("./render.js");
      render();
    }
  } catch (e) {
    console.warn("Session check failed:", e.message);
  }
}
