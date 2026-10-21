import { byoSetupModal, managedSetupModal } from '../client-setup.js';
import { clientModals }  from "./client.js";
import { billingModals } from "./billing.js";
import { userModals }    from "./users.js";
import { pState }        from "../state.js";
import {paperDecisionModal} from '../paper-supply.js';

export function pModal() {
  if (!pState.modal) return "";
  const { type, data: md } = pState.modal;
  if(type==='paper-decision')return ['master_admin','portfolio_manager'].includes(pState.currentUser?.role)?paperDecisionModal(pState.selectedClient,md):'';
  if(['add-platform-user','edit-platform-user','manage-platform-user','master-continuity'].includes(type) && pState.currentUser?.role!=='master_admin')return '';

  if(type==='byo-setup')return pState.currentUser?.role==='master_admin'?byoSetupModal(pState.selectedClient,pState.clientData,pState.byoWizard):'';
  if(['managed-setup','rotate-turnstile'].includes(type))return managedSetupModal(pState.selectedClient,pState.clientData,type);
  return (
    clientModals(type, md)  ||
    billingModals(type, md) ||
    userModals(type, md)    ||
    ""
  );
}
