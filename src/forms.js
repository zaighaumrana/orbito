import { pState, PCFG } from "./state.js";
import { pb, PLATFORM_AUTH_EMAIL, loadPlatform } from "./supabase.js";
import { render } from "./render.js";

function validatePassword(pw) {
  if (pw.length < 8)              return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw))         return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw))         return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw))  return "Password must contain at least one special character.";
  return null;
}

export async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.pForm;

  /* ── Add Client ── */
  if (type === "add-client") {
    const { error } = await pb.from("clients").insert({
      name:               data.name,
      industry:           data.industry || "Mobile Repair Shop",
      plan:               data.plan     || "Basic",
      status:             "Active",
      currency_symbol:    data.currency_symbol || "Rs.",
      event_rate:         Number(data.event_rate || 0),
      inventory_rate:     Number(data.inventory_rate || 0),
      bill_billable:      true,
      inventory_billable: data.inventory_addon === "true",
      supabase_url:       data.supabase_url,
      supabase_anon:      data.supabase_anon,
      shop_url:           data.shop_url || "",
    });
    if (error) { alert("Error: " + error.message); return; }

    // Bootstrap the client's Supabase Auth user automatically
    if (data.shop_auth_email && data.shop_auth_password) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const clientSb = createClient(data.supabase_url, data.supabase_anon);
        const { error: bootstrapErr } = await clientSb.functions.invoke("bootstrap-shop-auth", {
          body: {
            email:    data.shop_auth_email,
            password: data.shop_auth_password,
          },
        });
        if (bootstrapErr) {
          alert("Client saved but auth setup had an issue: " + bootstrapErr.message + "\nYou may need to create the auth user manually in their Supabase dashboard.");
        } else {
          alert(
            `✓ Client created and auth user bootstrapped.\n\n` +
            `Share these credentials with the shop owner:\n` +
            `Email: ${data.shop_auth_email}\n` +
            `Temp Password: ${data.shop_auth_password}\n\n` +
            `The owner will be forced to change their password on first login.`
          );
          // Write billing rates to client's own shop_config
          // so the POS can read them without accessing the platform DB
          try {
            await clientSb.from("shop_config")
              .update({
                event_rate:     Number(data.event_rate || 0),
                inventory_rate: Number(data.inventory_rate || 0),
              })
              .eq("id", 1);
          } catch (rateErr) {
            console.warn("Could not write rates to client shop_config:", rateErr.message);
            alert("Warning: billing rates could not be written to client shop_config. Update them manually in the client's Supabase.");
          }
        }
      } catch (e) {
        console.warn("Auth bootstrap failed:", e.message);
      }
    }

    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Client ── */
  if (type === "edit-client") {
    const { error } = await pb.from("clients").update({
      name:            data.name,
      industry:        data.industry,
      plan:            data.plan,
      shop_url:        data.shop_url,
      currency_symbol: data.currency_symbol,
    }).eq("id", pState.selectedClient.id);
    if (error) { alert("Error: " + error.message); return; }
    pState.selectedClient = { ...pState.selectedClient, ...data };
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Client Rates ── */
  if (type === "edit-client-rates") {
    const clientId    = Number(data.client_id);
    const newEvent    = parseFloat(data.event_rate);
    const newInv      = parseFloat(data.inventory_rate);
    const invBillable = data.inventory_billable === "true";
    const client      = pState.data.clients.find(c => c.id === clientId);

    const { error } = await pb.from("clients").update({
      event_rate:         newEvent,
      inventory_rate:     newInv,
      inventory_billable: invBillable,
    }).eq("id", clientId);
    if (error) { alert("Error: " + error.message); return; }

    if (client && Number(client.event_rate) !== newEvent) {
      await pb.from("pricing_rate_log").insert({
        client_id: clientId, module_type: "BILL",
        old_rate: Number(client.event_rate || 0), new_rate: newEvent,
      });
    }
    if (client && Number(client.inventory_rate) !== newInv) {
      await pb.from("pricing_rate_log").insert({
        client_id: clientId, module_type: "INVENTORY",
        old_rate: Number(client.inventory_rate || 0), new_rate: newInv,
      });
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Record Payment ── */
  if (type === "record-payment") {
    const invoiceId = Number(data.invoice_id);
    const clientId  = Number(data.client_id);
    const amount    = Number(data.amount);
    const invoice   = pState.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) return;

    const { error: payErr } = await pb.from("payments").insert({
      invoice_id:     invoiceId,
      client_id:      clientId,
      amount,
      payment_method: data.payment_method,
      payment_date:   data.payment_date,
      notes:          data.notes || "",
      recorded_by:    pState.currentUser.username || "admin",
    });
    if (payErr) { alert("Error: " + payErr.message); return; }

    await loadPlatform();
    const allPaid   = (pState.data.payments || []).filter(p => p.invoice_id === invoiceId)
                        .reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalDue  = Number(invoice.total_due || 0);
    const remaining = totalDue - allPaid;

    if (remaining <= 0) {
      await pb.from("billing_cycles")
        .update({ payment_status: "Paid", remaining_balance: 0 })
        .eq("id", invoiceId);
    } else {
      await pb.from("billing_cycles")
        .update({ payment_status: "Partial", remaining_balance: remaining })
        .eq("id", invoiceId);
      const existingCredit = (pState.data.credits || [])
        .find(c => c.source_invoice_id === invoiceId && !c.is_cleared);
      if (existingCredit) {
        await pb.from("client_credit")
          .update({ amount_outstanding: remaining })
          .eq("id", existingCredit.id);
      } else {
        await pb.from("client_credit").insert({
          client_id: clientId, source_invoice_id: invoiceId,
          amount_outstanding: remaining, is_cleared: false,
        });
      }
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Add Platform User (invite flow) ── */
  if (type === "add-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      alert("Only Master Admin can add users."); return;
    }
    const { error: fnErr } = await pb.functions.invoke("create-platform-user", {
      body: { email: data.email, name: data.name, role: data.role },
    });
    if (fnErr) { alert("Error sending invite: " + fnErr.message); return; }
    alert("Invite sent. They'll receive an email to set up their account.");
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Edit Platform User ── */
  if (type === "edit-platform-user") {
    if (pState.currentUser.role !== "master_admin") {
      alert("Only Master Admin can edit users."); return;
    }
    if (data.password) {
      const pwErr = validatePassword(data.password);
      if (pwErr) { alert(pwErr); return; }
    }
    const { error: dbErr } = await pb.from("platform_users").update({
      name: data.name, email: data.email, role: data.role,
    }).eq("id", data.id);
    if (dbErr) { alert("Error: " + dbErr.message); return; }

    if (data.email !== data.old_email || data.password) {
      const user = pState.data.platformUsers.find(u => u.id === data.id);
      const payload = { auth_user_id: user?.auth_user_id };
      if (data.email !== data.old_email) payload.email    = data.email;
      if (data.password)                 payload.password = data.password;
      const { error: fnErr } = await pb.functions.invoke("update-platform-user", { body: payload });
      if (fnErr) { alert("DB updated but auth error: " + fnErr.message); }
    }
    pState.modal = null;
    await loadPlatform(); render(); return;
  }

  /* ── Change Own Password (non-admin roles) ── */
  if (type === "change-own-password") {
    if (data.newpass !== data.confirm) { alert("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { alert(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { alert("Error: " + error.message); return; }
    alert("Password updated. Please log in again.");
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }

  /* ── Change Master Admin Username ── */
  if (type === "change-username") {
    const { error: authErr } = await pb.auth.signInWithPassword({
      email: PLATFORM_AUTH_EMAIL, password: data.current,
    });
    if (authErr) { alert("Current password is wrong."); return; }
    const { error } = await pb.from("platform_config")
      .update({ admin_username: data.new_username }).eq("id", 1);
    if (error) { alert("Error: " + error.message); return; }
    PCFG.admin_username = data.new_username;
    alert("Username updated.");
    render(); return;
  }

  /* ── Change Master Admin Password ── */
  if (type === "change-password") {
    if (data.newpass !== data.confirm) { alert("Passwords don't match."); return; }
    const pwErr = validatePassword(data.newpass);
    if (pwErr) { alert(pwErr); return; }
    const { error } = await pb.auth.updateUser({ password: data.newpass });
    if (error) { alert("Error: " + error.message); return; }
    await pb.from("platform_config")
      .update({ admin_password: data.newpass }).eq("id", 1);
    alert("Password updated. Please log in again.");
    await pb.auth.signOut();
    pState.authenticated = false;
    pState.page = "login";
    render(); return;
  }
}
