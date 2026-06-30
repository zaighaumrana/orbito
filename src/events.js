import { pState }                          from "./state.js";
import { pb, PLATFORM_AUTH_EMAIL,
         loadPlatform, loadClientData,
         updateClientConfig }              from "./supabase.js";
import { render }                          from "./render.js";
import { generateInvoice, printClientInvoices } from "./billing.js";
import { validateSession }                 from "./helpers.js";
import { createClient }                    from "@supabase/supabase-js";

export function initEvents() {

  /* ── Click delegation ── */
  document.addEventListener("click", async event => {
    const el = event.target.closest(
      "button,a,[data-p-page],[data-p-action],[data-p-modal],[data-p-close]"
    );
    if (!el) return;

    /* Close modal */
    if (el.dataset.pClose !== undefined) {
      pState.modal = null; render(); return;
    }

    /* Page navigation */
    if (el.dataset.pPage) {
      if (!pState.authenticated) return;
      pState.page = el.dataset.pPage;
      pState.filter = "";
      if (el.dataset.pPage !== "client-detail") pState.selectedClient = null;
      render(); return;
    }

    /* Open modal */
    if (el.dataset.pModal) {
      pState.modal = { type: el.dataset.pModal }; render(); return;
    }

    const action = el.dataset.pAction;
    if (!action) return;

    /* Theme toggle */
    if (action === "theme") {
      pState.theme = pState.theme === "dark" ? "light" : "dark";
      localStorage.setItem("retailos-platform-theme", pState.theme);
      render(); return;
    }

    /* Mobile sidebar */
    if (action === "toggle-sidebar") {
      document.getElementById("p-sidebar")?.classList.toggle("open"); return;
    }

    /* ── Show forgot password page ── */
    if (action === "show-forgot-password") {
      pState.page = "forgot-password";
      render(); return;
    }

    /* ── Back to login ── */
    if (action === "back-to-login") {
      pState.page = "login";
      render(); return;
    }

    /* ── Send reset link ── */
    if (action === "send-reset-link") {
      const email = document.getElementById("forgot-email")?.value?.trim();
      const statusEl = document.getElementById("forgot-status");
      if (!email) {
        statusEl.textContent = "Please enter your email.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }
      pState.resetLoading = true; render();
      pState.page = "forgot-password"; // keep on this page after render
      const { error } = await pb.auth.resetPasswordForEmail(email, {
        redirectTo: "https://orbito.ahwad.com/?reset=true",
      });
      pState.resetLoading = false;
      render();
      const newStatusEl = document.getElementById("forgot-status");
      if (newStatusEl) {
        newStatusEl.textContent = "If an account exists for that email, a reset link has been sent.";
        newStatusEl.style.cssText += "color:#7aada0;background:rgba(122,173,160,0.1)";
        newStatusEl.classList.remove("hidden");
      }
      return;
    }

    /* ── Confirm new password from reset link ── */
    if (action === "confirm-reset-password") {
      const newpass = document.getElementById("reset-newpass")?.value;
      const confirm = document.getElementById("reset-confirm")?.value;
      const statusEl = document.getElementById("reset-status");

      if (newpass !== confirm) {
        statusEl.textContent = "Passwords don't match.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }
      if (newpass.length < 8 || !/[A-Z]/.test(newpass) || !/[0-9]/.test(newpass) || !/[^A-Za-z0-9]/.test(newpass)) {
        statusEl.textContent = "Password needs 8+ chars, an uppercase letter, a number, and a symbol.";
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }

      const { error } = await pb.auth.updateUser({ password: newpass });
      if (error) {
        statusEl.textContent = "Error: " + error.message;
        statusEl.style.cssText += "color:#c24132;background:rgba(194,65,50,0.1)";
        statusEl.classList.remove("hidden"); return;
      }

      /* Mark platform user as Active if they were Pending */
      const { data: { user } } = await pb.auth.getUser();
      if (user?.email) {
        await pb.from("platform_users")
          .update({ status: "Active" })
          .eq("email", user.email)
          .eq("status", "Pending");
      }

      statusEl.textContent = "Password updated! Redirecting to login…";
      statusEl.style.cssText += "color:#7aada0;background:rgba(122,173,160,0.1)";
      statusEl.classList.remove("hidden");

      await pb.auth.signOut();
      setTimeout(() => {
        pState.page = "login";
        render();
      }, 1500);
      return;
    }

    /* ── LOGIN ── */
    if (action === "do-login") {
      const username = document.getElementById("platform-username")?.value?.trim();
      const password = document.getElementById("platform-pin")?.value?.trim();
      const errorEl  = document.getElementById("platform-pin-error");
      errorEl?.classList.add("hidden");

      if (!pState.turnstileToken) {
        errorEl.textContent = "Please complete the CAPTCHA first.";
        errorEl?.classList.remove("hidden"); return;
      }
      if (!username || !password) {
        errorEl.textContent = "Username and password are required.";
        errorEl?.classList.remove("hidden"); return;
      }

      pState.loginLoading = true; render();

      const isEmail = username.includes("@");
      await pb.auth.signOut();

      if (isEmail) {
        /* Team member login */
        const { data: authData, error: authError } = await pb.auth.signInWithPassword({
          email: username, password,
        });
        if (authError || !authData.session) {
          _loginFail(errorEl); return;
        }
        const { data: userRow } = await pb.from("platform_users")
          .select("id, name, email, role")
          .eq("email", username)
          .single();
        if (!userRow) {
          await pb.auth.signOut();
          errorEl.textContent = "Access not authorised for this account.";
          _loginFail(errorEl, true); return;
        }
        /* Write session token */
        const sessionToken = crypto.randomUUID();
        await pb.from("platform_users")
          .update({ session_token: sessionToken, session_started_at: new Date().toISOString() })
          .eq("id", userRow.id);

        pState.currentUser = {
          role: userRow.role, username: userRow.name,
          email: userRow.email, sessionToken,
          userId: userRow.id, isMember: true,
        };
        const { loadConfig } = await import("./supabase.js");
        await loadConfig();
        pState.authenticated = true;
        pState.loginLoading  = false;
        pState.page = "overview";
        await loadPlatform(); render();

      } else {
        /* Master admin login */
        const { data: authData, error: authError } = await pb.auth.signInWithPassword({
          email: PLATFORM_AUTH_EMAIL, password,
        });
        if (authError || !authData.session) {
          _loginFail(errorEl); return;
        }
        const { loadConfig } = await import("./supabase.js");
        await loadConfig();

        const { PCFG } = await import("./state.js");
        if (String(username).toLowerCase() !== String(PCFG.admin_username || "admin").toLowerCase()) {
          await pb.auth.signOut();
          _loginFail(errorEl); return;
        }
        const sessionToken = crypto.randomUUID();
        await pb.from("platform_config")
          .update({ session_token: sessionToken, session_started_at: new Date().toISOString() })
          .eq("id", 1);

        pState.currentUser = {
          role: "master_admin",
          username: PCFG.admin_username || "admin",
          sessionToken, isMember: false,
        };
        pState.authenticated = true;
        pState.loginLoading  = false;
        pState.page = "overview";
        await loadPlatform(); render();
      }
      return;
    }

    /* ── LOGOUT ── */
    if (action === "logout") {
      await pb.auth.signOut();
      pState.authenticated = false;
      pState.currentUser   = { role: "master_admin", username: "admin" };
      pState.page          = "login";
      pState.turnstileToken = null;
      render(); return;
    }

    /* ── Open client detail ── */
    if (action === "open-client") {
      const client = pState.data.clients.find(c => String(c.id) === String(el.dataset.pId));
      if (!client) return;
      pState.selectedClient = client;
      pState.page           = "client-detail";
      pState.clientData     = {};
      render();
      await loadClientData(client);
      render(); return;
    }

    /* ── Suspend / Activate ── */
    if (action === "suspend-client" || action === "activate-client") {
      const newStatus = action === "suspend-client" ? "Suspended" : "Active";
      const targetId  = Number(el.dataset.pId);
      const { error } = await pb.from("clients").update({ status: newStatus }).eq("id", targetId);
      if (error) { alert(error.message); return; }
      const client = pState.data.clients.find(c => c.id === targetId) || pState.selectedClient;
      if (client?.supabase_url && client?.supabase_anon) {
        try {
          const csb = createClient(client.supabase_url, client.supabase_anon);
          await csb.from("shop_config").update({ suspended: newStatus === "Suspended" }).eq("id", 1);
        } catch (e) { console.warn("Could not propagate suspension:", e.message); }
      }
      if (pState.selectedClient?.id === targetId) pState.selectedClient.status = newStatus;
      await loadPlatform(); render(); return;
    }

    /* ── Module toggles ── */
    const toggleMap = {
      "toggle-repair":     "repair_module_enabled",
      "toggle-inventory":  "inventory_module_enabled",
      "toggle-technician": "technician_module_enabled",
      "toggle-tracking":   "live_tracking_enabled",
      "toggle-ems":        "ems_enabled",
    };
    if (toggleMap[action]) {
      const field = toggleMap[action];
      const cfg   = pState.clientData.config || {};
      const next  = !cfg[field];
      const ok    = await updateClientConfig(pState.selectedClient, { [field]: next });
      if (ok) { pState.clientData.config[field] = next; render(); }
      return;
    }

    /* ── Generate invoice ── */
    if (action === "generate-invoice") {
      const clientId = Number(el.dataset.pId);
      const client    = pState.data.clients.find(c => c.id === clientId);
      await generateInvoice(clientId);
      await loadPlatform();
      const newInvoice = pState.data.invoices
        .filter(i => i.client_id === clientId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      render();
      if (client && newInvoice) {
        printClientInvoices(client, [newInvoice]);
      }
      return;
    }

    /* ── Mark paid → open payment modal ── */
    if (action === "mark-paid") {
      pState.modal = {
        type: "record-payment",
        data: { invoiceId: Number(el.dataset.pId), clientId: Number(el.dataset.pClientId) },
      };
      render(); return;
    }

    /* ── Clear credit balance ── */
    if (action === "clear-credit") {
      const creditId  = Number(el.dataset.pId);
      const invoiceId = Number(el.dataset.pInvoiceId);
      const clientId  = Number(el.dataset.pClientId);
      const amount    = Number(el.dataset.pAmount);
      await pb.from("payments").insert({
        invoice_id: invoiceId, client_id: clientId, amount,
        payment_method: "Credit Clearance",
        payment_date:   new Date().toISOString().split("T")[0],
        notes:          "Outstanding balance cleared",
        recorded_by:    pState.currentUser.username || "admin",
      });
      await pb.from("client_credit")
        .update({ is_cleared: true, cleared_at: new Date().toISOString() })
        .eq("id", creditId);
      await loadPlatform();
      const invoice = pState.data.invoices.find(i => i.id === invoiceId);
      if (invoice) {
        const paid = (pState.data.payments || [])
          .filter(p => p.invoice_id === invoiceId)
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        if (paid >= Number(invoice.total_due || 0)) {
          await pb.from("billing_cycles").update({ payment_status: "Paid" }).eq("id", invoiceId);
          await loadPlatform();
        }
      }
      render(); return;
    }

    /* ── View invoice ── */
    if (action === "view-invoice") {
      pState.modal = { type: "view-invoice", data: { invoiceId: Number(el.dataset.pId) } };
      render(); return;
    }

    /* ── View logs ── */
    if (action === "view-logs") {
      pState.modal = { type: "view-logs", data: { clientId: Number(el.dataset.pId) } };
      render(); return;
    }

    /* ── Print invoice ── */
    if (action === "print-invoice") {
      const invoice = pState.data.invoices.find(i => i.id === Number(el.dataset.pId));
      const client  = pState.data.clients.find(c => c.id === invoice?.client_id);
      if (!invoice || !client) return;
      printClientInvoices(client, [invoice]); return;
    }

    /* ── Edit client rates ── */
    if (action === "edit-client-rates") {
      const client = pState.data.clients.find(c => String(c.id) === String(el.dataset.pId));
      if (!client) return;
      pState.modal = { type: "edit-client-rates", data: { client } };
      render(); return;
    }

    /* ── Delete client ── */
    if (action === "delete-client") {
      const clientId = Number(el.dataset.pId);
      const client   = pState.data.clients.find(c => c.id === clientId);
      if (!client) return;
      const role   = pState.currentUser.role;
      const isHard = role === "master_admin";
      if (!isHard && role !== "portfolio_manager") {
        alert("You don't have permission to delete clients."); return;
      }
      const msg = isHard
        ? `PERMANENTLY DELETE "${client.name}"? All invoices will be printed first. This cannot be undone.`
        : `Archive "${client.name}"? Records are kept but client is hidden.`;
      if (!confirm(msg)) return;

      const clientInvoices = pState.data.invoices.filter(i => i.client_id === clientId);
      if (clientInvoices.length > 0) {
        printClientInvoices(client, clientInvoices);
        await new Promise(r => setTimeout(r, 800));
      }
      if (isHard) {
        await pb.from("usage_logs").delete().eq("client_id", clientId);
        await pb.from("payments").delete().eq("client_id", clientId);
        await pb.from("client_credit").delete().eq("client_id", clientId);
        await pb.from("billing_cycles").delete().eq("client_id", clientId);
        await pb.from("support_tickets").delete().eq("client_id", clientId);
        await pb.from("clients").delete().eq("id", clientId);
      } else {
        await pb.from("clients").update({ status: "Archived" }).eq("id", clientId);
      }
      pState.selectedClient = null;
      pState.page = "clients";
      await loadPlatform(); render(); return;
    }

    /* ── Edit platform user ── */
    if (action === "edit-platform-user") {
      pState.modal = {
        type: "edit-platform-user",
        data: {
          id:    el.dataset.pId,
          name:  el.dataset.pName,
          email: el.dataset.pEmail,
          role:  el.dataset.pRole,
        },
      };
      render(); return;
    }

    /* ── Remove platform user ── */
    if (action === "remove-platform-user") {
      if (pState.currentUser.role !== "master_admin") {
        alert("Only Master Admin can remove users."); return;
      }
      if (!confirm("Remove this user? They will lose all access immediately.")) return;
      const userId = el.dataset.pId;
      const user   = pState.data.platformUsers.find(u => u.id === userId);
      if (user?.auth_user_id) {
        const { error: fnErr } = await pb.functions.invoke("delete-platform-user", {
          body: { auth_user_id: user.auth_user_id },
        });
        if (fnErr) { alert("Error removing auth account: " + fnErr.message); return; }
      }
      await pb.from("platform_users").delete().eq("id", userId);
      await loadPlatform(); render(); return;
    }

    /* ── Resolve support ticket ── */
    if (action === "resolve-ticket") {
      const { error } = await pb.from("support_tickets")
        .update({ status: "Resolved", resolved_at: new Date().toISOString() })
        .eq("id", el.dataset.pId);
      if (error) { alert(error.message); return; }
      await loadPlatform(); render(); return;
    }
  });

  /* ── Input (filter + dynamic form) ── */
  document.addEventListener("input", event => {
    if (event.target.dataset.pFilter !== undefined) {
      pState.filter = event.target.value; render();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "onboard-inv-select") {
      const rateField = document.getElementById("onboard-inv-rate-field");
      if (rateField) rateField.classList.toggle("hidden", event.target.value !== "true");
    }
  });

  /* ── Enter key on login ── */
  document.addEventListener("keydown", event => {
    if (event.key === "Enter" && !pState.authenticated) {
      document.querySelector("[data-p-action='do-login']")?.click();
    }
  });

  /* ── Online / offline ── */
  window.addEventListener("online",  () => { pState.online = true;  render(); });
  window.addEventListener("offline", () => { pState.online = false; render(); });

  /* ── Session check every 60s ── */
  setInterval(validateSession, 60 * 1000);
}

/* ── Login failure helper ── */
function _loginFail(errorEl, keepMsg = false) {
  pState.loginLoading   = false;
  pState.turnstileToken = null;
  if (window.turnstile) window.turnstile.reset();
  render();
  if (!keepMsg) {
    const el = document.getElementById("platform-pin-error");
    if (el) el.textContent = "Invalid username or password.";
  }
  document.getElementById("platform-pin-error")?.classList.remove("hidden");
}
