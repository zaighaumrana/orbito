import { createClient } from "@supabase/supabase-js";
import { pState, PCFG, setPCFG } from "./state.js";

export const pb = createClient(
  import.meta.env.VITE_PLATFORM_URL,
  import.meta.env.VITE_PLATFORM_ANON
);

export const PLATFORM_AUTH_EMAIL = import.meta.env.VITE_PLATFORM_AUTH_EMAIL;

// ── Config ───────────────────────────────────────────────────────
export async function loadConfig() {
  const { data } = await pb.from("platform_config").select("*").single();
  if (data) setPCFG(data);
}

// ── Full platform data load ───────────────────────────────────────
export async function loadPlatform() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [clients, support, usage, invoices, rateLog, payments, credits, platformUsers] = await Promise.all([
    pb.from("clients").select("*").order("created_at", { ascending: false }),
    pb.from("support_tickets").select("*").order("created_at", { ascending: false }),
    pb.from("usage_logs").select("*").gte("recorded_at", monthStart),
    pb.from("billing_cycles").select("*").order("created_at", { ascending: false }),
    pb.from("pricing_rate_log").select("*").order("changed_at", { ascending: false }).limit(50),
    pb.from("payments").select("*").order("created_at", { ascending: false }),
    pb.from("client_credit").select("*").order("created_at", { ascending: false }),
    pb.from("platform_users").select("id, auth_user_id, name, email, role, status, created_at").order("created_at", { ascending: false }),
  ]);
  pState.data.clients       = clients.data       || [];
  pState.data.support       = support.data       || [];
  pState.data.usage         = usage.data         || [];
  pState.data.invoices      = invoices.data       || [];
  pState.data.rateLog       = rateLog.data        || [];
  pState.data.payments      = payments.data       || [];
  pState.data.credits       = credits.data        || [];
  pState.data.platformUsers = platformUsers.data  || [];
}

// ── Client Supabase connection ────────────────────────────────────
export async function loadClientData(client) {
  try {
    const csb = createClient(client.supabase_url, client.supabase_anon);
    const [cfg, tickets, sales, employees, udhar] = await Promise.all([
      csb.from("shop_config").select("*").single(),
      csb.from("tickets").select("*").order("id", { ascending: false }).limit(50),
      csb.from("sales").select("*").order("id", { ascending: false }).limit(50),
      csb.from("employees").select("id, name, role, status"),
      csb.from("udhar").select("*").order("id", { ascending: false }).limit(30),
    ]);
    pState.clientData = {
      config:    cfg.data       || {},
      tickets:   tickets.data   || [],
      sales:     sales.data     || [],
      employees: employees.data || [],
      udhar:     udhar.data     || [],
      _sb:       csb,
    };
  } catch (e) {
    pState.clientData = { _error: e.message };
  }
}

export async function updateClientConfig(client, updates) {
  const { createClient: cc } = await import("@supabase/supabase-js");
  const csb = pState.clientData._sb || cc(client.supabase_url, client.supabase_anon);
  const { error } = await csb.from("shop_config").update(updates).eq("id", 1);
  if (error) { alert("Error updating client config: " + error.message); return false; }
  return true;
}
