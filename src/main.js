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

/* ── Also check query param as fallback detection ── */
// Supabase v2 clears the hash before JS runs, so we cannot rely on
// window.location.hash.includes("type=recovery"). Instead we use
// onAuthStateChange below. However we also check ?reset=true as a
// secondary signal to put the app in a waiting state.
const hasResetParam = new URLSearchParams(window.location.search).has("reset");

/* ── Auth state change — primary recovery detection ── */
// In Supabase JS v2, PASSWORD_RECOVERY fires when the user lands on
// the redirectTo URL after clicking a reset/invite email link.
// The library processes the hash token automatically on createClient(),
// clears the hash, and emits this event. This is the only reliable
// way to detect the recovery flow in v2.
pb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    // Show the set-password form — do not proceed with normal boot
    pState.page = "reset-password";
    pState.authenticated = false;
    render();
  }
});

/* ── Boot — restore session if page is refreshed ── */
(async () => {
  // If ?reset=true is in the URL, Supabase is still processing the
  // hash token via onAuthStateChange above. Give it priority —
  // if PASSWORD_RECOVERY fires it will render the reset form.
  // We still call getSession() but only proceed with normal boot
  // if the event was NOT a recovery flow.
  const { data: { session } } = await pb.auth.getSession();

  // If we're on a reset URL and there's a session, it might be the
  // recovery session. Let onAuthStateChange handle it — don't boot
  // into the normal authenticated app.
  if (hasResetParam && session) {
    // onAuthStateChange will have fired PASSWORD_RECOVERY already
    // and rendered the reset form. Nothing to do here.
    return;
  }

  if (session && !hasResetParam) {
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

    // Render after all data loaded — this was the white screen bug
    render();
  } else if (!hasResetParam) {
    // No session, not a reset flow — show login
    render();
  }
  // If hasResetParam but no session yet: onAuthStateChange will handle it
})();