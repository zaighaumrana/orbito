import { createSetupRouter } from './auth-setup.js';
import { notify, cancelDialogs } from './dialogs.js';
import { pb, loadConfig, loadPlatform, loadOperatorIdentity } from "./supabase.js";
import { pState, clearSensitiveState }                        from "./state.js";
import { render }                        from "./render.js";
import { initEvents }                    from "./events.js";
import { handleFormSubmit }              from "./forms.js";
import { validateSession }               from "./helpers.js";

/* ── Form submissions ── */
document.addEventListener("submit", async event => {
  if (event.target.dataset.authForm !== undefined) return;
  event.preventDefault();
  if (!pState.authenticated) return;
  const form = event.target;
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  try { await handleFormSubmit(event); } catch (error) { notify.error(error); }
  finally { delete form.dataset.busy; }
});

/* ── Wire up all click/input/keyboard events ── */
initEvents();

/* ── Browser back/forward navigation ── */
window.addEventListener("popstate", () => {
  if (!pState.authenticated) return;
  const pathMap = {
    "/":         "overview",
    "/clients":  "clients",
    "/billing":  "billing",
    "/support":  "support",
    "/settings": "settings",
  };
  const page = pathMap[window.location.pathname] || "overview";
  pState.page   = page;
  pState.filter = "";
  if (page !== "client-detail") pState.selectedClient = null;
  render();
});

/* Resolve both invitation and recovery callbacks through verified server state. */
const setupRouter = createSetupRouter({pb,state:pState,render,notify});
pState.setupRouter=setupRouter;
pb.auth.onAuthStateChange((event,session)=>{
  setupRouter.event(event,session);
  if(event==='SIGNED_OUT' && pState.authenticated){cancelDialogs();clearSensitiveState();pState.page='login';render();}
  if(event==='TOKEN_REFRESHED' || event==='SIGNED_IN')setTimeout(()=>void validateSession(render),0);
});
pState.authRouting=true;render();
(async()=>{
  const {data,error}=await pb.auth.getSession();if(error)throw error;
  if(await setupRouter.boot(data.session))return;
  pState.authRouting=false;
  if(!data.session){pState.page='login';render();return;}
  pState.currentUser=await loadOperatorIdentity();await loadConfig();
  pState.authenticated=true;
  pState.page=({'/':'overview','/clients':'clients','/billing':'billing','/support':'support','/settings':'settings'})[window.location.pathname] || 'overview';
  await loadPlatform();await validateSession(render);render();
})().catch(()=>{pState.authRouting=false;cancelDialogs();clearSensitiveState();pState.page='login';render();notify.error('Account verification is unavailable. Sign in again or retry when your connection is restored.');});
