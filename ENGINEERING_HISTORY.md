# RetraSell Platform engineering history

Persistent decision memory: WHY meaningful changes happened, accepted boundaries,
validation and impact. Git remains the exact source history. Follow `AGENTS.md`.
Dates use Asia/Karachi where applicable. Initial phases summarize repository evidence,
not every commit; historical validation was not rerun during this bootstrap.

Evidence labels: **committed** means present in Git; **local validation** means the
cited checkpoint's checks; **hosted verified (owner report)** is explicitly attributed.
Deployment instructions or commits alone do not establish deployed state.
On 2026-10-04, local HEAD and live GitHub feature-branch heads matched
(Platform `a054e28`, Shop `68885d4`). All implementation commits summarized
below are therefore committed and pushed as of that check; their historical
local-only checkpoint descriptions do not describe current Git state.
Older references to `development` describe their era; current integration is
`developmentv2`, with work on `feature/platform-overhaul-v1`.

## 2026-06 to 2026-07 — Platform registry and billing foundation

Branch/context: Legacy main-era source history.

### Purpose

Provide customer registry, billing and operator entry.

### Major changes

Vite migration, client management, usage/pricing, invoice/payment UI and Auth recovery/onboarding evolved.

### Important decisions / invariants

Historical client/browser assumptions are not current authority; later modernization moves money/state changes to trusted transactions.

### Validation known from repository evidence

Git establishes chronology (including a1944a5), not a broad historical validation result.

### Deployment / database impact

Committed legacy source; no deployment state inferred from early messages.

### Deliberately unchanged / deferred

Do not replay historical placeholder-email authorization or plaintext password defaults into a working upgrade.

### Relevant docs / commits

README.md; Git a1944a5 and June/July foundation commits; later docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md.

## 2026-09-25 to 2026-09-28 — Control-plane modernization and bridge credentials

Branch/context: Captured baseline, modernization, dedicated call authentication and scheduler fix.

### Purpose

Make Platform a durable control plane compatible with the Shop bridge.

### Major changes

Per-source authenticated immutable ingest/dedup, exact invoice membership, atomic retry-safe payments, customer-safe billing revisions, resupply lifecycle and provisioning/audit state. Dedicated call credential and scheduler-secret auth hardened transport.

### Important decisions / invariants

Shop operational truth remains remote; Platform billing/control/history is local. BILL/INVENTORY retain agreed semantics; THERMAL is separate metering, never a charge. Source credential authenticates inbound Shop traffic; call credential authenticates outbound Shop calls.

### Validation known from repository evidence

Implementation/scheduler reports record their checkpoint checks. Earlier proposal docs and privileged-key onboarding are superseded by V2. No fresh hosted verification here.

### Deployment / database impact

Committed 530ce96, 5734847, d65d872, 0323ad5, ed2c4a7; additive infrastructure recorded in reports. Historical maintenance scripts are not current execution authority.

### Deliberately unchanged / deferred

No inferred wholesale legacy cutover or destructive accounting reset. Keep scheduler cadence and financial/history integrity.

### Relevant docs / commits

docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md; docs/ORBITO_PLATFORM_MODERNIZATION_HANDOFF.md; docs/BRIDGE_CALL_CREDENTIAL.md; docs/SCHEDULER_AUTH_FIX.md.

## 2026-10-01 to 2026-10-02 — Manual-first Onboarding V2 and upgrade-safe identity

Branch/context: feature/onboarding-v2 then developmentv2 integration.

### Purpose

Safely provision fresh managed/BYO Shops without customer privileged credential collection or owner-password handling.

### Major changes

Protected pairing/reservation, optional invitation, manual owner activation, canonical plan/addon snapshot, resumable bootstrap and Client Detail preflight wording. Retired Shop credential map/resolvers disabled.

### Important decisions / invariants

Shop owns owner Auth/password; employee_id remains NULL. UUID/operator identity authorizes master; admin_username is only alias. Historical platformadmin@retailos.internal is not a seeded or required replacement account. Backend runtime verified does not prove CAPTCHA/DNS/TLS/browser checks.

### Validation known from repository evidence

ONBOARDING_V2_REVIEW/STABILIZATION document adversarial, upgrade-identity and fresh-three-variable checks. Identity upgrade fixture preserves existing operator helper/Auth/alias; local tests do not prove email delivery or hosted external state.

### Deployment / database impact

Committed 5b6c0eb/2c03676, integrated by 4f86abf. Forward migrations preserve deployed operator_role; do not rerun historical master-email definitions.

### Deliberately unchanged / deferred

Client 1 untouched; legacy credential removal needs approved coordinated inventory. No secret dumps. Actual-email login works independently of optional alias destination setting.

### Relevant docs / commits

NEW_CLIENT_ONBOARDING_V2.md; ONBOARDING_V2_REVIEW.md; ONBOARDING_V2_STABILIZATION.md; BYO_SUPABASE_ONBOARDING.md; LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md; MODULE_ENTITLEMENTS.md.

## 2026-10-03 — Overhaul lifecycle, reconciliation and managed stages

Branch/context: feature/platform-overhaul-v1 from developmentv2; 39581e6 plus 34291d9/18c137f/bd4d7bb corrections.

### Purpose

Preserve authoritative operations and history through retries, unreachable infrastructure and retirement.

### Major changes

Provisioning/Active/Suspended/Archived lifecycle independent of infrastructure. Master-only offline Archive retains history. Server UUID recovery supports read/reconcile/same-payload replay/manual closure and leases. Existing separate managed target installs approved atomic migration/function stages, pairing/Turnstile and runtime checks.

### Important decisions / invariants

Uncertain remote outcome is not success. Configuration recovery is leased; passed stages survive safe retry. Archive cannot resurrect or delete history and alone does not revoke remote login. Public env is only Shop URL/anon/site key. Server secrets never become browser fields; mode stays immutable.

### Validation known from repository evidence

Overhaul report records focused local tests, both builds/diff checks and forward SQL with substituted Auth/Crypto/Vault. Those checks do not prove hosted permissions, real key/hostname pairing or cross-process Edge behavior.

### Deployment / database impact

Additive 20261003120000_platform_overhaul_v1.sql plus Shop journal; approved source artifact. Commits establish corrections to fresh-target validation and function deployment, not live success.

### Deliberately unchanged / deferred

Project creation, Cloudflare/env automation, remote destructive decommission, history deletion, arbitrary legacy adoption/rebinding, publishable-only gateway conversion and final legal publication remain deferred.

### Relevant docs / commits

PLATFORM_OVERHAUL_V1.md; src/lifecycle.js; src/operations.js; supabase/functions/_shared/managed-setup.ts; Shop docs/PLATFORM_OVERHAUL_V1.md.

## 2026-10-04 — Managed support configuration compatibility repair

Branch/context: a616097 and 29b11e2 on overhaul branch.

### Purpose

Repair missing support runtime settings and distinguish public anon JWT from modern publishable runtime keys.

### Major changes

Managed stage and targeted completed-client repair install compatibility settings from exact server Platform URL, authenticated canonical operator identity and Management-selected public anon JWT. Repair validates pairing and records redacted audit without replaying provisioning.

### Important decisions / invariants

No browser-provided master email, service key fallback, full API-key response or owner/lifecycle mutation. This password-login design is superseded by the subsequent handoff; configuration boolean is not support-login proof.

### Validation known from repository evidence

MANAGED_SUPPORT_ACCESS records local handler/public-key/target checks and build evidence; deployment steps are instructions only.

### Deployment / database impact

Additive managed-support migration; committed repair/public-key correction. This history does not infer it repaired a particular live Shop.

### Deliberately unchanged / deferred

Legacy three-setting installation remains compatibility only; cleanup needs coordinated release/runtime/doc changes. Management token stays server-only.

### Relevant docs / commits

docs/MANAGED_SUPPORT_ACCESS.md; supabase/functions/_shared/support-auth.ts; supabase/functions/_shared/public-api-key.ts.

## 2026-10-04 — Secure one-time support session handoff

Branch/context: a054e28 on feature/platform-overhaul-v1; Shop counterpart 68885d4.

### Purpose

Keep Platform CAPTCHA intact and originate support at the authenticated master instead of forwarding a password.

### Major changes

platform-support issues 32 random bytes and persists only SHA-256 hash with 90-second lifetime. Consume locks client/grant, rechecks canonical master/source/pairing/lifecycle and commits one consumption/audit. Shop creates audited local Orbito Support session.

### Important decisions / invariants

Grant is single-use and client/project/binding/source-bound; Active/Suspended managed clients eligible, BYO/Archived/destroyed/decommissioned denied. Plaintext exists only transiently, transported in a fragment removed before Shop initialization. No Platform session or privileged key reaches Shop browser.

### Validation known from repository evidence

SUPPORT_SESSION_HANDOFF records actual-handler tests, full local suites/builds/diff checks and separate overlapping PostgreSQL transactions proving one local winner/replay denial. Auth/Vault substitutes and hosted limits remain explicit.

### Deployment / database impact

New forward 20261003230535_support_session_handoff.sql and platform-support plus Shop login/frontends; future installs use regenerated approved artifact. Commits do not by themselves prove deployment.

### Deliberately unchanged / deferred

Do not restore password support or weaken CAPTCHA. Legacy support settings do not drive handoff. Consent/legal enhancement and instant propagation to open sessions remain pending.

### Relevant docs / commits

docs/SUPPORT_SESSION_HANDOFF.md; supabase/functions/platform-support/index.ts; supabase/migrations/20261003230535_support_session_handoff.sql; Shop src/support-handoff.js.

## 2026-10-04 — Current checkpoint and durable memory bootstrap

Branch/context: `feature/platform-overhaul-v1`, HEAD `a054e28`; local
`developmentv2` verified as ancestor. Both repositories were clean at task start.
Current integration target is `developmentv2`; `main` remains legacy.

### Purpose / changed

Created root `AGENTS.md` and this phase history to reduce repeated discovery and
preserve decisions. Reconciled stale Git-status documentation using dated
superseding notes; preserved original validation/deployment evidence.
Updated README current status and authoritative document links.
Documentation only, not a new implementation or deployment.

### Accepted current state

Platform is the control plane; each managed customer uses an isolated Shop
Supabase project, always different from Platform (same account/org is allowed).
Shop owns operations/Auth; Platform retains registry, provisioning, lifecycle,
billing projections and historical/audit state. Cloudflare Pages hosts frontends.
Browser configuration is public-only; applied migrations remain immutable.

Lifecycle is Provisioning → Active ↔ Suspended → Archived; infrastructure is
independently unknown/present/unreachable/destroyed/decommissioned.
Archive is offline local retirement retaining history, not remote destruction
or a remote access-revocation guarantee. Server UUID/payload and leases govern
recovery; browser state cannot release uncertain outcomes.

Manual owner Auth creation/activation remains default. Canonical support is
one-time Platform-master handoff to local Orbito Support: 256-bit randomness,
90-second issuance lifetime, hash-only persistence, single-use bound exchange.
Suspended support access does not authorize Owner or reactivate the client.
Archived/destroyed/decommissioned and BYO targets deny handoff.
Current legal policies remain unpublished (`published=false`) pending review.

### Hosted smoke status — owner-reported, not independently rechecked

The task's supplied 2026-10-04 checkpoint reports verified: managed provisioning,
hosted Shop/custom domain/Turnstile, manual owner activation and completed setup,
suspend/reactivate, Owner denial while suspended, secure support handoff,
consumed-grant replay denial, unused grant expiry after 90 seconds, support session
refresh persistence and continued suspension during support access.

Repository documents establish the implementation and historical local checks;
their earlier "no hosted operations" statements describe those tasks. The newer
hosted results above are attributed to the project owner's supplied checkpoint,
not to a hosted inspection performed for this documentation task.

**IN PROGRESS / PENDING:** same-request retry, race/concurrency, unknown-outcome
recovery/reconciliation, cross-session recovery, history baseline, physical Shop
deletion, destroyed/unreachable recording, no resurrection, offline Archive,
historical retention, secret non-exposure and terminal integrity.
Local concurrency checks do not close the hosted concurrency gate.
The overhaul is NOT wholly accepted; no merge until that hosted gate completes.

### Validation / deployment and DB impact

Reviewed selected authoritative docs, recent commits and key identity/support
implementation; verified branches/status/base ancestry and live GitHub branch heads.
Local HEAD, origin tracking and live remote match: Platform `a054e28`, Shop `68885d4`.
Existing implementation through those heads is committed and pushed; exact push
times are not inferred from commit dates. Historical local-only wording describes
earlier tasks and is superseded by dated notes, not silently erased.
Checked generated Markdown,
content, secret patterns and whitespace, then final diffs/status.
No suites, builds or database tests were run for this documentation task.
No runtime, dependencies, migrations, Edge Functions, hosted data/secrets,
Cloudflare, Client 1 or legal worktree were changed. No commit/push/merge/deploy.

### Deliberately unchanged / deferred

Per-ticket customer support consent/legal disclosure, instant suspension of
already-open sessions, Platform owner Auth creation, automatic project/Cloudflare
environment operations, remote destructive decommission and final legal
publication remain deferred. No private customer identities, secret values,
raw logs, unsupported deployment dates or speculative completed roadmap are copied.

### Sources / Git

Sources are listed by repository-relative path in phase entries above. Current
hosted smoke attribution comes from the user-supplied durable-memory task checkpoint
dated 2026-10-04; no independent per-case hosted evidence artifact was supplied.
This documentation remains uncommitted; suggested message:
`docs: add durable engineering memory and agent rules`.

## 2026-10-05 — Recovery/lifecycle submit busy ownership fix

Branch: `feature/platform-overhaul-v1`.

### Purpose / changed

Owner-reported hosted Test 1 exposed a duplicate busy-guard conflict: `main.js`
marked the form busy before dispatch, so `forms.js` returned without executing
recovery/lifecycle/public-environment actions. Backend uncertainty/recovery behaved
correctly; the same remote write was already durable with the intended tracking
flag false. Removed only the inner guard, assignment and cleanup. The global
submit listener now exclusively owns busy state through completion and refresh;
overlapping submissions remain blocked.

### Validation

Added one focused test executing the actual outer listener and handler with mocked
operations for all four special form types, duplicate clicks and error cleanup.
It failed before the fix and passed afterward. Seven selected overhaul/recovery
tests passed; no provisioning, database, Shop or full-suite tests ran. Vite build
passed using process-only synthetic public configuration and isolated ignored
output; the ordinary build lacked `VITE_TURNSTILE_KEY`. Output is not deployable.
`git diff --check` passed.

### Deployment / DB impact and Git

No database, function, migration, Shop, hosted-operation or deployment changes.
Existing uncertain request remains untouched. Rebuild/deploy only the Platform
frontend using the existing real public configuration. Hosted Test 1 remains
pending frontend deployment and recovery of the existing request; no PASS claim.
No commit/push. Preserved pre-existing edits in `ONBOARDING_V2_REVIEW.md`,
`ONBOARDING_V2_STABILIZATION.md` and `PLATFORM_OVERHAUL_V1.md`.
