import { clientModals }  from "./client.js";
import { billingModals } from "./billing.js";
import { userModals }    from "./users.js";
import { pState }        from "../state.js";

export function pModal() {
  if (!pState.modal) return "";
  const { type, data: md } = pState.modal;

  return (
    clientModals(type, md)  ||
    billingModals(type, md) ||
    userModals(type, md)    ||
    ""
  );
}
