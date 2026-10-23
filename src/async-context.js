import { pState } from './state.js';

// Browser continuity only; server authorization remains authoritative. A response
// from a departed view/session cannot publish private state or start another write.
export function captureAuthority() {
  const u=pState.currentUser;
  return {generation:pState.authorityGeneration,id:u?.auth_user_id,session:u?.session_id,token:u?.sessionToken,role:u?.role};
}
export function authorityCurrent(context) {
  const u=pState.currentUser;
  return pState.authenticated && Boolean(context.id) && context.generation===pState.authorityGeneration
    && context.id===u?.auth_user_id && context.session===u?.session_id
    && context.token===u?.sessionToken && context.role===u?.role;
}
export function captureView() {
  return {...captureAuthority(),page:pState.page,client:pState.selectedClient?.id,
    selection:pState.clientSelectionGeneration,modal:pState.modal};
}
export function viewCurrent(context,checkModal=true) {
  return authorityCurrent(context) && context.page===pState.page && context.client===pState.selectedClient?.id
    && context.selection===pState.clientSelectionGeneration && (!checkModal || context.modal===pState.modal);
}
export function selectClient(client=null) {
  pState.clientSelectionGeneration++;
  pState.clientRequestGeneration++;
  pState.clientFinanceLoaded=null;pState.financeOffset=0;
  pState.backendInventory=null;pState.inventoryRequest=(pState.inventoryRequest||0)+1;
  pState.selectedClient=client;
  pState.clientData={};
}
export function clientDataMatches(client=pState.selectedClient) {
  const detail=pState.clientData || {};
  return pState.authenticated && Boolean(client) && client.id===pState.selectedClient?.id
    && !detail.loading && !detail._error && detail.clientId===client.id && detail.config?.id===client.id
    && detail.requestGeneration===pState.clientRequestGeneration;
}
