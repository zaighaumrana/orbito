import { cancelDialogs } from './dialogs.js';
import { pState, PCFG, clearSensitiveState, refreshRoleState } from "./state.js";
import { pb, loadPlatform } from "./supabase.js";

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

let checking;
// A successful canonical denial is different from a transient network failure.
export async function validateSession(onInvalid) {
  if (!pState.authenticated) return;
  if(checking)return checking;
  const generation=pState.authorityGeneration;
  checking=(async()=>{
    let result;
    try{result=await pb.rpc('platform_session_status');}catch{return;}
    if(generation!==pState.authorityGeneration)return;
    if(!result.error && result.data?.authorized===true && result.data.auth_user_id===pState.currentUser.auth_user_id
      && result.data.role && result.data.role!==pState.currentUser.role){
      // Clear the old role's records as soon as the canonical change is detected,
      // even if the subsequent verified-user/data refresh cannot be reached.
      if(!['master_admin','portfolio_manager','billing_person'].includes(result.data.role))return;
      cancelDialogs();refreshRoleState({...pState.currentUser,role:result.data.role});const roleGeneration=pState.authorityGeneration;onInvalid();
      try{await loadPlatform();}catch{/* Explicit read-error state blocks financial actions. */}
      if(roleGeneration===pState.authorityGeneration)onInvalid();return;
    }
    const invalidJwt=result.error && (result.error.status===401 || ['PGRST301','PGRST303'].includes(result.error.code));
    const identityDrift=!result.error && result.data?.authorized===true && result.data.auth_user_id!==pState.currentUser.auth_user_id;
    if(!invalidJwt && !identityDrift && (result.error || result.data?.authorized!==false))return;
    cancelDialogs();pState.setupRouter?.clear();clearSensitiveState();pState.page='login';onInvalid();
    try{await pb.auth.signOut({scope:'local'});}catch{/* Revoked state stays cleared even offline. */}
  })().finally(()=>checking=null);
  return checking;
}
