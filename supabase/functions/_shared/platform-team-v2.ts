import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = (s: string) => s.trim().toLowerCase();
class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
function requireThat(ok: unknown, status: number, message: string): asserts ok { if (!ok) throw new Failure(status, message); }
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
function environment() {
  const origin = new URL(Deno.env.get("PLATFORM_TEAM_SITE_URL") || "");
  requireThat(origin.protocol === "https:" && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password, 503, "Site configuration unavailable.");
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  requireThat(url && anon && service, 503, "Service configuration unavailable.");
  return { origin: origin.origin, url, anon, service };
}
function verified(user: any) {
  return user && uuid.test(user.id) && user.email && user.email_confirmed_at && !user.is_anonymous && !user.deleted_at && (!user.banned_until || Date.parse(user.banned_until) <= Date.now());
}
async function bodyOf(req: Request, allowed: string[]) {
  const raw = await req.text(); requireThat(raw.length <= 8192, 413, "Request too large.");
  let body: any; try { body = JSON.parse(raw); } catch { throw new Failure(400, "Invalid request."); }
  requireThat(body && !Array.isArray(body) && typeof body === "object" && Object.keys(body).every(k => allowed.includes(k)), 400, "Unsupported request field.");
  return body;
}
async function rpc(client: any, name: string, args: any) {
  const result = await client.rpc(name, args);
  requireThat(!result.error && result.data !== null && result.data !== undefined, 409, "Operation not authorized, expired or requires reconciliation.");
  return result.data;
}
async function master(caller: any, token: string, original?: any) {
  const result = await caller.auth.getUser(token);
  requireThat(!result.error && verified(result.data?.user), 401, "Verified Auth session required.");
  const user = result.data.user;
  const identity = await caller.rpc("platform_operator_identity");
  requireThat(!identity.error && identity.data?.role === "master_admin" && identity.data?.auth_user_id === user.id && (!original || original.id === user.id), 403, "Master administrator required.");
  requireThat(uuid.test(identity.data?.session_id || ""), 403, "Live master session required.");
  return { ...user, session_id: identity.data.session_id, password_verification_safe:identity.data.password_verification_safe === true };
}
function bearer(req: Request) {
  const value = req.headers.get("Authorization") || "";
  requireThat(/^Bearer \S+$/i.test(value), 401, "Verified Auth session required."); return value.slice(7);
}
function publicHandler(work: (req: Request, env: ReturnType<typeof environment>) => Promise<any>) {
  return async (req: Request) => {
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    try {
      const env = environment(), origin = req.headers.get("Origin");
      requireThat(!origin || origin === env.origin, 403, "Origin denied.");
      if (origin) headers["Access-Control-Allow-Origin"] = env.origin;
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      requireThat(req.method === "POST", 405, "POST required.");
      return new Response(JSON.stringify(await work(req, env)), { status: 200, headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Failure ? error.message : "Operation unavailable; review before retrying.", review_required: true }), { status: error instanceof Failure ? error.status : 503, headers });
    }
  };
}
async function linked(admin: any, row: any, allowMissing = false, allowBan = false) {
  if (!row.auth_user_id) { requireThat(allowMissing, 409, "Legacy unlinked identity requires review."); return null; }
  const result = await admin.auth.admin.getUserById(row.auth_user_id);
  if (result.error?.status === 404 && allowMissing) return null;
  requireThat(!result.error && result.data?.user, 409, "Auth identity lookup failed; absence is not proven.");
  const user = result.data.user;
  requireThat(user.id === row.auth_user_id && user.email && email(user.email) === email(row.email) && !user.deleted_at && !user.is_anonymous && (allowBan || !user.banned_until || Date.parse(user.banned_until) <= Date.now()), 409, "Auth identity is blocked or has drifted.");
  return user;
}

export function teamV2Handler(action: "create" | "update" | "delete" | "deactivate" | "reactivate", factory = createClient) {
  return publicHandler(async (req, env) => {
    const token = bearer(req), caller = factory(env.url, env.anon, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const actor = await master(caller, token);
    const body = await bodyOf(req, ["id", "request_id", "name", "email", "role", "password", "captchaToken", "acknowledged", "reason", "reconcile"]);
    requireThat(uuid.test(body.request_id || "") && (action === "create" || uuid.test(body.id || "")), 400, "Stable operation and target UUID required.");
    const requestId = body.request_id, targetId = action === "create" ? requestId : body.id;
    if (body.email !== undefined) requireThat(typeof body.email === "string" && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email), 400, "Invalid email.");
    if (body.name !== undefined) requireThat(typeof body.name === "string" && body.name.trim() && body.name.length <= 160, 400, "Invalid name.");
    if (body.role !== undefined) requireThat(["portfolio_manager", "billing_person"].includes(body.role), 400, "Unsupported team role.");
    if (body.reason !== undefined) requireThat(typeof body.reason === "string" && body.reason.length <= 500, 400, "Invalid reason.");
    requireThat(action === "delete" || body.password === undefined, 400, "Team passwords are employee-controlled.");
    if (action === "delete") {
      requireThat(actor.password_verification_safe, 503, "Master session continuity must be verified before deletion is enabled.");
      requireThat(body.acknowledged === true && typeof body.password === "string" && body.password.length > 0 && body.password.length <= 256 && typeof body.captchaToken === "string" && body.captchaToken, 400, "Password, fresh CAPTCHA and acknowledgment required.");
      const verifier = factory(env.url, env.anon, options);
      let verification: any;
      try {
        verification = await verifier.auth.signInWithPassword({ email: actor.email, password: body.password, options: { captchaToken: body.captchaToken } });
        requireThat(!verification.error && verification.data?.session && verified(verification.data?.user) && verification.data.user.id === actor.id, 403, "Password or CAPTCHA verification failed. Complete fresh verification before retrying.");
      } finally {
        delete body.password; delete body.captchaToken;
        if (verification?.data?.session) {
          const cleanup = await verifier.auth.signOut({ scope: "local" }); requireThat(!cleanup.error, 503, "Verification session cleanup failed; no deletion started.");
        }
      }
      await master(caller, token, actor);
    }
    const admin = factory(env.url, env.service, options);
    const command = (step: string, data = {}) => rpc(admin, "platform_team_command", { p_actor: actor.id, p_request: requestId, p_action: step, p_target: targetId, p_data: data, p_session: actor.session_id });
    let operation: any, owned=false;
    try {
      if (action === "create") {
        requireThat(body.email && body.name && body.role && email(body.email) !== email(actor.email), 400, "Employee name, email and role required.");
        await master(caller, token, actor);
        operation = await command("begin_create", { name: body.name.trim(), email: email(body.email), role: body.role });
        owned=operation.new_operation===true;
        if (operation.stage === "completed") return { success: true, already_invited: true, operation_id: requestId };
        // Only the transaction that CREATED the reservation may dispatch Auth.
        requireThat(operation.stage === "reserved" && operation.new_operation === true, 409, "Existing invitation requires reconciliation; do not resend.");
        const result = await admin.auth.admin.inviteUserByEmail(email(body.email), { redirectTo: `${env.origin}/?reset=true` });
        requireThat(!result.error && result.data?.user?.id && result.data.user.id !== actor.id && email(result.data.user.email || "") === email(body.email), 503, "Invitation outcome requires reconciliation.");
        await master(caller, token, actor);
        operation = await command("finish_create", { auth_user_id: result.data.user.id });
      } else {
        const found = await admin.from("platform_users").select("id,auth_user_id,email,name,role,status,suspended_from").eq("id", targetId).limit(2);
        if ((!found.data || found.data.length !== 1) && action === "delete" && body.reconcile === true) {
          operation = await command("reconcile_delete"); return { success: operation.stage === "completed", operation_id: requestId };
        }
        requireThat(!found.error && found.data?.length === 1, 404, "Unique live employee required.");
        const row = found.data[0];
        requireThat(row.auth_user_id !== actor.id && email(row.email) !== email(actor.email) && ["portfolio_manager", "billing_person"].includes(row.role), 403, "Master account is protected.");
        const target = await linked(admin, row, action === "delete", ["deactivate", "reactivate", "delete"].includes(action));
        await master(caller, token, actor);
        if (action === "deactivate" || action === "reactivate") {
          operation = await command(action === "deactivate" ? "deactivate" : "begin_reactivate");
          owned = operation.new_operation === true;
          if (operation.stage === "completed") return { success: true, operation_id: requestId, already_completed: true };
          requireThat(operation.stage === "reserved" && owned, 409, "Provider outcome requires reconciliation; no automatic retry.");
          await master(caller, token, actor);
          operation = await command("dispatch_provider");
          // A preexisting provider restriction is preserved, never overwritten.
          let receipt = (await linked(admin,row,false,true))!.banned_until;
          if (action === "reactivate" || !operation.previous_ban) {
            const changed = await admin.auth.admin.updateUserById(row.auth_user_id, { ban_duration: action === "deactivate" ? "876000h" : "none" });
            requireThat(!changed.error && changed.data?.user?.id === row.auth_user_id, 503, "Access remains restricted; provider outcome requires reconciliation.");
            receipt=changed.data.user.banned_until;
          }
          await linked(admin, row, false, true);
          await master(caller, token, actor);
          operation = await command(action === "deactivate" ? "finish_deactivate" : "finish_reactivate", action === "deactivate" ? {provider_ban:receipt} : {});
        } else if (action === "update") {
          const values: any = {};
          for (const k of ["name", "email", "role"]) if (body[k] !== undefined) values[k] = k === "email" ? email(body[k]) : k === "name" ? body[k].trim() : body[k];
          requireThat(Object.keys(values).length && (!values.email || values.email !== email(actor.email)), 400, "Valid profile update required.");
          operation = await command("begin_edit", values);
          owned=operation.new_operation===true;
          if (operation.stage === "completed") return { success: true, operation_id: requestId };
          requireThat(operation.stage === "reserved" && operation.new_operation === true, 409, "Edit already processed or requires reconciliation.");
          if (values.email && values.email !== email(row.email)) {
            const changed = await admin.auth.admin.updateUserById(row.auth_user_id, { email: values.email });
            requireThat(!changed.error && changed.data?.user?.id === row.auth_user_id, 503, "Auth update outcome requires reconciliation.");
          }
          await master(caller, token, actor); operation = await command("finish_edit");
        } else {
          operation = await command("begin_delete", body.reason ? { reason: body.reason } : {});
          owned=operation.new_operation===true;
          if (operation.stage === "completed") return { success: true, operation_id: requestId };
          if (body.reconcile === true || operation.stage !== "reserved" || operation.new_operation !== true) {
            // Confirm absence through the actual DB, never repeat an uncertain Auth delete.
            operation = await command("reconcile_delete");
          } else {
            await master(caller, token, actor);
            operation = await command("dispatch_delete");
            if (target) {
              const removed = await admin.auth.admin.deleteUser(row.auth_user_id);
              requireThat(!removed.error, 503, "Access revoked; Auth deletion requires reconciliation.");
            }
            await master(caller, token, actor); operation = await command("finish_delete");
          }
        }
      }
      requireThat(operation.stage === "completed", 503, "Operation incomplete; reconcile the same request.");
      return { success: true, operation_id: requestId };
    } catch (error) {
      if (owned && operation.stage !== "completed") { try { await command("mark_review"); } catch { /* Required durable operation/start audit remains. */ } }
      // Sanitized errors deliberately exclude provider payloads, credentials and links.
      throw error;
    }
  });
}

export function passwordHandler(factory = createClient, transport = fetch) {
  return publicHandler(async (req, env) => {
    const token = bearer(req), caller = factory(env.url, env.anon, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const identity = await caller.auth.getUser(token); requireThat(!identity.error && verified(identity.data?.user), 401, "Verified password setup session required.");
    const user = identity.data.user;
    const context = await rpc(caller, "platform_team_setup_context", {}); requireThat(context.auth_user_id === user.id, 403, "Setup identity mismatch.");
    if (context.kind === "active") {
      let claims: any; try { claims = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); } catch { throw new Failure(403, "Recovery session required."); }
      // Native GoTrue implicit recovery uses OTP AMR; PKCE may use recovery.
      // getUser has already verified this bearer. Password-only grants are denied.
      requireThat(Array.isArray(claims.amr) && claims.amr.some((a: any) => ["otp", "recovery"].includes(a.method)), 403, "Recovery session required.");
    }
    const body = await bodyOf(req, ["password", "request_id"]);
    requireThat(typeof body.password === "string" && body.password.length >= 8 && body.password.length <= 256 && /[A-Z]/.test(body.password) && /[0-9]/.test(body.password) && /[^A-Za-z0-9]/.test(body.password) && uuid.test(body.request_id || ""), 400, "Strong password and stable request required.");
    requireThat(["pending", "active"].includes(context.kind) && uuid.test(context.session_id || ""), 403, "Verified eligible setup session required.");
    const admin = factory(env.url, env.service, options);
    let begun: any;
    if (context.kind !== "active") begun = await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "begin", p_session: context.session_id });
    // Use the caller's Auth bearer directly: no service-role password override, no
    // independent password sign-in, no replacement of the original browser session.
    if (begun?.stage !== "password_saved") {
      const changed = await transport(`${env.url}/auth/v1/user`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, apikey: env.anon, "Content-Type": "application/json" }, body: JSON.stringify({ password: body.password }) });
      delete body.password;
      if (!changed.ok) {
        // A definitive rejection releases only this claimed write. A connection
        // interruption leaves the claim blocked: never assume password rollback.
        if (context.kind !== "active" && changed.status >= 400 && changed.status < 500) await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "failed", p_session: context.session_id });
        throw new Failure(409, "Password could not be saved. Your account has not been activated; retry this setup or contact your administrator.");
      }
      const updated = await changed.json(); requireThat(updated.id === user.id, 503, "Password result could not be verified; account remains restricted.");
      if (context.kind !== "active") await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "saved", p_session: context.session_id });
    }
    const rechecked = await caller.auth.getUser(token); requireThat(!rechecked.error && verified(rechecked.data?.user) && rechecked.data.user.id === user.id, 401, "Password saved, but session verification failed. Activation is incomplete.");
    if (context.kind !== "active") {
      const accepted = await rpc(admin, "platform_accept_invite", { p_user: user.id, p_request: body.request_id, p_session: context.session_id });
      requireThat(accepted.success === true && accepted.stage === "completed", 503, "Password saved, but activation is incomplete. Retry the same setup.");
    } else {
      const stillActive = await rpc(caller, "platform_team_setup_context", {}); requireThat(stillActive.kind === "active", 409, "Account access changed during recovery. Contact your administrator.");
    }
    return { success: true };
  });
}
