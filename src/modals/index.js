import { byoSetupModal } from '../client-setup.js';
import { clientModals }  from "./client.js";
import { billingModals } from "./billing.js";
import { userModals }    from "./users.js";
import { pState }        from "../state.js";

export function pModal() {
  if (!pState.modal) return "";
  const { type, data: md } = pState.modal;

  if(type==='byo-setup')return byoSetupModal(pState.selectedClient,pState.clientData);
  return (
    clientModals(type, md)  ||
    billingModals(type, md) ||
    userModals(type, md)    ||
    ""
  );
}
