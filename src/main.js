import { pb, loadConfig, loadPlatform } from "./supabase.js";
import { pState }                        from "./state.js";
import { render }                        from "./render.js";
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

/* ── Recovery flow detection ── */
// ?reset=true is present on both forgot-password and invite email links.
// We check this synchronously before any async work so the normal boot
// path never runs during a recovery flow — no race condition possible.
const hasResetParam = new URLSearchParams(window.location.search).get("reset") === "true";

if (hasResetParam) {
  /* Register PASSWORD_RECOVERY listener and stop here.
     Supabase v2 fires this event after it processes the hash token
     from the email link. The hash is already cleared by createClient()
     so we cannot check it directly — onAuthStateChange is the only
     reliable detection method in v2. */
  pb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      pState.page = "reset-password";
      pState.authenticated = false;
      render();
    }
  });
  // Do not fall through to normal boot — return immediately.
  // No getSession(), no platform_users query, no signOut() risk.
} else {
  /* Normal boot — only runs when there is no reset param in the URL */
  (async () => {
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
        await loadConfig();
        const { PCFG } = await import("./state.js");
        pState.currentUser = {
          role:     "master_admin",
          username: PCFG.admin_username || "admin",
          isMember: false,
        };
      } else {
        await loadConfig();
        const { data: userRow } = await pb.from("platform_users")
          .select("id, name, email, role, session_token")
          .eq("email", email)
          .single();

        if (!userRow) {
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
      render();
    } else {
      render();
    }
  })();
}