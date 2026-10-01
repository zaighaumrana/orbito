import { pb, loadConfig, loadPlatform, loadOperatorIdentity } from "./supabase.js";
import { pState }                        from "./state.js";
import { render }                        from "./render.js";
import { initEvents }                    from "./events.js";
import { handleFormSubmit }              from "./forms.js";
import { validateSession }               from "./helpers.js";

/* ── Form submissions ── */
document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  try { await handleFormSubmit(event); } catch (error) { alert(error.message); }
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

/* Render before any session/network work so offline startup retains the login UI. */
render();

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
    try {
      pState.currentUser = await loadOperatorIdentity();
      await loadConfig();
    } catch (error) {
      await pb.auth.signOut();throw error;
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
})().catch(error => { pState.authenticated = false; pState.page = "login"; render(); alert(error.message); });
