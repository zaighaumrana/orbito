import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = (s: string) => s.trim().toLowerCase();
const inactiveMessage = "Your account has been deactivated by the administrator. Please contact your administrator to restore access.";
class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
function requireThat(ok: unknown, status: number, message: string): asserts ok { if (!ok) throw new Failure(status, message); }
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
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
  return user;
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
// Resend is an explicitly required server transport; never silently fall back to SMTP.
// Recovery tokens remain inside this server/email boundary, never in admin responses.
async function send(env: ReturnType<typeof environment>, to: string, subject: string, link: string, key: string, transport: typeof fetch) {
  const secret = Deno.env.get("PLATFORM_AUTH_RESEND_API_KEY"), from = Deno.env.get("PLATFORM_AUTH_EMAIL_FROM");
  requireThat(secret && from, 503, "Auth email transport is not configured.");
  const response = await transport("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from, to: [to], subject, text: `RetraSell\n\n${subject}\n\n${link}\n\nThis Supabase link expires and can only be used once. If you did not expect it, contact your administrator.` }) });
  requireThat(response.ok, 503, "Email delivery outcome requires review; do not resend blindly.");
}
function setupLink(env: ReturnType<typeof environment>, hash: string, type: string, requestId?: string) {
  const fragment = new URLSearchParams({ token_hash: hash, type });
  if (requestId) fragment.set("operation", requestId);
  return `${env.origin}/?reset=true#${fragment}`;
}
function emailReady() {
  requireThat(Deno.env.get("PLATFORM_AUTH_EMAIL_GUARD_READY") === "true" && Deno.env.get("PLATFORM_AUTH_HOOK_SECRET") && Deno.env.get("PLATFORM_AUTH_RESEND_API_KEY") && Deno.env.get("PLATFORM_AUTH_EMAIL_FROM"), 503, "Verified native recovery email guard is required before lifecycle rollout.");
}
async function linked(admin: any, row: any, allowMissing = false) {
  if (!row.auth_user_id) { requireThat(allowMissing, 409, "Legacy unlinked identity requires review."); return null; }
  const result = await admin.auth.admin.getUserById(row.auth_user_id);
  if (result.error?.status === 404 && allowMissing) return null;
  requireThat(!result.error && result.data?.user, 409, "Auth identity lookup failed; absence is not proven.");
  const user = result.data.user;
  requireThat(user.id === row.auth_user_id && user.email && email(user.email) === email(row.email) && !user.deleted_at && !user.is_anonymous && (!user.banned_until || Date.parse(user.banned_until) <= Date.now()), 409, "Auth identity is blocked or has drifted.");
  return user;
}

export function teamV2Handler(action: "create" | "update" | "delete" | "deactivate" | "reactivate", factory = createClient, transport = fetch) {
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
    const command = (step: string, data = {}) => rpc(admin, "platform_team_command", { p_actor: actor.id, p_request: requestId, p_action: step, p_target: targetId, p_data: data });
    let operation: any, owned=false;
    try {
      if (action === "create") {
        emailReady();
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
        const target = await linked(admin, row, action === "delete");
        await master(caller, token, actor);
        if (action === "deactivate") operation = await command("deactivate");
        else if (action === "reactivate") {
          emailReady();
          operation = await command("begin_reactivate");
          owned=operation.new_operation===true;
          if (operation.stage === "waiting_password") return { success: true, status: "Inactive", awaiting_password: true, already_initiated: true, operation_id: requestId };
          requireThat(operation.stage === "reserved" && operation.new_operation === true, 409, "Recovery already initiated or needs reconciliation; no new email sent.");
          const link = await admin.auth.admin.generateLink({ type: "recovery", email: target!.email, options: { redirectTo: `${env.origin}/?reset=true` } });
          requireThat(!link.error && link.data?.user?.id === row.auth_user_id && link.data?.properties?.hashed_token, 503, "Recovery link outcome requires review.");
          const hash = link.data.properties.hashed_token;
          await master(caller, token, actor);
          operation = await command("issue_recovery", { proof_digest: await digest(hash) });
          await send(env, target!.email, "Set a new password to restore your RetraSell access", setupLink(env, hash, "recovery", requestId), requestId, transport);
          return { success: true, status: "Inactive", awaiting_password: true, operation_id: requestId };
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

export function recoveryHandler(factory = createClient, transport = fetch) {
  return publicHandler(async (req, env) => {
    emailReady(); const body = await bodyOf(req, ["email", "captchaToken"]);
    const runtime = (globalThis as any).EdgeRuntime;
    requireThat(typeof runtime?.waitUntil === "function", 503, "Recovery delivery runtime unavailable.");
    requireThat(typeof body.email === "string" && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && typeof body.captchaToken === "string" && body.captchaToken, 400, "Email and fresh verification required.");
    const secret = Deno.env.get("PLATFORM_AUTH_TURNSTILE_SECRET"); requireThat(secret, 503, "Recovery verification unavailable.");
    const captcha = await transport("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret, response: body.captchaToken }) });
    const verdict = await captcha.json(); requireThat(captcha.ok && verdict.success === true && verdict.hostname === new URL(env.origin).hostname, 403, "Fresh verification failed.");
    const admin = factory(env.url, env.service, options);
    const allowed = await rpc(admin, "platform_team_recovery_limit", { p_key: await digest(email(body.email)) });
    requireThat(allowed === true, 429, "Too many requests. Wait before trying again.");
    const context = await rpc(admin, "platform_team_email_context", { p_email: email(body.email) });
    if (context.kind === "inactive") return { success: false, message: inactiveMessage };
    const response = { success: true, message: "If an eligible account exists for that email, a reset link has been sent." };
    if (context.kind !== "active") return response;
    const requestId=crypto.randomUUID();
    // Do not reveal known addresses through provider errors or SMTP response latency.
    // Delivery is best effort under EdgeRuntime limits and has sanitized audit evidence.
    runtime.waitUntil((async()=>{
      let outcome="failed";
      try {
        const latest=await rpc(admin,"platform_team_email_context",{p_email:context.email});
        if(latest.kind!=="active" || latest.auth_user_id!==context.auth_user_id){outcome="cancelled";return;}
        const link=await admin.auth.admin.generateLink({type:"recovery",email:context.email,options:{redirectTo:`${env.origin}/?reset=true`}});
        requireThat(!link.error && link.data?.user?.id===context.auth_user_id && link.data?.properties?.hashed_token,503,"Recovery link unavailable.");
        await send(env,context.email,"Reset your RetraSell password",setupLink(env,link.data.properties.hashed_token,"recovery"),requestId,transport);outcome="issued";
      } catch { /* Never log provider payloads or link material. */ }
      finally {try{await rpc(admin,"platform_team_recovery_audit",{p_request:requestId,p_outcome:outcome});}catch{/* Provider request may outlive worker; no automatic resend. */}}
    })());
    return response;
  });
}

export function passwordHandler(factory = createClient, transport = fetch) {
  return publicHandler(async (req, env) => {
    const token = bearer(req), caller = factory(env.url, env.anon, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const identity = await caller.auth.getUser(token); requireThat(!identity.error && verified(identity.data?.user), 401, "Verified password setup session required.");
    const user = identity.data.user;
    const context = await rpc(caller, "platform_team_setup_context", {}); requireThat(context.auth_user_id === user.id, 403, "Setup identity mismatch.");
    const body = await bodyOf(req, ["password", "request_id", "proof"]);
    requireThat(typeof body.password === "string" && body.password.length >= 8 && body.password.length <= 256 && /[A-Z]/.test(body.password) && /[0-9]/.test(body.password) && /[^A-Za-z0-9]/.test(body.password) && uuid.test(body.request_id || ""), 400, "Strong password and stable request required.");
    const admin = factory(env.url, env.service, options), proof = typeof body.proof === "string" && body.proof.length <= 512 ? await digest(body.proof) : null;
    let begun: any;
    if (context.kind !== "active") begun = await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "begin", p_digest: proof });
    // Use the caller's Auth bearer directly: no service-role password override, no
    // independent password sign-in, no replacement of the original browser session.
    if (begun?.stage !== "password_saved") {
      const changed = await transport(`${env.url}/auth/v1/user`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, apikey: env.anon, "Content-Type": "application/json" }, body: JSON.stringify({ password: body.password }) });
      delete body.password;
      if (!changed.ok) {
        // A definitive rejection releases only this claimed write. A connection
        // interruption leaves the claim blocked: never assume password rollback.
        if (context.kind !== "active" && changed.status >= 400 && changed.status < 500) await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "failed", p_digest: proof });
        throw new Failure(409, "Password could not be saved. Your account has not been activated; retry this setup or contact your administrator.");
      }
      const updated = await changed.json(); requireThat(updated.id === user.id, 503, "Password result could not be verified; account remains restricted.");
      if (context.kind !== "active") await rpc(admin, "platform_team_password_step", { p_user: user.id, p_request: body.request_id, p_step: "saved", p_digest: proof });
    }
    const rechecked = await caller.auth.getUser(token); requireThat(!rechecked.error && verified(rechecked.data?.user) && rechecked.data.user.id === user.id, 401, "Password saved, but session verification failed. Activation is incomplete.");
    if (context.kind !== "active") {
      const accepted = await rpc(admin, "platform_accept_invite", { p_user: user.id, p_request: body.request_id, p_digest: proof });
      requireThat(accepted.success === true && accepted.stage === "completed", 503, "Password saved, but activation is incomplete. Retry the same setup.");
    } else {
      const stillActive = await rpc(caller, "platform_team_setup_context", {}); requireThat(stillActive.kind === "active", 409, "Account access changed during recovery. Contact your administrator.");
    }
    return { success: true };
  });
}

// Mandatory provider-level boundary for native /recover, not a browser check.
// This hook REPLACES SMTP for ALL Auth emails. Never enable it without transport
// and a separately reviewed provider smoke test of every enabled email type.
export function emailHookHandler(factory = createClient, transport = fetch, webhookFactory = (key: string) => new Webhook(key)) {
  return async (req: Request) => {
    try {
      requireThat(req.method === "POST", 405, "POST required."); const env = environment();
      const key = Deno.env.get("PLATFORM_AUTH_HOOK_SECRET"); requireThat(key, 503, "Hook signature configuration unavailable.");
      const raw = await req.text(); requireThat(raw.length <= 65536, 413, "Payload too large.");
      const payload: any = webhookFactory(key.replace(/^v1,whsec_/, "")).verify(raw, Object.fromEntries(req.headers));
      const { user, email_data: data } = payload;
      requireThat(user && uuid.test(user.id) && user.email && data?.token_hash, 400, "Unsupported Auth email payload.");
      const admin = factory(env.url, env.service, options);
      const context = await rpc(admin, "platform_team_email_context", { p_email: user.email });
      // generateLink/admin reactivation uses a separate reviewed delivery path;
      // there is NO broad temporary approval window for native /recover requests.
      requireThat(context.kind !== "archived" && (data.email_action_type !== "recovery" || (context.kind === "active" && context.auth_user_id === user.id)), 403, "Recovery is unavailable for this account.");
      const kind = data.email_action_type;
      requireThat(["invite", "signup", "recovery", "magiclink", "email_change"].includes(kind), 503, "Auth email type requires an explicit template review.");
      const keyId = req.headers.get("webhook-id"); requireThat(keyId, 400, "Signed delivery ID required.");
      if (kind === "email_change") {
        requireThat(user.new_email, 400, "Email-change target required.");
        const destination = await rpc(admin, "platform_team_email_context", { p_email: user.new_email });
        requireThat(destination.kind !== "archived", 403, "Archived email denied.");
        if (data.token_hash_new) await send(env, user.email, "Confirm your RetraSell email change", setupLink(env, data.token_hash_new, kind), keyId + "-old", transport);
        await send(env, user.new_email, "Confirm your RetraSell email change", setupLink(env, data.token_hash, kind), keyId + "-new", transport);
      } else await send(env, user.email, kind === "invite" ? "Set your RetraSell password" : "Confirm your RetraSell account request", setupLink(env, data.token_hash, kind), keyId, transport);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch { return new Response(JSON.stringify({ error: { http_code: 403, message: "Auth email denied or unavailable." } }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
  };
}
