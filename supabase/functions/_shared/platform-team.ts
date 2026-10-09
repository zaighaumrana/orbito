import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

// Gateway JWT checking is defense in depth; Auth + the canonical DB RPC decide.
// No service client exists until both checks succeed. Never log request bodies.
const roles = new Set(["portfolio_manager", "billing_person"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalized = (email: string) => email.trim().toLowerCase();
class TeamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function deny(status: number, message: string): never { throw new TeamError(status, message); }

export function platformTeamHandler(operation: "create" | "update" | "delete", clientFactory = createClient) {
  return async (req: Request) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Cache-Control": "no-store",
      "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    let admin: any, actor: any, operationId: string | undefined, targetId: string | undefined;
    let started = false, changed = false;
    let fields: string[] = [], priorRole: string | undefined, nextRole: string | undefined;
    const respond = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers });
    const audit = async (outcome: string) => {
      const { error } = await admin.from("operator_audit").insert({
        actor_id: actor.id, action: `platform_team_${operation}_${outcome}`,
        detail: { operation_id: operationId, target_id: targetId || null, fields,
          previous_role: priorRole || null, requested_role: nextRole || null, changes_may_have_occurred: changed },
      });
      if (error) deny(503, "Required audit unavailable; review the operation before retrying.");
    };
    try {
      // Trusted server configuration, never a browser redirect or Origin as authority.
      const site = new URL(Deno.env.get("PLATFORM_TEAM_SITE_URL") || "");
      if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/")
        deny(503, "Team management site configuration unavailable.");
      const origin = req.headers.get("Origin");
      if (origin && origin !== site.origin) deny(403, "Origin denied.");
      if (origin) headers["Access-Control-Allow-Origin"] = site.origin;
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (req.method !== "POST") deny(405, "POST required.");
      const bearer = req.headers.get("Authorization") || "";
      if (!/^Bearer \S+$/i.test(bearer)) deny(401, "Verified Auth session required.");
      const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
      if (!url || !anon) deny(503, "Auth configuration unavailable.");
      const caller = clientFactory(url, anon, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
      const authorize = async () => {
        const { data, error } = await caller.auth.getUser(bearer.slice(7));
        const user: any = data?.user;
        if (error || !user || !uuid.test(user.id) || user.is_anonymous || user.deleted_at ||
            (user.banned_until && new Date(user.banned_until).getTime() > Date.now())) deny(401, "Verified Auth session required.");
        const identity = await caller.rpc("platform_operator_identity");
        if (identity.error || identity.data?.role !== "master_admin" || identity.data?.auth_user_id !== user.id)
          deny(403, "Master administrator required.");
        if (actor && actor.id !== user.id) deny(403, "Caller identity changed.");
        actor = user;
      };
      await authorize();
      const text = await req.text();
      if (text.length > 8192) deny(413, "Request too large.");
      let body: any;
      try { body = JSON.parse(text); } catch { deny(400, "Invalid JSON."); }
      if (!body || Array.isArray(body) || typeof body !== "object") deny(400, "Invalid request.");
      const allowed = operation === "create" ? ["email", "name", "role"] : operation === "update" ? ["id", "auth_user_id", "email", "name", "role", "password"] : ["id", "auth_user_id"];
      if (Object.keys(body).some(key => !allowed.includes(key))) deny(400, "Unsupported request field.");
      if (body.role !== undefined && !roles.has(body.role)) deny(400, "Unsupported team role.");
      fields = Object.keys(body).filter(field => !["id", "auth_user_id"].includes(field));
      nextRole = body.role;
      if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160)) deny(400, "Invalid name.");
      if (body.email !== undefined) {
        if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) deny(400, "Invalid email.");
        body.email = normalized(body.email);
        if (!actor.email || body.email === normalized(actor.email)) deny(403, "Master account is protected.");
      }
      if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 256 || !/[A-Z]/.test(body.password) || !/[0-9]/.test(body.password) || !/[^A-Za-z0-9]/.test(body.password))) deny(400, "Password does not meet policy.");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!key) deny(503, "Team service configuration unavailable.");
      admin = clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      operationId = crypto.randomUUID();
      const rows = async (column: string, value: string) => {
        const { data, error } = await admin.from("platform_users").select("id,auth_user_id,email,name,role,status").eq(column, value).limit(2);
        if (error) deny(503, "Team records unavailable.");
        return data || [];
      };
      const account = async (row: any, desiredEmail?: string) => {
        if (!row.auth_user_id || !uuid.test(row.auth_user_id)) deny(409, "Linked Auth account requires operator review.");
        if (row.auth_user_id === actor.id || !roles.has(row.role)) deny(403, "Master or unsupported account is protected.");
        const duplicates = await rows("auth_user_id", row.auth_user_id);
        if (duplicates.length !== 1 || duplicates[0].id !== row.id) deny(409, "Ambiguous account ownership; operator review required.");
        const result = await admin.auth.admin.getUserById(row.auth_user_id);
        if (result.error || !result.data?.user) deny(409, "Linked Auth account requires operator review.");
        const user = result.data.user;
        if (user.id !== row.auth_user_id || !user.email || user.deleted_at || user.is_anonymous) deny(409, "Linked Auth account requires operator review.");
        // Existing UI writes the desired email to the team row before invoking
        // Auth update. Immutable server mapping remains authoritative in both UIs.
        if (normalized(user.email) !== normalized(row.email) && !desiredEmail) deny(409, "Account email drift; operator review required.");
        if (normalized(user.email) !== normalized(row.email) && desiredEmail !== normalized(row.email) && desiredEmail !== normalized(user.email)) deny(409, "Account email drift; operator review required.");
        return user;
      };
      const updateRow = async (row: any, values: any) => {
        let query = admin.from("platform_users").update(values).eq("id", row.id);
        query = row.auth_user_id === null ? query.is("auth_user_id", null) : query.eq("auth_user_id", row.auth_user_id);
        const result = await query.select("id");
        if (result.error || result.data?.length !== 1) deny(503, "Team update incomplete; review the operation before retrying.");
      };
      if (operation === "create") {
        if (!body.email || !body.name || !body.role) deny(400, "Email, name and role required.");
        // Escape LIKE metacharacters; mixed-case historical team emails exist.
        const existing = await admin.from("platform_users").select("id,auth_user_id,email,name,role,status").ilike("email", body.email.replace(/[\\%_]/g, "\\$&")).limit(2);
        if (existing.error) deny(503, "Team records unavailable.");
        if (existing.data?.length) {
          const row = existing.data[0]; targetId = row.id;
          if (existing.data.length !== 1 || row.status !== "Pending" || row.role !== body.role || row.name !== body.name.trim()) deny(409, "Team account already exists; operator review required.");
          await account(row); await authorize();
          await audit("retry_verified");
          return respond(200, { success: true, already_invited: true, operation_id: operationId });
        }
        // Never invite/adopt an already existing Auth identity (including orphans).
        let complete = false;
        for (let page = 1; page <= 50; page++) {
          const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (result.error || !Array.isArray(result.data?.users)) deny(503, "Auth inventory unavailable.");
          if (result.data.users.some((u: any) => u.email && normalized(u.email) === body.email)) deny(409, "Auth account already exists; operator review required.");
          if (result.data.users.length < 200) { complete = true; break; }
        }
        if (!complete) deny(503, "Auth inventory limit reached; operator review required.");
        await audit("started"); started = true;
        await authorize(); changed = true;
        const invited = await admin.auth.admin.inviteUserByEmail(body.email, { redirectTo: `${site.origin}/?reset=true` });
        if (invited.error || !invited.data?.user || invited.data.user.id === actor.id || !uuid.test(invited.data.user.id) || normalized(invited.data.user.email || "") !== body.email) deny(503, "Invitation outcome requires operator review; do not resend blindly.");
        await authorize();
        const inserted = await admin.from("platform_users").insert({ auth_user_id: invited.data.user.id, email: body.email, name: body.name.trim(), role: body.role, status: "Pending" }).select("id");
        if (inserted.error || inserted.data?.length !== 1) deny(503, "Invitation outcome requires operator review; do not resend blindly.");
        targetId = inserted.data[0].id;
      } else {
        if (!body.id && !body.auth_user_id) deny(400, "Team target required.");
        if ((body.id && (typeof body.id !== "string" || !uuid.test(body.id))) || (body.auth_user_id && (typeof body.auth_user_id !== "string" || !uuid.test(body.auth_user_id)))) deny(400, "Invalid team target.");
        if (body.auth_user_id === actor.id) deny(403, "Master account is protected.");
        const found = await rows(body.id ? "id" : "auth_user_id", body.id || body.auth_user_id);
        if (found.length !== 1) deny(404, "Unique team account not found.");
        const row = found[0]; targetId = row.id; priorRole = row.role;
        if (body.auth_user_id && body.auth_user_id !== row.auth_user_id) deny(409, "Conflicting team target.");
        if (!roles.has(row.role) || row.auth_user_id === actor.id) deny(403, "Master or unsupported account is protected.");
        if (operation === "update" && row.status === "Inactive") deny(409, "Inactive account requires operator review.");
        // Legacy unlinked records can be deactivated, never adopted as Auth IDs.
        if (operation !== "delete" || row.auth_user_id !== null) await account(row, operation === "update" ? body.email : undefined);
        if (operation === "update" && !["email", "name", "role", "password"].some(field => body[field] !== undefined)) deny(400, "No update requested.");
        await audit("started"); started = true;
        await authorize();
        if (operation === "delete") {
          // Revoke DB operator authority first; Auth is a separate transaction.
          changed = true; await updateRow(row, { status: "Inactive" });
          await authorize();
          if (row.auth_user_id !== null) {
            const result = await admin.auth.admin.deleteUser(row.auth_user_id);
            if (result.error) deny(503, "Team access revoked; Auth removal requires operator review.");
          }
        } else {
          const authUpdates: any = {};
          if (body.email !== undefined) authUpdates.email = body.email;
          if (body.password !== undefined) authUpdates.password = body.password;
          changed = true;
          if (Object.keys(authUpdates).length) {
            const result = await admin.auth.admin.updateUserById(row.auth_user_id, authUpdates);
            if (result.error) deny(503, "Auth update outcome requires operator review.");
          }
          await authorize();
          const values: any = {};
          for (const field of ["name", "email", "role"]) if (body[field] !== undefined) values[field] = field === "name" ? body[field].trim() : body[field];
          if (Object.keys(values).length) await updateRow(row, values);
        }
      }
      await audit("completed");
      return respond(200, { success: true, operation_id: operationId });
    } catch (error) {
      if (started) { try { await audit("failed"); } catch { /* Required start evidence remains; never disclose provider errors. */ } }
      return respond(error instanceof TeamError ? error.status : 503, {
        error: error instanceof TeamError ? error.message : "Team operation unavailable; operator review required.",
        ...(operationId ? { operation_id: operationId, changes_may_have_occurred: changed } : {}),
      });
    }
  };
}
