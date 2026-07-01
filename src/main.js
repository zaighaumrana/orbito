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

/* ── Detect recovery / invite flow ──────────────────────────────────
   Supabase JS v2 uses PKCE — tokens arrive as ?code= query param,
   not as #type=recovery hash fragment (that was Auth v1 implicit flow).
   We detect the recovery landing by checking:
   1. The ?reset=true query param we set as our redirectTo
   2. OR a ?code= param (Supabase PKCE exchange code)
   3. OR legacy #type=recovery hash (fallback, some configs still use it)
─────────────────────────────────────────────────────────────────── */
const params       = new URLSearchParams(window.location.search);
const isRecoveryFlow =
  params.has("reset") ||                                    // our custom marker
  params.has("code") ||                                     // PKCE code exchange
  window.location.hash.includes("type=recovery");           // legacy fallback

if (isRecoveryFlow) {
  pState.page = "reset-password";
}

/* ── Boot ────────────────────────────────────────────────────────── */
(async () => {

  if (isRecoveryFlow) {
    /*
     * Recovery / invite landing — Supabase JS v2 automatically exchanges
     * the ?code= param for a session via onAuthStateChange. We just need
     * to render the reset-password form and let the user submit.
     * DO NOT query platform_users here — the session context during PKCE
     * exchange is a temporary recovery session, not a full platform session,
     * and the query would fail RLS or return wrong results.
     */
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

    /* Render after session restore — previously missing, caused white screen */
    render();
  } else {
    render();
  }
})();