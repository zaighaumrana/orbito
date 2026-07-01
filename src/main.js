import { pb, loadConfig, loadPlatform } from "./supabase.js";
import { pState }                        from "./state.js";
import { render, initTurnstile }         from "./render.js";
import { initEvents }                    from "./events.js";
import { handleFormSubmit }              from "./forms.js";
import { validateSession }               from "./helpers.js";

/* ── Turnstile global callback ── */
window.onTurnstileLoad = () => {
  const widget = document.querySelector(".cf-turnstile");
  if (widget && window.turnstile) {
    window.turnstile.render(widget, {
      sitekey:  import.meta.env.VITE_TURNSTILE_KEY,
      callback: (token) => { pState.turnstileToken = token; },
      theme:    "dark",
    });
  }
};

/* ── Form submissions ── */
document.addEventListener("submit", handleFormSubmit);

/* ── Wire up all click/input/keyboard events ── */
initEvents();

/* ── Browser back/forward navigation ── */
window.addEventListener("popstate", (event) => {
  if (!pState.authenticated) return;
  const pathMap = {
    "/":         "overview",
    "/clients":  "clients",
    "/billing":  "billing",
    "/support":  "support",
    "/settings": "settings",
  };
  const page = event.state?.page ||
    pathMap[window.location.pathname] ||
    "overview";
  pState.page   = page;
  pState.filter = "";
  if (page !== "client-detail") pState.selectedClient = null;
  import("./render.js").then(({ render }) => render());
});

/* ── Detect password reset / invite link landing ── */
// CHANGE 1: capture as a variable so the boot IIFE can check it
const isRecoveryFlow = window.location.hash.includes("type=recovery");
if (isRecoveryFlow) {
  pState.page = "reset-password";
}

/* ── Boot — restore session if page is refreshed ── */
(async () => {
  // CHANGE 1: on recovery/invite links, skip all role lookups and render
  // the reset-password form immediately. The Supabase recovery session is
  // already established by the link — calling signOut() would destroy it.
  if (isRecoveryFlow) {
    render();
    return;
  }

  const { data: { session } } = await pb.auth.getSession();

  if (session) {
    const pathMap = {
      "/":         "overview",
      "/clients":  "clients",
      "/billing":  "billing",
      "/support":  "support",
      "/settings": "settings",
    };
    const restoredPage = pathMap[window.location.pathname] || "overview";

    const email = session.user?.email;

    if (email === import.meta.env.VITE_PLATFORM_AUTH_EMAIL) {
      /* Master admin */
      await loadConfig();
      const { PCFG } = await import("./state.js");
      pState.currentUser = {
        role:     "master_admin",
        username: PCFG.admin_username || "admin",
        isMember: false,
      };
    } else {
      /* Team member — look up their role */
      await loadConfig();
      const { data: userRow } = await pb.from("platform_users")
        .select("id, name, email, role, session_token")
        .eq("email", email)
        .single();

      if (!userRow) {
        /* Unknown user — force logout */
        await pb.auth.signOut();
        pState.authenticated = false;
        pState.page = "login";
        render();
        return;
      }
      pState.currentUser = {
        role:         userRow.role,
        username:     userRow.name,
        email:        userRow.email,
        sessionToken: userRow.session_token,
        userId:       userRow.id,
        isMember:     true,
      };
    }

    pState.authenticated = true;
    pState.page = restoredPage;
    await loadPlatform();
    await validateSession();

    // CHANGE 2: render after session restore — previously missing,
    // causing white screen on every page refresh.
    render();
  } else {
    render();
  }
})();