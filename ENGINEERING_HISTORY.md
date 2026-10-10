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

## 2026-10-05 — Retained historical client metadata visibility

Branch: `feature/platform-overhaul-v1`.

### Purpose / changed

Owner-reported hosted Tests 1–18 now pass; Test 19 exposed retained metadata hidden
in Archived/destroyed Client Detail. The supplied database inspection found no
data loss. Owner/project identity lived inside the operational setup panel, which
`canContactShop()` correctly suppresses for retired clients.

Added a read-only Historical client record card in `src/pages/clients.js`, using
only explicit non-secret fields from the retained Platform client. It displays
identity, owner, plan/industry, pairing, former Shop/project URLs and reference,
created/archive timestamps and lifecycle/infrastructure. Escaped URLs are plain
text. Metadata remains visible during Platform operations loading/errors.
Shop-contact semantics and all existing operational UI gates remain unchanged.

### Validation

Two focused full-detail regressions cover Archived/destroyed metadata, escaping,
credential/control exclusion, loading/errors and Active/Suspended compatibility.
The retired regression failed before the fix. Five selected detail/lifecycle
checks passed. Vite build passed with established synthetic public configuration
and isolated ignored output, not suitable for deployment. `git diff --check`
passed. No Shop/database/concurrency suites ran.

### Deployment / DB impact and Git

Platform frontend deployment alone is required. No backend/function/migration,
Shop or hosted-state changes; the deleted Shop was not recreated. Test 19 remains
pending hosted rerun after deployment. Clean task-start tree; no commit/push/deploy.

## 2026-10-06 — Hosted destructive smoke checkpoint complete

Branch: `feature/platform-overhaul-v1`.

### Purpose / validation

Completed the authorized hosted smoke gate: Tests 1–32 PASS. Test 19 was user-confirmed after the retained metadata frontend fix; final hosted Historical card was independently observed. Test 24 combines UI inspection and user-assisted DevTools response inspection; no privileged secrets observed within that scope.

Only Shop project `dexzxxqkbwnpetbsuxxv` was externally deleted after identity verification and explicit authorization. Platform `ukbhyerxshteyetwomqy` remains healthy. Manual mark-destroyed recorded exact ref/reason and remote_call=false, closed the existing dead-Shop probe request locally, and disabled bridge coordination. No resurrection observed; local Archive succeeded with backend gone.

### Final state / retention

Status and lifecycle Archived; infrastructure destroyed; archived_at populated; unresolved config jobs 0; unfinished provision jobs 0; bridge enabled=false. Historical metadata usable; normal operational/reactivation/support controls unavailable. Six financial/history baseline counts remain zero; projection retained (revision 1934 to 2965); audit count 160 to 166; seven original provision requests plus locally closed probe and 47 stages retained. Old Shop frontend still loads login but reports configuration unavailable.

### Impact / Git

Concise detailed evidence is retained in the hosted-smoke-tests-13-32.md task checkpoint. No Shop recreation, replacement UUIDs, direct table repairs, code changes, migrations, deployment, commit, push or merge during this continuation. Prior failure/pending notes remain historical; this entry records the completed hosted gate. Broader security audit and deferred remote deletion automation are not implied.

## 2026-10-09 — Production Platform bootstrap hardening

Branch: `feature/production-bootstrap-hardening`, from clean/current `development`
at `a43db6a`. Local and remote development/deployment heads matched at task start;
deployment ancestry verified. The user explicitly superseded older integration
branch guidance; main remains frozen.

### Purpose / changed

Make a genuinely new Platform install fail closed without breaking staging's
existing real UUID master. Read the complete eleven-file historical migration
chain and audited canonical RLS/RPC/Edge authority. Added CLI-generated forward
migration `20261008191709`: private singleton verified Auth UUID binding, audited
postgres-only SECURITY INVOKER configuration/binding functions, locked idempotent
retries and explicit compare-and-swap rebinding. No browser/API/service-role
binding access. Email/alias/metadata never assign master. Confirmed non-anonymous,
enabled caller and bound administrator plus config id=1 are required; disabling
the master closes ordinary operator access until trusted recovery.

Fresh installs remain unbound/unconfigured after migrations. Initialization creates
no Auth account/password or customer/history data. Removed legacy config defaults,
cleared unused plaintext password and constrained it to NULL. Staging requires
trusted audited approval of its independently verified current master UUID before
the migration; cutover binds that same UUID and consumes approval atomically.
No actual administrator UUID was invented or retrieved.

Added general/fresh/post-bootstrap SQL checks, staging approval procedure,
production runbook and implementation review report. Preflight addresses PG17
MAINTAIN, provider roles, Auth fields, pgcrypto schema, real Vault, Realtime
publication, baseline collisions and actual event-trigger permission. Historical
migrations remain unchanged. Documented quarantined full-chain execution and
commit/history ambiguity; never fabricate migration history. Existing Platform
fixtures now use verified explicit binding instead of email/role-function mocks;
the old harness upgrade prepares reviewed fixture approval.

### Validation

Docker Linux engine available. Six database groups PASS on real Supabase PG17.6,
pgcrypto 1.3, Vault 0.3.1 and 75 actual GoTrue v2.197.0 Auth migrations; affected
groups rerun after fixture changes. Fresh/upgrade, identity/data continuity,
email/role spoofing, unauthorized/unauthenticated privileged calls, verification,
missing config/prerequisites, retries/rebinding/concurrency, onboarding/manual
activation, billing/control plane, lifecycle/recovery and support SQL passed.
Forty-nine existing identity/support/scheduler regressions PASS with mocked
Auth/Management boundaries. Neither result claims hosted validation.

Actual CLI 2.120.0 independently applied all twelve files/history to a separate
loopback-only PG17 fixture. Unapproved staging cutover rolled back, approved
cutover preserved UUID, retry was a no-op, and a deliberately failed temporary
baseline copy rolled back objects/history then recovered through the full chain.
Setup errors were resolved; a test initially assuming a forgeable master-role
row was corrected to assert its existing schema rejection and passed. No
unresolved test FAIL; relevant executed groups have zero SKIP. Syntax/diff and
immutable migration/artifact checks passed. Hosted checks and whole Shop-related
harness/frontend build are SKIP by scope; relevant Platform SQL was run separately.

### Deployment / deferred / Git

No hosted project was connected, linked or modified; no function/migration/frontend
deployment, scheduler install, Shop change/artifact packaging or legal/publication
change. Source is missing for three UI-referenced team-account handlers; their
authorization is unverified and blocks enabling that feature/full release until
reviewed source is obtained. Actual production target/provider prerequisites,
intended Auth UUID, secrets/Auth settings and hosted smoke remain release gates.
No local test dependency blocker remains. Trusted DB-owner governance and
historical multi-file commit limitations remain explicit operational boundaries.
No commit, push, PR or remote branch modification; stop for user review.

## 2026-10-09 — Production bootstrap final transaction/security hardening

Branch: `feature/production-bootstrap-hardening`; HEAD remains `a43db6a`.
Continued the 21 uncommitted changes without altering historical migrations or
other branches. Added one local CLI regression driver; fifteen prior files are
unchanged byte-for-byte in this continuation.

### Correction / evidence

Reviewed CLI 2.120.0's native TypeScript transaction parser, migration executor
and extended-protocol batch implementation. The draft migration's explicit
BEGIN/COMMIT selected sequential execution, leaving its genuine history INSERT
outside its transaction. Removed only those top-level controls from new version
`20261008191709`. The exact file has no nontransactional directive or pipeline
flush statement; its SQL and the CLI's own history INSERT now share one batch
and final Sync. Eleven historical migrations remain immutable and the full
chain remains file-by-file, with historical commit/history recovery limitations.
No manual history insertion/repair was introduced.

Added `tests/production-bootstrap-cli.test.mjs`: pinned executable/version/hash,
unique label-verified Docker resources, random local credentials, loopback port,
real PG17/Auth/Vault prerequisites, schema-only template and actual CLI-applied
history. Rejects hosted/arbitrary targets. A history trigger proves migration
SQL/grants and staging binding/password scrub/approval consumption executed,
then rejects the CLI INSERT. Fresh and approved staging both fail with unchanged
catalog/ACL/data, no version/new objects, and preserved staging approval/old
authority. Fault removal permits genuine retry, exactly one new history row and
a no-op repeat. Backend termination at the same post-SQL gate also rolls back
both scenarios and retries cleanly. A temporary VACUUM copy proves pipeline
flushes can commit SQL before rejected history; it never changes release source.

### Security / validation

Expanded validator coverage to every relevant table/column privilege, including
TRUNCATE, REFERENCES, TRIGGER and PG17 MAINTAIN, ownership, private schema creation,
postgres membership, bootstrap EXECUTE/security mode and secure search_path.
Actual database regressions deny soft-deleted Auth callers/master, managers when
the master is deleted/disabled, bound-account hard deletion, API initialization/
assignment/TRUNCATE and outstanding old support grants after master rebinding.
Replacement-master issuance/consumption and retained lifecycle/provisioning pass.

Five actual-CLI scenarios and six expanded database groups PASS; 49 existing
identity/support/scheduler regressions PASS with their existing Auth/Management
mocks. Initial harness failures (82 total Auth versions versus 75 additions,
temporary init-server readiness, inherited nested Node context) were corrected
and rerun. Final combined CLI harness: six top-level PASS (five CLI scenarios and
the child suite), zero FAIL/SKIP; child independently reports six PASS and zero
FAIL/SKIP. Preservation, historical immutability, whitespace and syntax checks
PASS. Seven image baseline Auth versions plus 75 GoTrue additions give 82
genuine infrastructure history rows. SQL claim fixtures are not hosted login.
Acknowledgment loss after commit, provider failover/power loss/pooler and hosted
validation remain SKIP; sequence counters/server logs need not roll back.

### Release / scope

No authoritative create/update/delete-platform-user handlers were found in
repository/configuration/history or inspected available local Platform sources.
Documented a server release gate: verify the exact production endpoints and
aliases absent or provider-disabled, or obtain/review/test authoritative source;
hidden controls/anonymous denial alone are insufficient. No hosted absence is
claimed. Runbook/review describe safe inspection/retry, endpoint inventory,
local harness cleanup and rollback limits. An interrupted runner's orphan was
label-verified and removed; existing Docker workloads were untouched.

No commit, push, PR, merge, deployment, hosted connection, Shop/artifact,
Auth/secrets/Cloudflare or legal/publication changes. Stop for owner review.

## 2026-10-09 — Bootstrap PR checkpoint and P2 SQL runner follow-up

Branch: `feature/production-bootstrap-hardening`. Owner-authorized checkpoint
`ba1b770e5ef79b07c4202eaa4c7a56dc0a2b354d` committed/pushed exactly 22 files;
draft PR #1 targets `development` and remains unmerged. Earlier local-only entries
describe their historical checkpoints. Cloudflare reported a successful automatic
frontend preview after the push, per the owner; this does not prove migrations,
Edge Functions, production deployment or hosted tests. Protected development/
deployment/main heads remain unchanged.

Resolved two P2 findings locally. The legacy psql-stdin runner now applies each
migration without top-level authored boundaries inside one BEGIN/COMMIT, preserving
authored transactions and ignoring procedural BEGIN within quoted bodies. Every
fresh/upgrade migration path uses the helper. Added Platform-only execution to
respect the no-Shop boundary, and a late division-by-zero injection in a temporary
new-migration copy. Actual PG17 assertions preserve configuration, committed
approval/audit, authority, ACLs/defaults/constraints and absence of new binding
objects; clean retry retains the existing synthetic UUID. Production/historical
SQL and the dedicated actual CLI history harness are unchanged.

Affected Platform runner fresh/rollback/upgrade PASS on disposable PostgreSQL 17.6
with its existing synthetic Auth/Vault fixtures. Focused security regressions:
49 PASS, zero FAIL/SKIP, existing Auth/Management mocks. Syntax/whitespace and
immutable-file checks PASS. Shop execution and hosted/preview-isolation validation
SKIP by scope. Owned local test container removed; existing workloads untouched.

Preview isolation is not established: normal frontend clients use build-time
Platform URL/key, with no guaranteed preview-only backend. Require approved
isolated/inert preview configuration and access verification before another push
or use; no preview/backend was contacted or Cloudflare setting changed here.
Only runner/review/history changed. No new commit/push/PR mutation/merge/deployment,
hosted Auth/secrets operation or Shop/legal/publication change; await approval.

## 2026-10-09 — Owner-approved P2 checkpoint and preview controls

The owner confirmed restricted access for Cloudflare previews and exclusion of
`feature/production-bootstrap-hardening` from automatic preview deployment, then
authorized committing/pushing only the three reviewed P2 files to update draft
PR #1 targeting development. Recorded that confirmation in the review report;
prior pending-control notes remain historical. Backend isolation is still
unverified and cannot be inferred from variable names or preview access controls.

No runner behavior changed after its successful local validation. This checkpoint
reviews staged source, whitespace/sensitive values, immutable migrations/artifact,
PR state and protected branches. No Cloudflare settings, hosted Supabase, Auth,
secrets, Edge Functions or production deployment operations are authorized.

## 2026-10-09 — Secure team-management source and controlled staging plan

On feature/production-bootstrap-hardening, continuing from 4535515, retrieved
the owner-authorized read-only staging source of create-platform-user v10,
update-platform-user v8 and delete-platform-user v8. All three active handlers
use privileged Auth without verifying canonical master authority, despite gateway
JWT checks. A seven-function read-only inventory is recorded; no hosted DB,
Auth user, configuration, secret or production inspection/mutation was performed.

Added repository-owned replacements with pinned shared SDK handler. Caller Auth
getUser and matching canonical master UUID/RPC precede service-role construction;
ordinary roles cannot perform team Auth operations. Retained portfolio_manager
and billing_person, constrained request fields, verified server team/Auth mapping,
protected master mutation/deletion/reset, trusted server invitation origin, audit
and sanitized uncertain-outcome handling. Frontend edit/removal now use secured
handlers for complete workflows; legacy selectors support backend-first rollout.
No SQL roles/permissions or migration changed. Auth and DB operations remain
separate transactions; partial outcomes require audited review, and trusted
identity/team changes must be frozen and drained during cutover/rebinding.

Added disposable local runner, real canonical-RPC/RLS compatibility regressions
and handler/frontend cases. PASS: 40 explicit-double security cases, two actual
PG17 before/after UUID-cutover groups, six existing PG17/Auth-schema/Vault groups,
49 existing focused regressions, three native Deno 2.4.5 checks, syntax/whitespace,
immutable-file and sensitive review. Initial Deno type narrowing errors were
corrected and rechecked; zero unresolved local FAIL. Hosted Auth HTTP/gateway,
SMTP/CAPTCHA/browser, live identity/schema drift and real staging backup/restore
SKIP by approval boundary. Local mocks are not hosted security evidence.

STAGING_TEAM_CUTOVER.md documents role matrix/source bundle hashes, secure backend
verification before UUID cutover, approved encrypted-backup destination/tooling/
key custody and provider recovery/restore limits, single new-migration CLI cutover,
data preservation and later development integration/Cloudflare smoke. Updated
production runbook/review to resolve historical missing-source notes without
claiming deployed replacements. Future deployment promotion/Singapore fresh
bootstrap remains separate. All twelve migrations, CLI atomicity harness and
managed Shop artifact are unchanged. No commits, pushes, PR merge, deployment,
backup, Shop access, protected branch or Cloudflare/legal change; await approval.

## 2026-10-09 — Require confirmed master email before UUID cutover

The shared team handler now requires email_confirmed_at from verified Auth
getUser on every authorization check, matching the UUID migration prerequisite.
An unconfirmed/missing email confirmation denies access before canonical RPC or
service-client construction; phone/general confirmation is not a substitute.
No migration, database permission or hosted configuration changed.

Focused tests use real disposable Auth rows and canonical PostgreSQL RPCs before
and after cutover: the legacy UUID RPC still grants an unconfirmed master role,
but the handler denies create/update/delete without privileged calls. After
cutover the database denies that identity too. Restoring confirmation preserves
existing master access; confirmed Manager/Billing denials remain unchanged.
Auth HTTP/REST transports remain explicit doubles, not hosted validation.

PASS: 41 handler cases, two PG17 before/after groups, six existing bootstrap DB
groups, three native Deno checks, syntax/whitespace and immutable-file checks.
No local FAIL/SKIP; hosted validation not run by scope. Owned Docker fixtures
removed. Changes remain unstaged/uncommitted on the feature branch for review;
no push, protected-branch, hosted Supabase, Cloudflare or Shop operation performed.

## 2026-10-10 — Staging frontend warning and password-form cleanup

Branch: `fix/staging-ui-warnings`, from synchronized development merge
`32747038bd6609c9b5253832fa6d1329b7e4e308`. The owner reports that its staging
deployment, master login and read-only Clients/Team/Billing smoke passed.

Removed the redundant catch-all `_redirects` rewrite. Cloudflare Pages provides
SPA fallback without a top-level 404; no custom 404, route or Auth redirect change.
Imported loadConfig through the existing static Supabase import. Session validation
now receives the caller's render callback, preserving periodic expiry rendering
without adding a helpers/render dependency cycle.

Login/PIN and recovery passwords now belong to labelled POST forms, with account
associations and explicit autocomplete. Click and native Enter submission retain
the existing Auth/CAPTCHA handler once; the business-form dispatcher excludes Auth
forms. Recovery email is transient session display metadata, never authority.
Settings adds escaped, read-only account associations; team editing distinguishes
account email from a new password. Existing authorization and password validators
are unchanged. POST fallback avoids credential-bearing query strings.

PASS: 174 relevant local regressions (including six new markup/handler cases),
52 focused cases rerun after POST markup completion, synthetic npm build without
the mixed-import warnings, syntax, whitespace, unchanged-cycle comparison and
real ES-module initialization with a synthetic SDK. An initial ESM fixture lacked
window; corrected fixture passes. Existing deployed root/Clients/Billing/Settings/
reset routes return the app shell with HTTP 200. These are not changed-frontend
hosted tests. SKIP: live browser/password-manager/accessibility and desktop/mobile
layout checks because browser automation fails initialization. Database/Shop suites
are outside this frontend change. Vite's existing CJS Node API deprecation remains.

No database, Edge, Auth configuration, environment-secret, production, Shop or
Cloudflare settings change. Use the documented `[CF-Pages-Skip]` commit prefix for
the authorized branch push; open the development PR without merging. A future
approved merge must omit that prefix to permit the intended staging deployment.
References: https://developers.cloudflare.com/pages/configuration/serving-pages/
and https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/.


## 2026-10-10 — CAPTCHA-aware username confirmation and in-app dialogs

Frontend branch fix/platform-auth-and-dialogs starts from synchronized development
cdf94107201382dbd95e741d59e1923f819973d9. The owner supplied the actual failing Auth
response captcha_failed / no captcha_token found. Change Username omitted the token
and mislabeled all failures as an incorrect password; normal login already included
CAPTCHA. No hosted configuration or real credential change was made for diagnosis.

Settings now uses fresh Turnstile verification. Password confirmation uses the
canonical Auth email through a separate reused memory-only client, preserving the
original client's persisted session and excluding cross-client broadcasts. Master
UUID/role/email are rechecked; verifier-only local signout cleanup is required before
the alias update. Database-returned id/alias must confirm success; failures and
zero-row updates never update local alias or display success. Auth email is unchanged.
Distinct safe errors and consumed/reset tokens preserve password/CAPTCHA controls.
Provider single-session enforcement and original-session refresh continuity still
need owner-authorized hosted verification; no deployed fix is claimed.

A reusable body-level toast/confirm/input/acknowledgment layer replaces all 39 native
calls (36 alerts, three confirms, no prompts). Persistent errors, explicit destructive
confirmation, cancellation, focus trapping/restoration, inert/scroll restoration,
queue cleanup, text-only rendering, theme variables and reduced-motion styling are
included. Team removal rechecks canonical identity after confirmation; provisioning
keeps original request IDs, retries and busy guards. Unresolved recovery blocks for
acknowledgment. Optional invitation notices preserve uncertain-outcome guidance.
Printing, permissions, password managers, CAPTCHA and file download UI remain native.
Shop styling was inspected read-only; no Shop changes. Complete inventory, tests,
limitations and follow-up smoke checklist: docs/PLATFORM_AUTH_DIALOG_REVIEW.md.

PASS: 193 relevant local cases including 19 new focused cases, synthetic frontend
build, syntax, whitespace and unchanged circular-import components. Existing
fixtures were adapted to asynchronous dialogs; initial fixture failures were fixed.
An attempted opt-in bootstrap database suite failed its unset disposable-container
prerequisite before executing groups; no database validation is claimed. Browser
automation fails initialization (os error 3): live browser/layout/accessibility and
hosted credential/write tests are SKIP. Vite's CJS deprecation remains.

No database/migration/RLS, deployed function, Auth config, secret, production,
Cloudflare, public routing, package, protected branch or release-artifact change.
Use approved [CF-Pages-Skip] feature commit; push this branch and open a draft PR to
development without merge/deployment. Current connectors cannot verify provider
preview inventory. Future separately authorized deployment needs a merge message
without the skip prefix and the documented hosted smoke gate.


## 2026-10-11 — PR #3 alias display and real local dialog verification

Follow-up to be40a0e on fix/platform-auth-and-dialogs. Confirmed username writes now
update currentUser.username and PCFG.admin_username together before render; failure
paths retain both prior aliases. Auth UUID/email/role/session metadata are preserved.
Sidebar escapes the entered alias. Canonical login/restore fixtures cover continuity.

PASS: 74 focused regressions, including original-session client spies and returned/
thrown verification-session cleanup failures. PASS: six real local Chrome/Playwright
viewport/theme groups with actual dialog/styles/events code, synthetic logout and no
external requests: focus trap/restoration, keyboard/cancel/backdrop, one-shot confirmation,
rerender, logout cancellation, scroll restoration and viewport containment. Existing
bundled tooling was used; no install/repair. Reproducible optional harness:
tests/dialogs-browser.mjs. The sandbox launcher encountered an unrelated locked drive;
authorized local checks ran outside it without altering the drive.

PASS: synthetic build, syntax, whitespace and sensitive-value checks. Vite's existing
CJS deprecation remains. Real Supabase session-refresh behavior and full hosted Platform
visual/accessibility checks remain unverified. The earlier browser SKIP is superseded
only for the six specific local dialog groups. Minimal separately authorized reversible
staging alias/refresh validation is documented, not executed. No hosted/database/Auth,
Edge, production, Shop or Cloudflare changes. Same draft PR, skip-prefixed feature push,
no merge or deployment.
