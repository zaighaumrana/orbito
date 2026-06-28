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

/* ── Boot — restore session if page is refreshed ── */
(async () => {
  const { data: { session } } = await pb.auth.getSession();

  if (session) {
    /* Restore page from URL on refresh */
    const pathMap = {
      "/":         "overview",
      "/clients":  "clients",
      "/billing":  "billing",
      "/support":  "support",
      "/settings": "settings",
    };
    const restoredPage = pathMap[window.location.pathname] || "overview";

  if (session) {
    /* Determine if this is master admin or team member */
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

    /* Validate session immediately on restore */
    await validateSession();
  } else {
    render();
  }
})();