# RetraSell Platform engineering history

## Later hosted acceptance update —2026-10-17

The [final hosted acceptance and conditional merge decision](docs/PR4_HOSTED_ACCEPTANCE_2026-10-17.md)
supersedes earlier current-status statements below:staging has17 migrations;
config12/support5/provision19 source matches541c46d,D1 source drift resolved;
permanent deletion remains disabled;canonical Pages manual deployment56fa2285
serves541c46d. A06 current-password configuration is directly verified enabled,
not a hosted password-change test. Owner UI/API acceptance,independent reads and
partial provider checks remain separately attributed. Merge is conditionally
owner-authorized subject to gates/checks;production remains NO-GO and before-use
Shop/finance/Support/provider obligations remain. Prior reports are historical.


## Current superseding pointer — 2026-10-17

Current reviewed source: `27f6abde0274ac6c989664d0b363504b93128d10`,
`feature/platform-team-lifecycle-v2` → `development`, Draft/unmerged PR #4.
Fourteen source commits are committed/pushed. The older current-integration and
local-only statements below are point-in-time records, not today’s Git status.
See [the permanent acceptance register](docs/PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md)
for all 120 cases, 40 documentation groups, independent correction results and gates.
Staging has 16 genuine migrations, pending source 17; Pages serves ad hoc d3fc517
while development remains0dbde676. Scoped employee staging acceptance does not
certify undeployed corrections. Permanent deletion last verified off. Documentation
finalization approved; merge/rollout require separate decisions; production NO-GO.

## Historical decision memory


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

## 2026-10-11 — Invitation onboarding and secure team lifecycle V2 (local)

Branch: `feature/platform-team-lifecycle-v2`, based on verified clean `development`
at `0dbde676ca57ed1599a295e221d274ef080cac41`.

### Purpose / changes

Corrected invitation callback routing and unchecked acceptance; replaced ambiguous
Remove with distinct Active/Pending/Inactive/Archived management. Pending sessions
enter verified setup on SIGNED_IN/INITIAL_SESSION; existing Master sessions are
not activated by reset query hints. Logout/finish clears hints and queued callbacks.
Server verifies password saving before checked acceptance and supports a saved-
password activation retry without another provider password write.

Reactivate now initiates Supabase recovery for the original Auth UUID and keeps
Inactive until verified new-password setup; no separate reset button or new Auth
account. Deactivation retains role/identity, cancels setup and denies old JWT
operator authority. Permanent deletion requires canonical confirmed Master,
current password, fresh CAPTCHA, isolated verification-session cleanup and repeat
authorization. Durable request tracking revokes access before Auth dispatch, then
archives/removes the live row only on database-proven absence with required audit.
Uncertain deletion only reconciles absence; it never dispatches another deletion.

CLI-generated forward migration `20261010233446` adds immutable archives, private
operations, mapping constraints, trusted transitions and narrowly granted RPCs;
closes browser/service direct team mutation and historical JWT-only acceptance.
All 12 historical migrations and the Shop release artifact remain unchanged.
The existing immutable audit trigger is preserved after local SQL caught a collision.
Legacy Inactive origins stay unknown; missing/unlinked identities are never adopted,
recreated or deleted by email. Ambiguous Auth links, Storage ownership and custom
references fail closed. Older synthetic SQL fixtures now seed only as their owner
with the guard flag narrowly scoped; ordinary authorization checks remain intact.

### Decisions / release gates

Native recovery requires a signed Supabase Send Email Hook; UI checks are not a
claim of provider enforcement. The new hook replaces all SMTP and explicitly uses
Resend, requiring owner-approved transport/sender/templates before enablement.
The readiness secret is an operator attestation, not proof of hook configuration.
Unsupported enabled notification types fail closed. Inactive's requested message
deliberately discloses account status after CAPTCHA; unknown accounts stay generic.
Active delivery is background/best effort with sanitized request/outcome auditing.
Previously issued links cannot activate Inactive without the approved operation.

Recovery proofs are memory-only in the browser and hash-only in private database
state, with a 30-minute operation deadline plus native OTP expiry. Reload after
scrubbing may require Master cancellation/new recovery; uncertain password writes
remain restricted. Native provider session refresh/single-session behavior during
destructive reauthentication still needs approved staging verification.

### Validation / Git / deployment

PASS: 221 broad local regressions, six PG17 bootstrap groups, two canonical pre/post
UUID groups, six new PG17 lifecycle groups (including audit failure, stale JWT,
Storage, tombstones and real concurrency), actual pinned CLI fresh/staging history-
insertion rejection/full rollback/retry with 13 genuine rows, two actual signature
tests, eight native Deno entrypoint checks, six real Chrome viewport/theme groups
and synthetic Vite build. Auth/mail/CAPTCHA doubles and synthetic Storage fixture
are explicit. Development failures in duplicate-trigger/fixture/assertion setup
were corrected; final reruns pass. Existing Vite CJS warning remains.

SKIP: hosted Auth/OTP/JWT gateway/email delivery, original refresh-session continuity,
real employee writes/deletion and hosted visual smoke. No hosted connection, SQL,
Auth/config, functions, frontend, Cloudflare, production or Shop changes. Source,
tests, dependency integrity lock and rollout documentation only; authorized feature
commit/push uses `[CF-Pages-Skip]` and a draft PR to development, no merge. Recovery
limitations and ordered separate-approval gates: `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md`.

## 2026-10-12 — PR #4 final lifecycle/security stabilization (local; supersedes email reactivation)

Branch: `fix/pr4-security-stabilization`, isolated at reviewed PR #4 HEAD
`a0dae0fc90332f9fc4a498823c1851c00c3f17b6`. Prior entries are retained as historical
checkpoints. Owner confirmed migration `20261010233446` has never been applied or
manually executed on hosted databases; only this unreleased migration is revised.
All twelve preceding migration Git blobs and frozen Shop artifact remain unchanged.

### Changes and confirmed findings

Replaced rejected email reactivation with exact-UUID retained-account suspension
and restoration. SQL Inactive/cutoff/audit commits before provider ban dispatch;
provider receipt, owned ban, original status and canonical Master are rechecked.
Reactivate sends no email/link/invitation, preserves password/role, restores former
Pending as Pending and requires fresh password login for ordinary access. Unknown
legacy identities and independent/changed bans fail closed. Added permanent old-
session cutoff, live owned Auth-session checks, Storage/private Realtime restrictive
policies and read-only managed-owner/RLS/dependency preflight. Runtime deletion
checks repeat custom Auth/team FKs and Storage ownership before dispatch; managed
Auth FK allowlist verifies exact schema/owner/table/constraint/user_id column.

Both ordinary password forms now send current_password; actual native API missing/
wrong-password denials retain the original password and session. Native Require
current password remains a hosted release prerequisite. Actual provider journeys
caught implicit recovery OTP AMR and post-Reactivate setup gaps; verified native
recovery can set a password without granting normal post-suspension authority or
activating Inactive. Pending acceptance follows native password success, not email
issuance. Removed Resend/custom Send Email Hook/recovery endpoint, reactivation
proof/transport SQL, obsolete transport tests/dependency integrity entries and
unused shared reexport. Required Pending retry/support compatibility stays.

Independent Master verification remains memory-only/local-scope cleanup. Real
single-session policy interrupts the original refresh during verification. Added
a default-off, current-Master-bound, trusted/audited continuity approval; delete
checks it before password grant/service client and again at SQL reservation/dispatch.
Alias verification is withheld while unapproved. Approval does not configure Auth
or establish actual safety; rebinding invalidates it.

Browser canonical authority checks every minute/focus/visibility distinguish
confirmed denial from network failure, cancel dialogs and clear private state.
Late loaders/alias/authority responses cannot refill it; login loader ordering and
logout cleanup are corrected. Wider audit found stored HTML/link injection in
Support Tickets: text/attributes are escaped and links allow credential-free HTTP(S)
only. Provisioning's preexisting Deno narrowing failure/nonexistent binding field
is corrected against actual server/read-back state; existing activation/rotation
contracts and digests are preserved. Fixed newline-portable hash tests without
changing historical SQL. No unrelated refactor, publication or secret changes.

### Validation and release gates

PASS: 225 broad regressions (zero failures/skips); six real PG17 bootstrap groups;
two canonical pre/post UUID groups; eight final real PG17 lifecycle groups; eight
pinned CLI atomicity groups plus final two affected lifecycle history rejection/
rollback/retry cases; six real GoTrue v2.197.0/PG17 Auth journeys; SQL-only Platform
fresh/upgrade/late-rollback runner; actual one-winner support SQL concurrency;
twelve native Chrome viewport/theme groups; all ten frozen Deno entrypoint checks;
synthetic Vite build; syntax/whitespace/sensitive-value/historical/artifact checks.
Local Auth tests use real HTTP/provider/schema and a SQL adapter for PostgREST;
SQL-only fixtures and browser transport/CAPTCHA doubles are explicitly distinct.
Development test/configuration failures were diagnosed and corrected before final
PASS. Existing Vite CJS API deprecation and existing import cycles are not suppressed;
no added circular participants. Shop test execution intentionally skipped.

SKIP: hosted gateway/configuration, real email/CAPTCHA, timebox/inactivity, hosted
session continuity and real employee writes. Production remains NO-GO: verify
current-password enforcement and safe Master continuity before approval; built-in
shared Auth sender restrictions conflict with unrestricted production onboarding;
managed policy permissions/public Storage/open Realtime need hosted checks. No
provider compare-and-set unban/arbitrary-UUID logout API is assumed. Freeze related
DDL/provider/target writes around destructive work; ambiguous ban/unban requires
trusted audited recovery. Frozen Shop suspension retains the intentional Orbito
Support exception, but open tabs/existing Auth sessions need separate authorized
session-hardening review. Backup restore/Vault and legal/provider gates unchanged.

Documentation: `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md` supersedes the rejected
transport plan with ordered separate-approval gates. `docs/PRODUCTION_READINESS_REPORT.md`
records fixes, evidence, exact file manifest, limitations and NO-GO. No hosted
connection, mutation, deployment, email, Cloudflare/Shop/protected-branch change,
commit or push. PR #4 remains Draft/open/unmerged at original remote HEAD. Local
corrections await independent source review and explicit checkpoint/integration
approval; no merge or deployment follows automatically.


## 2026-10-12 — Authorized GitHub review checkpoint for PR #4 corrections

Owner authorized committing/pushing the complete 39-file local correction set to
update the existing Draft PR #4; no merge or deployment. The previous uncommitted
audit checkpoint is preserved above. Verified exact manifest, reviewed base HEAD,
twelve historical migration blobs, frozen Shop artifact, staged-source eligibility
and existing local validation evidence. Only checkpoint documentation is refreshed;
source behavior/test results remain those recorded in the final stabilization audit.

Read-only Cloudflare inspection verified staging Pages `retrasellsaas`, repository
orbito, development production branch, npm run build/dist/root and no deploy hooks.
The PR source remains preview-eligible; prior skip-prefixed a0dae0f is skipped with
no deployment. Use verified native [CF-Pages-Skip] commit prefix and explicitly push
only the existing PR source ref. GitHub Pages disabled, no repository webhooks or
source/development Actions workflows. Preview Access restriction is verified;
backend isolation is not inferred. No settings/secrets/Supabase/Shop changes.

Commit on isolated fix/pr4-security-stabilization, then fast-forward integration
into feature/platform-team-lifecycle-v2 for independent review only. Recheck Draft/
unmerged PR, exact source commit, protected refs, worktree and Cloudflare skipped
record after push. Final SHA/status are supplied by Git/PR and the checkpoint report;
this pre-commit history does not claim post-push verification before it occurs.

## 2026-10-12 — PR #4 independent-review F1–F4 corrections

Branch: feature/platform-team-lifecycle-v2. Verified published review base be43f28b3a2cea0b1d73b2b9611a96818bed810d, Draft/open/unmerged PR #4 -> development. Earlier local-only checkpoints remain historical. Owner's confirmation that lifecycle migration 20261010233446 is unapplied governs this source-only correction; twelve applied migration blobs and frozen Shop artifact remain untouched.

### Changes and decisions

F1: session-aware operator identity broke historical support helper impersonation. Issuance now runs under the actual Master caller JWT, with canonical UUID/role/owned live session checks in SQL; service-role issuance is revoked. Service-only exchange resolves the recorded canonical actor without setting user claims. Exact source/client/project/binding/lifecycle, hash-only 256-bit grant, 90-second expiry, one-winner consumption and audit stay unchanged. The diagnostic no longer impersonates a subject. SQL fixtures declare user sessions explicitly; service tests contain no fake user session.

F2/F3: add authority UUID/session/role/view/selection/request/modal continuity guards to loaders and mutation continuations. Newer client loads win; mismatched/loading/failed detail cannot drive configuration. Logout, revocation, account/session switch and navigation discard late private results/follow-up writes. Related native link/setup and support-popup races were reproduced and corrected. Current-server mutations may already commit; no rollback or automatic resend is inferred. Username busy cleanup cannot remain stuck after navigation.

F4: distinguish published be43f28 from the historical uncommitted audit and enclosing correction revision; update coordinated rollout to include the reviewed support handler. Shared Manager/Billing reads match the existing documented contract, not UI confidentiality; any narrower RBAC requires an owner decision. Real SQL finish_edit verifies the existing session immediately adopts the live reduced role without changing suspension cutoff behavior.

### Validation / release boundary

PASS: 235 broad tests, six PG17 bootstrap groups, two canonical groups (50 combined handler/database tests), nine lifecycle groups, eight actual CLI 2.120.0 atomicity groups, six local GoTrue journeys, SQL-only fresh/upgrade/late rollback, real support authorization/concurrency group, twelve native Chrome groups, ten frozen Deno checks and synthetic Vite build. Baseline F1 service issue/exchange and F2/F3/adjacent setup probes fail before fixes and pass on corrected source. Explicit synthetic SQL/browser transports remain separate from real provider proof; no emails sent.

SKIP: full PostgREST/Edge gateway support journey (no cached PostgREST runtime), hosted Auth/CAPTCHA/mail/Storage/Realtime/continuity and real account writes. Existing Vite CJS deprecation remains. Staging/production NO-GO pending independent re-review, owner policy decisions and separately approved hosted preflight/rollout/backup/journeys.

Git checkpoint is authorized only after current trigger review: development-only Pages build, no deploy hooks, no source/base Actions workflows/repository webhooks or local Git hooks; verified native CF-Pages-Skip prefix prevents this source update's Pages deployment. Backend isolation is not inferred. Push only existing PR source, keep Draft; final SHA/skip evidence belongs to Git/PR/final checkpoint report. No merge, hosted resource, protected branch, Shop or credential changes.

## 2026-10-13 — Final targeted PR #4 source checkpoint preparation

Work continued across midnight Asia/Karachi. The complete follow-up is 43 files: targeted source/forward SQL/diagnostic/docs and explicit session/context regression fixtures. Final SQL also retains the historical verified-email shape restriction at issuance. Affected PG17 support and CLI fresh/staging history-rejection/retry checks passed after that last SQL correction; full results and before/after probes are recorded in PRODUCTION_READINESS_REPORT. No hosted deployment/test is implied.

Reconfirmed the reviewed be43f28 source base, Draft/open/unmerged PR #4 -> development, unchanged protected refs, twelve historical migrations/frozen Shop artifact and clean Shop. Stage exactly the recorded manifest; inspect staged diff, whitespace and sensitive values, commit with the verified native CF-Pages-Skip prefix, push only the existing feature ref and verify Cloudflare skip/PR SHA afterward. Keep staging/production NO-GO and stop for independent source review. No merge, hosted resource or production configuration change is authorized.

### Final 2026-10-13 support boundary correction (supersedes provisional F1 design above)

Before committing, rejected public/authenticated issuance because server-only Platform ref and nonce control must stay in Edge. Final SQL adds a service-only five-argument support RPC: native caller verification/canonical identity supplies the actual session_id, SQL rechecks confirmed active bound Master plus the owned live session, and all API access to the old four-argument RPC is revoked. Consumption validates the recorded actor/capability without user JWT impersonation. The service JWT contains no fake user claims. This matches the existing trusted team-command boundary and does not weaken operator_role. Tests use distinct Auth UUID/session IDs, direct browser/legacy API denials, missing/expired/wrong-owner/removed sessions, revoked/rebound actors and concurrent exchange.

Also caught and tested an introduced modal/loading interaction: opening a modal must not cancel a still-current client detail load. Loaders ignore modal identity while retaining authority/view/selection/request guards; mutation completions retain modal/operation identity. Docker temporarily became unavailable, was restarted by the owner, and final affected checks reran rather than being waived. These were local development corrections, never hosted changes.

## 2026-10-13 — PR #4 R1/R2 login and Shop-read ownership corrections

Branch: feature/platform-team-lifecycle-v2, clean published base 65429dba0e19aea6467f1347222e044f5e7549bc. Independent review confirmed F1–F4 but reproduced cancelled-login locking/successor cleanup and modal-dependent config loading. Its CODE REVIEW FAIL supersedes the earlier local readiness recommendation; this follow-up requires focused independent re-review. Staging/production remain NO-GO.

Login now owns a unique attempt and authority generation. Cancellation clears its lock; awaited success/failure/catch/finally work cannot touch a successor. Native SIGNED_OUT during authentication/loading cancels, while expected local preflight/failure-cleanup signout on already-cleared state retains its own cleanup lock. A controlled actual-handler probe also confirmed late startup session results could reset a later login; startup publication now checks the original generation. Canonical identity/CAPTCHA/local signout and stale-session enforcement remain intact.

Shop configuration reads ignore modal identity but retain authority/page/target/selection/request guards. Owned success/error/rejection/cancellation cannot strand Loading or mutate a newer client/request. Failed detail offers the existing read-only Refresh status action; strict form/mutation modal ownership remains. No auth/RBAC/provisioning redesign or backend/SQL/Shop changes.

PASS: 243 broad regressions (previous 235 plus eight actual-handler groups); six PG17 bootstrap, two canonical and nine lifecycle groups; six real GoTrue/PG17 groups; real support authorization/concurrency; twelve Chrome viewport/theme groups; ten frozen Deno checks; synthetic Vite build; syntax/whitespace/sensitive/historical/artifact/cycle checks. Pinned baseline reproduces seven failures and one retained-behavior pass; current source passes all eight. Initial existing fixture failures were corrected by declaring the actual initialized generation, without relaxing assertions. Provider doubles/SQL adapter/Vault fixtures are explicit; native SDK/hosted event scheduling is not certified by mocks.

SKIP hosted Auth/CAPTCHA/email/gateway/Storage/Realtime and real account writes. CLI atomicity is prior-checkpoint evidence, not rerun: no migration/CLI changes. Existing Vite CJS deprecation remains. Native current-password/continuity/sender, owner policy, managed permissions, backup/Vault/legal and separate Shop gates stay open.

Nine-file manifest and reproduction commands are in PRODUCTION_READINESS_REPORT. Owner authorizes safe commit/push to existing Draft PR #4 only after trigger verification, using the approved CF-Pages-Skip prefix. Final SHA/provider skip belongs to Git/PR/final checkpoint evidence after execution; no automatic merge or hosted rollout. No generated evidence, credentials or build artifacts are eligible for commit.

Read-only trigger review completed before checkpoint: same Cloudflare staging build/branch/no hooks and prior 65429db skip; no source/base Actions, repository/local hooks; GitHub Pages disabled and same installed apps. Recovered an unresponsive browser target using a fresh same-browser tab, without environment or provider changes. Publish only the feature ref with native skip and verify exact new provider record afterward; preview access is not backend isolation.

## 2026-10-13 — Client form DOM continuity and canonical employee read isolation

Branch: feature/platform-team-lifecycle-v2; reviewed base 6ea96cbc. Existing PR #4
remains Draft. Owner supersedes inherited shared reads and confirms Manager keeps
invoice date/total/status summaries, while View/print is Master/Billing-only.

The renderer retains owned actual Edit Client DOM, typed values/options and
focus/caret during Shop and normal refreshes; logout/role/selection/modal changes
invalidate retention. Strict prior read/request/mutation ownership stays.
Forward 20261012231226 changes 17 raw-table policies and adds restrictive read
ceilings, explicit per-role projections, private helper EXECUTE closure and
scoped indirect RPCs. Bounded client/support RPCs preserve legitimate Manager
writes; checked financial wrappers preserve Billing operations without private
metadata. Storage/private channels require live Master; app publication membership
is removed, with schema/ALL-TABLE and managed-prerequisite failure gates.

Employee loaders fetch only approved datasets and own identity. Canonical role
changes clear prior records/navigation/modal/continuations before native refresh,
without a new-login role-edit contract. Read denial is explicit and blocks
mutations rather than masquerading as empty finance. Unverified client save keeps
its draft and reports refresh. Real browser testing found/fixed a selected-client
refresh scope error; the final audit protects archived client financial records
and adds permissive-policy/PUBLIC-grant and publication-schema regressions. A
changed-role page followed by a failed native identity retry also reproduced old
cached support retention; clearing the cache before retry now passes its actual
production-loader regression without signing out or replacing the session.

PASS: 250 regressions; baseline DOM expected FAIL then seven corrected real-browser
groups plus twelve existing groups; six PG17 bootstrap, two canonical and nine
lifecycle groups; four populated PG17/PostgREST groups; six native GoTrue provider
groups; real Support concurrency/security; eight actual CLI groups extended for
14 history failure/retry and read preflight/validator; ten Deno entries, synthetic
Vite build and integrity checks. Final affected checks rerun before checkpoint.
Explicit synthetic transport/SQL fixtures and hosted SKIPs remain documented;
Single-session interruption continues to block destructive approval until hosted
continuity is proven. Existing Vite CJS warning/five cycle participants unchanged.

Only read-only staging migration history was accessed: twelve genuine records,
13 absent. No customer/Auth/credential read, hosted mutation or production access.
The twelve historical migrations, unapplied 13, Edge sources/config, frozen Shop
artifact and protected refs are unchanged. New full-chain count is fourteen;
future separately approved maintenance plan requires handlers, 13 then 14 and
matching frontend, with real role/managed/custom surface/backup checks. No history
repair or automatic rights broadening/redeployment rollback. Complete 31-file
manifest/matrix/reproduction/limits are in PRODUCTION_READINESS_REPORT and
PLATFORM_ROLE_READ_ISOLATION. Safe source commit/push uses the approved native
CF-Pages-Skip prefix after trigger inspection and exact post-push verification;
final SHA is Git/PR checkpoint evidence. No staging/production GO is declared.

## 2026-10-13 — Focused role-response race and Manager entitlement corrections

Branch: feature/platform-team-lifecycle-v2; reviewed base bfc24ca50d4f5d18b329f0c601473c0f9ee208df.
The latest independent review reproduced a first dataset error suppressing a
later canonical role change, and a Manager plan save skipping Shop sync because
private provisioning fields are intentionally unavailable.

Owned role-tagged responses now immediately clear former-role cache, client,
modal and continuations independently of aggregate rejection. A bounded reload
uses only the successor's permitted datasets; stale replies cannot reverse it.
Manager entitlement sync uses approved operational status and the existing
checked config path. Master verification remains supported. Incomplete sync
reports the committed Platform update, refreshes status, closes the form and
requires reconciliation of recorded uncertainty, never automatic write replay.
Billing inventory-addon changes were also affected: rates remain authorized,
while unconfirmed Shop sync is explicitly referred to Master/Manager rather than
broadening Billing's deliberately denied configuration authority.

PASS: five failure-before/pass-after cases; 27 affected loader/race/operation/
configuration checks; syntax, synthetic Vite build, whitespace and integrity.
Transport is synthetic. Full regression/browser/native database/Auth/CLI/Deno
suites were not rerun because no server contract, SQL, Edge or dependency changed.
Native/hosted behavior remains a separate gate; Vite CJS warning remains.

Exactly six files: src/supabase.js, src/forms.js, tests/platform-role-loaders.test.mjs,
tests/frontend-races.test.mjs, PRODUCTION_READINESS_REPORT.md and this history.
All fourteen migrations, frozen Shop artifact and protected branches are preserved.
Update only existing Draft PR #4 after current trigger inspection, native skip
and exact provider confirmation. No merge, hosted change or deployment;
independent review pending, staging/production remain NO-GO.

## 2026-10-13 — Sync Edit Client entitlements only for a changed plan

Branch: feature/platform-team-lifecycle-v2; base 7acc88b. A successful Edit Client
save now compares its saved plan input with the captured original client plan
before automatic Shop sync. Name, industry and Shop URL edits with the same plan
therefore preserve customized Shop modules. Master/Manager plan synchronization,
Billing addon reconciliation, ownership and uncertain-operation handling stay intact.

Name-only regression failed before; both focused cases pass after, including the
correct saved-plan entitlement request. PASS: 19 affected form/config checks,
syntax and whitespace. No full, browser, PG/Auth/CLI/Deno suites or build were run.
Only forms, its existing test file, this history and the readiness note change.
No server/SQL/Shop change; safe native-skip checkpoint to Draft PR #4 only.
Independent review pending; staging/production remain NO-GO.

## 2026-10-13 — Managed policy creation through supported supautils

Branch: feature/platform-team-lifecycle-v2; reviewed base 8909859. The hosted
membership blocker was an overly restrictive prerequisite. Official Realtime
documentation explicitly supports non-owner postgres policy statements; official
Supabase PostgreSQL configuration allowlists both storage.objects and
realtime.messages through supautils.policy_grants. See [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[Storage policies](https://supabase.com/docs/guides/storage/security/access-control)
and [provider configuration](https://github.com/supabase/postgres/blob/develop/ansible/files/postgresql_config/supautils.conf.j2).

Unapplied migrations 13/14 now issue the identical restrictive policies directly
as the migration caller, with permission errors propagating. Removed managed-owner
membership gates and SET LOCAL ROLE; retained object/RLS gates. Matching read-only
preflights accept inherited owner authority or a registered, loaded supautils
policy_grants setting with the exact caller/table allowlist. These findings
supersede older documentation's unconditional table-owner permission prerequisite.
No managed ownership, internal membership, grants or application contracts change.

PASS: two actual CLI 2.120.0 forward scenarios (fresh and staging-style) on cached
Supabase PostgreSQL 17.6.1.155 with real supautils, non-superuser postgres and no
USAGE/SET owner memberships. Local-only negative controls reproduce the obsolete
guard and withhold Realtime policy permission; complete SQL/policy/history rollback,
history-INSERT rejection, retry, exact genuine history counts and unchanged owner/
membership/RLS state pass. Initial fixture setup failures were corrected; final
result 2 PASS, 0 FAIL. Four affected SQL/PostgREST role-isolation groups, syntax,
whitespace, original twelve migration and frozen Shop integrity checks pass.

SKIP: hosted capability verification and unrelated full frontend/browser/Auth
suites. No hosted SQL executed. A separately authorized read-only preflight must
confirm staging's loaded policy allowlist; missing/invisible capability requires
Supabase confirmation, not rights broadening. Local corrections only, no commit,
push, deployment or merge. Staging and production remain NO-GO.

## 2026-10-14 — Verified employee retirement, fresh re-onboarding and setup renewal

Branch: feature/platform-team-lifecycle-v2; clean base 357775f. Draft PR #4 remains
open/unmerged. Owner requested targeted deletion/reuse and sticky confirmation
fixes, then added renewal from the Pending invitation status popup.

Read-only staging metadata confirmed 14 migrations and disabled continuity approval:
both legacy Auth mappings are absent with no same-email replacement; the Pending
identity exists, is email-confirmed, has signed in and has no open operation. No
deletion operations exist for those records. The 503 safety rejection happens before
password verification/reservation; login alone does not justify enabling the gate.

New forward 20261013214541 preserves all fourteen applied migrations. Immutable
employee/Auth UUID tombstones remain; explicit latest-predecessor approval and Auth
absence allow an email to start another fresh lifecycle. Live uniqueness/open-operation
constraints remain. A private reservation nonce plus native creation/invitation
evidence prevents adopting unrelated existing Auth identities. Exact-UUID deletion,
dependency checks, default-off continuity, password/CAPTCHA, audit and reconciliation
are preserved; mismatched email/UUID mappings fail closed at reservation/dispatch.

Server codes distinguish definite pre-operation denials from later uncertainty.
Deletion dialogs alone ignore backdrop clicks and preserve verification inputs.
Pending renewal uses a new Master/JWT-only endpoint and durable single-dispatch
request: native invite for unconfirmed identities, native recovery for confirmed
Pending identities, retaining UUID/role/Pending status. No third-party sender or
separate reset button; unknown sends require review, never blind replay.

PASS: 17 focused server-source, two frontend, four dialog and four real PG17 groups;
one native GoTrue group verifies hard deletion/new UUID/retired invite and recovery
denial; one local Chromium group verifies sticky inputs, focus, cleanup and one-shot
confirmation. Deno, syntax, synthetic build and integrity pass. Initial SQL-anchor
and fixture failures corrected. SKIP: hosted continuity/CAPTCHA/email acceptance,
wall-clock expiry and unrelated suites; mocks/local native behavior are distinguished.
The existing lifecycle review records exact ordered rollout, backup, approval and
recovery gates. No hosted writes, credentials/users changed, scheduler/Shop/Cloudflare
modification, commit/push or merge. Source review pending; staging/production NO-GO.

## 2026-10-14 — Independent review F1/F2/F3 corrections

Branch/base: feature/platform-team-lifecycle-v2 / 357775f; local, unstaged,
uncommitted. The complete independent report and reproduction logs/source were
read before edits. All eighteen files matched its reviewed ZIP. Both F1 defect
reproductions and the reported 121 PASS / 2 FAIL frontend run were reproduced.
Independent FAIL remains prior evidence; this checkpoint is not independent approval.

F1: the old uncertainty override knew only an operation loaded by the current
invocation. Early retry failures could falsely deny an earlier Auth dispatch.
Deletion errors now always retain review_required=true and unverified operation
state; an explicit marker describes only rejection of this attempt. No privileged
history query is added before canonical/session/password/continuity gates. The
decoder preserves prior uncertainty and request IDs even for legacy false flags.
Only existing exact-owned SQL reconciliation can confirm completion. No provider
replay, account modification, permissions/RPC change or migration edit is introduced.

F2: native "Resend invitation" is permitted while precise SDK/API/dependency/secret/
legacy-transport checks reject deliberately inserted provider integrations. Commented
native SMTP examples are distinguished from active configuration. Reusable handler
fixtures moved to a side-effect-free helper; database tests no longer register the
unit suite. Mock request ownership/completion now reflects existing SQL constraints.

F3: invitation tests use the real state initializer plus loaded Master archive data;
ordinary, approved/cancelled retirement, latest predecessor, duplicate/stale identity
denials and unloaded state are exercised without production fallback changes.

PASS: 125 focused tests, 14 new actual-handler/decoder regressions, corrected two-case
independent reproduction, four retirement/rollback SQL groups, six native Auth groups,
six actual Chromium groups (320/768/1440 light/dark), Deno, syntax and synthetic build.
The complete PostgreSQL rerun passed 23/23 groups (6 bootstrap, 2 canonical,
11 lifecycle, 4 role/API); the separate role-read run passed 4/4. All final runs
exit 0. Overlapping selectors/reproductions are not
added to unique totals. The first general runner passed eight groups but hit its old
180-second eleven-group lifecycle deadline; only that suite receives a bounded
480-second allowance. Initial fixture/guard conditions and sandbox build EPERM were
resolved and retained in evidence, with no skipped assertions. Exact commands, exits,
logs and hashes are outside Git in RetraSellReviewEvidence/2026-10-14-F1-F3.

Applied migrations 1–14, reviewed forward 15, original Master/security contracts,
frozen Shop artifact and protected refs are unchanged. Current set: 23 files (prior
eighteen plus two affected test modules and three new test/helper files). Prior ZIP
is preserved, not updated. SKIP/pending: hosted email/CAPTCHA/continuity/journeys,
elapsed expiry, migration-15 CLI history/connection-loss fault test and unrelated
Shop tests. No hosted access, policy enablement, scheduler change, deployment, Git
checkpoint or PR modification. Fresh independent review and separate rollout approval
remain required. Local corrections implemented and validated; ready for fresh
independent review, with no staging deployment authorized. Staging/production NO-GO.

## 2026-10-15 — Eleven corrections, dedicated Team page and official branding

Clean starting branch/HEAD: feature/platform-team-lifecycle-v2 / 7113681; GitHub
PR #4 independently verified Draft/open/unmerged to development at the same SHA.
Current work is local and uncommitted. No protected branch, Shop artifact,
Supabase project, Cloudflare configuration, real account, credential or email changed.

Forward 16, 20261015003232_platform_team_invitation_review.sql, was created with
CLI 2.120.0. Migrations 1–15 remain untouched. Explicit failed-create clearance
requires exact actor/request/target, unchanged unlinked Pending reservation,
settled review, Auth absence (including soft-deleted/nonce-linked identities),
no competing operation/FK and a live canonical Master. Its locked cancellation,
retained resolution and audit are retry/concurrency safe; it never deletes Auth
or auto-reinvites. Late native responses cannot complete a cancelled reservation;
later provider identities still require reviewed reconciliation, never email adoption.
Minimal caller-checked deletion-history and own-session inactive-notice RPCs improve
accurate errors without widening data access. Native user_banned remains generic:
the provider checks it before the password. Unknown invite expiry/delivery remains
explicit, with legitimate Pending renewal, no resend of unresolved/unlinked creation.

The Master-only diagnostic uses a separate memory-only client and tests native
refresh DURING the temporary grant as well as after local cleanup, then repeats
canonical checks. This catches the single-session false-positive case. Obsolete
continuations cannot refresh a successor; failures/cleanup are explicit. The
diagnostic cannot enable deletion; its database policy stays FALSE. Lifecycle and
recovery notices are action-specific and never claim delivery after a send failure.

Team now has its own canonical Master-only /team page, tabs/counts/search, Manage
dialogs, refresh, invitation review and read-only archive. Settings retains personal
credentials, platform information and the diagnostic. The old Settings Team renderer
and unused RA-logo styles are removed. Confirmed identity/role feedback, keyboard
focus, private-overlay revocation cleanup and responsive table overflow are covered.

Read the official 24-page PDF, editable guide/tokens and actual refined assets.
Eleven exact SVG/PNG images under public/brand preserve original filenames/geometry;
four supplied embedded Inter weights and official OFL are local. Supplied light/dark
tokens cover Auth, shell/pages/forms/dialogs/notifications and invoice presentation;
sidebar stays navy. Stable assets can be replaced without frontend source changes.
The final audit found the newer branding 2.0 package (optical state C) and replaced
the two horizontal SVGs using its exact original filenames. All eleven image hashes
agree with final-C CSV/JSON manifests; other images, fonts and tokens match unchanged.
Final owner visual acceptance is pending.
Invoice calculations/ledger selection are unchanged. Print waits for the official
image and rechecks original authority; invoice preview focus/Escape/private cleanup
uses the common dialog lifetime. Client, plan/addon, billing mutation, provisioning,
support, lifecycle and frozen Shop contracts are preserved.

Final validation: 286 selected source regressions PASS (zero FAIL/SKIP). Real PG17
suites PASS 24 groups
(6 bootstrap, 2 canonical, 12 lifecycle/review, 4 SQL/PostgREST isolation); strengthened
populated-upgrade/concurrent-clear/rollback check also PASS. Actual diagnostic with
native GoTrue passes multi-session and rejects single-session loss; eight native
groups PASS, using explicit SDK/PostgREST transport adapters. Final read-only validator/
populated upgrade/concurrent clear/late SQL failure PASS. Eight affected native Deno
checks PASS. Six actual Edge Chromium viewport/theme groups plus Team/Auth actions,
three retained Client-modal and three employee-role journeys PASS with synthetic
data and zero external traffic. Final synthetic Vite build, 31 JS syntax checks,
TOML/manifest/whitespace and asset/source integrity PASS; no new literal-import cycles.
All 23 supplied contrast pairs meet specified thresholds (not a full WCAG audit).
Before screenshots use exact starting source. Initial fixture/assertion/selector
failures, corrected mobile overflow and unavailable Chrome startup are retained.
Docker/D: initially blocked final checks; the owner restored them and those checks
then passed. No dependency failure is counted as a pass. Final set: 61 files,
33 modified/28 new, nothing staged; exact manifest is in the detailed report.

Hosted SMTP/CAPTCHA/session/SDK acceptance, exact native link validity, CLI-16 history/
connection fault injection and final visual/independent review remain unverified.
Full report: docs/PLATFORM_UI_BRANDING_REVIEW.md. Evidence is outside Git under
RetraSellReviewEvidence/2026-10-15-ui. No commit/push/merge/deployment authorized;
staging and production remain NO-GO.

## 2026-10-16 — Independent F1 invoice print typography/readiness correction

Branch: feature/platform-team-lifecycle-v2; committed HEAD remains 7113681.
The starting 61-file uncommitted implementation exactly matched its prior hash
ledger. Independent F1 was reproduced: the print document named Inter but did not
load it. Only billing's print-window function changes: local approved 400/500/600/
700 font faces, absolute same-origin paths, explicit font/image readiness, cached
asset fast paths, one-shot cleanup and a 15-second browser-timer failure deadline.
User-gesture popup creation, invoice layout/values/currency and authority checks
are preserved. A native-browser-discovered popup-close/font-rejection race is
also reproduced and corrected; cancellation stays quiet and never prints.

PASS: 73 affected source tests, ten actual Edge popup/font/image scenarios,
synthetic Vite build, three syntax checks, whitespace, font/artifact and scoped
source integrity. Final runs have zero failures; expected before-failures and
initial harness failures are retained. CDP routing stalled native popup requests;
an owned loopback proxy resolved the test limitation without a product workaround.
It blocked Edge background traffic and forwarded nothing externally. OS printing
is intercepted; Chrome/other engines and hosted/printer acceptance are SKIP.
Unchanged SQL/Auth/CLI/Deno/full suites were not rerun.

Five follow-up files; 57 other starting files are byte-identical and existing
history is preserved. Current set: 62 files (33 modified/29 new), nothing staged.
Migrations 1–16, final-C assets/fonts/tokens, employee/Master/RBAC/diagnostic code,
default-disabled deletion, protected refs and frozen Shop artifact are unchanged.
Evidence: RetraSellReviewEvidence/2026-10-16-invoice-print; detailed F1 supplement
in docs/PLATFORM_UI_BRANDING_REVIEW.md. Ready for focused independent re-review,
not full security approval. No commit/push/PR change, hosted access or deployment;
Draft PR #4 remains unmerged. Staging and production remain NO-GO.

## 2026-10-16 — Migration 16 actual CLI atomicity and uncertain acknowledgments

Branch/HEAD unchanged: feature/platform-team-lifecycle-v2 / 7113681. Starting
62-file F1 checkpoint matched its ledger; application, invoice correction, assets,
Shop artifact and all sixteen migration files remain untouched.

Extended the existing CLI harness, with optional evidence/work isolation outside
Git. Actual pinned Supabase frontend 2.120.0 (verified binary hash), PG17.6 image,
native Auth migrations/Vault/pgcrypto/supautils and provider-owned table fixtures
apply genuine history through 15, then test 16 as non-superuser postgres. Empty and
populated scenarios retain Master/config, Active/Pending/Inactive employees, failed
reservation, immutable archive/audit and representative billing records. No history
repair or manual successful history INSERT is used; deletion remains FALSE.

PASS: nine CLI scenarios (ten Node tests including parent), plus the existing
focused migration-16 SQL/security group; zero final FAIL/SKIP. History rejection
and exact owned-backend termination after SQL completion roll back SQL/history
jointly; early DDL termination also rolls back. A wire proxy dropping post-commit
ReadyForQuery instead leaves all changes and one genuine history row committed
although CLI fails. Authoritative inspection precedes retry; never infer rollback
from an error. Concurrent statuses [0,1] preserve one complete migration; runners
must still be serialized. Repeated executions preserve schema/data/policies.

Initial failures were a missing fixture field and administrator-owned clones;
correcting synthetic data/database ownership required no migration or privilege
relaxation. Logs remain. Owned resources were label-verified and removed. Syntax,
whitespace and source preservation pass. Only CLI tests and two documentation files
change this round; current set is 63 files (34 modified/29 new), nothing staged.
Evidence: RetraSellReviewEvidence/2026-10-16-migration16-cli. Hosted/TLS/pooler/crash
and exhaustive timing cases remain unverified; full frontend/Auth HTTP/Deno suites
were not rerun. Local migration-16 atomicity PASS is not overall security approval.
No commit, push, PR modification, hosted access or deployment. Staging/production
remain NO-GO; independent review and separately authorized rollout are required.


## 2026-10-16 — Login and Add Client presentation refinement

Branch: feature/platform-team-lifecycle-v2; HEAD remains 015e82e.
Read the supplied refined-brand HTML guidelines and packaged/current CSS tokens.
Preserved official artwork, stable asset paths, Inter and both theme palettes.
Login has balanced card spacing and a grouped verification area, with room for the
standard 300px challenge at 320px. Credential and caught authorization failures
share the owner's generic message; provider account/suspension details stay hidden.
Existing checks, session ownership, CAPTCHA lifecycle and cleanup are unchanged.
Add Client is a 1080px dialog with five labelled fieldsets, desktop columns,
mobile stacking, fixed header and visible sticky actions over a scrolling form.
All fourteen original controls, options, defaults, IDs and validation attributes
are retained. Submission, addon behavior, creation and backend contracts are intact.

Validation PASS: 36 focused login/UI/form-race regressions, six real Edge browser
groups (320/768/1440, light/dark), synthetic-config production Vite build, JS syntax
and whitespace. Browser checks compare every control against the committed form,
verify required validation/addon visibility/Cancel/action visibility and no page
overflow; zero page errors or external page requests. Initial sandbox browser
startup failed; the same local checks passed outside that sandbox. Actual provider
challenge/hosted login and client creation were not exercised. Evidence/screenshots
and synthetic build are outside Git in RetraSellReviewEvidence/2026-10-16-ui-polish.
No migrations/functions/permissions/official assets changed; no hosted access,
commit, push, PR mutation or deployment. Changes remain local for owner review.


## 2026-10-17 — PR #4 forensic F1/F2/F3 corrections and local validation

Branch: `feature/platform-team-lifecycle-v2`; reviewed parent `d3fc517aabb2b5d09ea939aa56830287b5d89bba`.

Reproduced all three independent findings against the exact parent on disposable
PostgreSQL 17. The three new correctness oracles also failed there for the expected
reasons. Forward migration `20261016160517_pr4_security_corrections.sql`, generated
with CLI 2.120.0, preserves migrations 1–16 and the frozen Shop artifact.

F1 permits an already-confirmed, canonically linked successor to submit its own
unchanged normalized email during name/role edits. Actual email changes still
check archived addresses, live employees and Auth identities; UUID tombstones,
archive/audit retention, confirmation and authorization checks remain intact.

F2 separates editable business URLs from a private, explicitly Master-approved
support origin. No URL is backfilled or automatically trusted. Approval checks the
current protected client/project/binding/source tuple, records an audited reason
and prior approval, and uses revision-based compare-and-set. Only the canonical
Master can review/approve/reapprove; a stale approval remains reviewable but cannot
authorize handoff. Issuance, consumption and browser navigation verify the protected
pairing/revision. Reapproval, re-pairing or Master-binding revision changes invalidate
outstanding grants. Original single-use, expiry, live-session and tenant checks
remain. The reproduced disclosure was not a demonstrated remote Shop takeover.

F3 serializes commercial plan/addon intent and configuration reservations through
the client row lock. New intent remains durably pending until verified; delayed
old payloads/completions cannot certify a newer plan. An unresolved operation blocks
competing commercial changes, while urgent suspension remains available when no
operation is already in flight. Same-plan metadata edits preserve custom modules.
Manager/Master can explicitly reconcile the current server-derived intent; Billing
retains its existing financial boundary. Read-back alone never settles an uncertain
write: Master recovery must acknowledge the exact original UUID/payload through
the unchanged atomic Shop journal. Unknown outcomes cannot be discarded to unlock
later writes. Verified suspension can complete without falsely clearing pending
commercial intent. The recovery UI retains explicit unresolved messaging. Duplicate and completed-recovery
responses also check current intent before reporting applied; a focused pre-fix
test reproduced the early-return bypass.

Final local PASS: 296 source regressions; 30 PG17 groups (6 bootstrap, 2 canonical
team, 12 lifecycle, 4 role/PostgREST, 6 new forensic/security groups); 9 actual CLI-17
scenarios (10 Node tests including parent); 8 native Auth groups; four real Chromium
browser suites; all 12 Deno entrypoints; synthetic-config production build, syntax,
whitespace and integrity checks. CLI cases cover fresh/populated upgrades, SQL/history
rejection and termination, retries, early termination, lost post-commit acknowledgment
and concurrent attempts. Lost acknowledgment can leave a complete committed migration:
inspect authoritative state before retry. Initial fixture/assertion failures, a Deno
flag error and interrupted/timed-out runs are retained separately from final passes.
The local runner gives full child suites eight minutes without relaxing SQL assertions
or individual Docker command deadlines. The exact frozen journal SQL was additionally
tested on a minimal substrate; this is not full Shop integration.

Native email delivery, hosted CAPTCHA/session continuity and provider configuration,
TLS/pooler/network crash timing, hosted finance/provisioning/Shop/Support and production
acceptance remain unverified. The PGlite cross-repository SQL suite was not run; real
PG17 tests supply database evidence. Existing checksum fixture checks passed without
changing or replacing Shop integrity checks. Default-off employee deletion remains off.
D1 provisioner source/deployment drift remains unresolved and was not changed remotely.

Future rollout needs separate approval: backup/freeze, resolve/drain old config jobs
(the migration refuses open jobs), migration 17, matching `platform-config` and
`platform-support` bundles, independently verified Master destination approvals, then
matching frontend and scoped hosted acceptance. Support fails closed until approval;
previously drifted plan/custom configurations require explicit review, not automatic
retroactive certification. No hosted Supabase operation, deployment, tag mutation or
protected-branch change is authorized here. The approved feature-only checkpoint uses
`[CF-Pages-Skip]`; its exact commit and actual provider result must be verified after
push. PR #4 stays Draft/unmerged. Independent re-review and staging/production NO-GO
remain; full documentation finalization is deferred.


## 2026-10-17 — PR #4 focused N1/N2 follow-up

Branch: `feature/platform-team-lifecycle-v2`; parent `b832dec56b14592e44149462f127904c9c5225eb`.
Read the latest independent Work report, results and reproduction scripts/logs.
N1 shared any in-flight configuration promise by client ID and announced success
without checking refreshed commercial intent. Configuration requests now coalesce
only identical boolean-payload snapshots whose original and current views still
own the operation; conflicts reject without queuing a write. Reconciliation requires
an applied response and a fresh, error-free projection with the requested generation
and `pending=false`. Session/role loss, newer intent, refresh failure and uncertainty
cannot announce success. Normal operations acquire no additional status request.

N2 checked open jobs before excluding legacy writers. Migration 17 now takes its
eventual ACCESS EXCLUSIVE locks on clients, then configuration jobs, before preflight
and holds them through the CLI transaction. A deferred constraint rejects a queued
legacy body that resumes with an unversioned open reservation after transition;
legitimate new reservations are stamped by the existing verified wrapper before
commit. Completed legacy rows stay unchanged; no generation is fabricated.
The private deferred lookup uses a fixed search path and owner execution because
it runs after the RPC returns; all API-role EXECUTE privileges are revoked.
Locking rationale follows PostgreSQL 17 explicit-locking documentation:
https://www.postgresql.org/docs/17/explicit-locking.html.
Latest owner/Work evidence lists staging migrations 1–16; 17 was only executed in
our disposable local fixtures, with no authorized hosted application. Corrected
that unapplied migration in place; migrations 1–16 remain immutable. Production
was not inspected. The CLI-17 statement allowlist accepts the new lock/constraint
statements without weakening its failure assertions.

Executed PASS: 5 lightweight Node tests (3 helper/payment, 2 N1 handler groups),
syntax for eight changed JS/test files and whitespace. Written but NOT executed:
N2 two-connection queued-writer/preflight tests, extended completed-history/late
rollback checks, and the adjusted browser/CLI fixtures. No SQL parser was installed,
so SQL parsing is SKIP. Full source, PG17/Auth/Vault/Docker, actual CLI atomicity,
browser, Deno and build suites were deliberately not run under the owner's minimal
budget; the next independent Work review must execute them. Previous broad PASS
records describe the preceding commit, not validation of these revised SQL bytes.
No hosted changes, emails, deletion-policy enablement, deployment or protected-ref/
tag changes are authorized. The approved feature-only checkpoint uses the native
Cloudflare skip marker; PR #4 stays Draft/unmerged. D1 and hosted acceptance remain
separate gates; staging and production remain NO-GO.


## 2026-10-17 — PR #4 N3 CLI-compatible migration locks

Parent: `7b7de2335da3ec264583dc4c23c508948f665ae8`; feature branch unchanged.
Read the independent N1/N2 review, CLI failure/control logs and disposable candidate.
The previous N2 correction placed LOCK TABLE at top level; pinned CLI 2.120.0
rejects that placement with 25P01 before preflight. Move the same two locks inside
the existing initial DO block, client before configuration job, before checking
outstanding work. No authored transaction BEGIN/COMMIT is added: SQL and history
remain under the supported CLI batch boundary. Deferred legacy fencing, completed
history, permissions and all other migration/frontend logic are unchanged.
Owner/latest review evidence confirms staging still has migrations 1–16; 17 is
unapplied in the authorized persistent target, so correct it in place. No production
inspection or hosted SQL was performed; migrations 1–16 remain immutable.

Lightweight checks: exact transformation/candidate comparison, lock order and
unchanged-remainder assertions, protected-file integrity, diff/whitespace and
sensitive-value review. No runtime test is claimed this round. Independent Work
must execute actual CLI application and all nine fault scenarios, history rollback/
retry/duplicate handling, lost acknowledgment, concurrent migrators, original N2
and queued legacy writers, deferred fencing, outstanding/completed-history checks,
late SQL rollback/retry and relevant N1/F1/F2/F3 regressions on the new committed
HEAD. The reviewer's candidate success is feasibility evidence, not acceptance of
this commit. No Docker, Auth, browser, build or full-source campaign was run.
Feature-only commit/push uses the verified Cloudflare skip convention; PR #4 stays
Draft/unmerged. D1, independent acceptance and hosted gates remain unresolved;
no merge/deploy/deletion enablement or staging/production readiness is authorized.


## 2026-10-17 — PR #4 documentation and permanent acceptance ledger

Branch: `feature/platform-team-lifecycle-v2`; reviewed code HEAD
`27f6abde0274ac6c989664d0b363504b93128d10`.

### Purpose and changed

Reconciled D01–D40 from the independent forensic documentation audit with all 14
source/correction commits. Added `docs/PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md` and
`docs/PR4_ACCEPTANCE_CASES.csv`: all 120 stable IDs and 42 joined risk records,
original status plus dated current evidence/provenance, source SHAs, identities,
expected/actual results, future procedures and gates. Dated superseding notes in
status/runbook/role/Support documents preserve every original report and failure.
The 23-file retirement correction set is 7113681; the earlier 39-file stabilization
set is be43f28. The 63-file implementation/print/
CLI16 follow-ups are 015e82e; the seven-file UI polish and its precommit history
entry are enclosed by d3fc517. These local counts are not the full 131-path PR.

### Decisions and validation

Historical counts remain 21 owner manual, 9 independent reads, 45 independent local,
27 deferred, 13 untested, 3 reproduced failures, 2 blocked. Latest statuses explicitly
close L11/F1,S04/F2,C11/F3 locally and O04’s code gate; P03 remains independently
blocked by unavailable Shop fixtures. Independent final 27f6abd evidence: nine CLI17
fault scenarios, two CLI lock-lifetime schedules, one literal-first-ALTER interruption,
four N2 probes and eight PG17 security groups PASS. N1 module/browser evidence
carries forward from 7b7de23; no new broad suite or hosted result is invented.
Only lightweight documentation consistency/link/count/commit/whitespace/confidentiality
checks are authorized here. Runtime tests are not repeated. Existing records’
Codex-only results remain author-attributed rather than newly independent passes.

### Deployment / DB impact and deferred

None. Owner employee journeys and independent state corroboration remain separate:
audit 306 records two legacy orphan Platform rows cleaned; old Auth absent, distinct
new Active identity and immutable archive retained; deletion policy last verified
false. Staging history 1–16;17 unapplied. Git development 0dbde676 differs from
canonical ad hoc Pages d3fc517. Eight employee bundles are present, but matching
new config/support corrections and provisioner D1 require separately approved rollout.
Freeze/drain, resolve uncertain jobs, serialize CLI17, inspect history/schema on
ambiguous exit, reconcile bundles/approve protected Support destination and accept
hosted workflows before use. Backup/Vault/Auth portability, provider/financial/Shop
and production gates remain. Existing fallback tag is Git-only and untouched.

### Git

Owner authorizes one documentation-only `[CF-Pages-Skip]` commit/push and coherent
existing PR #4 body update, preserving Draft/base/unmerged state and protected refs.
Exact resulting documentation SHA and provider skip are reported after verification;
this entry does not invent its own future commit SHA. No merge or production GO.


## 2026-10-17 — Hosted acceptance evidence and controlled development merge

Branch at preparation:`feature/platform-team-lifecycle-v2`;accepted/deployed source
`541c46d64e8489c3aacc0e44d87f7b81b1f3a7ab`;base development0dbde676.
Owner now conditionally authorizes normal GitHub PR4 merge,automatic staging Pages
verification and only then merged-branch cleanup. Production remains excluded.

Recorded27 owner UI/session passes,API01–API04 and CP01–CP03 owner-executed calls
independently evaluated by Work,and17 provider probes (14 scoped PASS,3 partial
Storage) with independent catalog provenance. Archived-only fixture:one client,
no active client or populated invoice acceptance;client creation declined,not passed.
Storage object/S3/URL and Realtime channel/event tests remain partial/untested.
Original120 scenarios,42 risk rows,original statuses/procedures and earlier results
are preserved;new scoped observations/status columns do not inflate full passes.

Codex read-only checks confirmed A06 Require current password when updating enabled
in the actual staging Dashboard Email provider (Save disabled,no mutation),all17
migration rows,permanent-deletion policyfalse,no open config jobs or protected Support
destinations,and live-session/cutoff/Active guards. Corrected config12/support5/
provision19 ACTIVE;all11 returned file entries match source including frozen artifact.
D1 source drift is resolved;no provisioning/Shop feature acceptance inferred.
Pages canonical manual deployment56fa2285 serves541c46d;Git development remains
premerge0dbde676. Build/env/public-key project claims target staging and Vite only.
No migration,function,Auth setting/account,Shop or Cloudflare setting changed.

New hosted acceptance report gives explicit historical MERGE-gate dispositions,
technical boundaries and retained before-use/production holds. A06 configuration
prerequisite is satisfied without silently marking its unexecuted password API
procedure PASS. Added original-request journal acknowledgment precision and bounded
migration17 operational RPC/status extension per independent documentation review.
Checks are documentation-only links/CSV/status/history preservation/sensitive data/
whitespace plus necessary hosted/Git/provider GETs;no runtime suite repeated.

Documentation commit/push uses CF skip. Mark ready/normal merge only after final
checks,without bypass or skip marker on merge;verify actual Pages revision/domain/
assets/staging backend before deleting merged feature branch. Preserve main,
deployment and fallback tag. Exact commit/merge/deployment/cleanup outcomes are
recorded in final verified report,not invented inside this precommit entry.


## 2026-10-18 — Verified customer Support v1 source implementation

Branch: feature/verified-customer-support-platform; base development
23a157a5c2aa581eec6e0f02b97318c784296e79. Coordinated Shop branch:
feature/verified-customer-support-shop, base f91f02819a9f2909062e36140f1775a870009115.

### Purpose and changed

Extend the existing Support Tickets administration and add independent verified
customer intake/read operations. New forward migration adds private credentials,
immutable requester provenance/events, atomic budgets, opaque ticket IDs, audited
revision-based resolution and the legacy integer resolver wrapper. Dedicated
platform-support-tickets revalidates a real Shop Auth token and actor-context RPC
against the registered project on every call. platform-support-enrollment requires
canonical live Master authority; managed preparation uses protected Vault recovery,
BYO accepts a locally generated credential hash, installation dispatch/acknowledgment
is audited and only an exact capability proof enables a key. Rotation/revocation
and permanent re-pair invalidation are separate from bridge/handoff credentials.
The existing page gains verified/legacy labels, category/history, customer-visible
resolution and pagination, with session/view stale-response fencing. Resolution
still refreshes existing dashboard data. No global redesign or existing Edge
Function modification was needed.

### Decisions and compatibility

Anonymous closure is prepared under supabase/staged-migrations, outside automatic
discovery, because all deployed historical senders are not inventoried. It is not
claimed deployed or closed. The accepted _shared/shop-release.json remains
unchanged; a separately generated, reproducible seven-function Support candidate
is staged under supabase/releases and requires explicit future promotion. Completed
Shop upgrades must not replay onboarding. Support capability is optional for
existing POS/bridge readiness. The privileged Master handoff, financial bridge,
canonical staff identity, existing migrations and unrelated worktrees are preserved.

### Validation

Final unit/handler/simulation set: 309/310 Platform and 99/100 Shop, retaining the
two independently recorded baseline failures (config-recovery fixture and accepted
release/runtime-preflight byte drift). New actual handler groups 8/8; Shop Support
client/renderer/package/installer groups 7/7; actual native PG17/GoTrue-schema/Vault
Support matrix across three databases 7/7, including concurrent duplicates, ACLs,
quotas, atomic audit rollback, scope/tenant/role/session boundaries, rotation,
managed recovery and staged closure. Existing PR4 security native groups 8/8.
Actual Support browser integrations for both products pass at 320/768/1440px;
existing login/Add Client six light/dark browser groups pass. Both builds pass;
built JS scan finds no privileged JWT/Support secret variable. All browser network
transports are synthetic/loopback, not hosted provider proof.

The broad native team runner timed out; an old handoff native fixture fails its
Master-approved-destination prerequisite identically on an archive of the unchanged
development base. Neither is relabeled passed. Full evidence, baseline distinctions
and pending provider/Deno/device gates are in docs/CUSTOMER_SUPPORT_VALIDATION.md.

### Deployment / Git

No hosted Supabase schema, secrets, functions, Auth, Shop pairing/provisioning,
customer data or Cloudflare resources changed. Owner CLI-2.120.0 runbook is in
docs/CUSTOMER_SUPPORT_DEPLOYMENT.md. Git delivery is authorized as a feature-only
CF-Pages-Skip commit/push and coordinated Draft PRs targeting development, unmerged.
Final SHAs and PR links are recorded by the delivery response/PR descriptions.
Real hosted cross-project/different-account BYO acceptance, release promotion and
legacy-sender compatibility remain before-use gates; no production-ready claim.


## 2026-10-18 — Coordinated BYO portability follow-up evidence

The paired Shop installer now supports a customer checkout without a sibling
Platform repository while retaining private-path/symlink exclusions. Its actual
copied-script regression passes; updated the shared validation ledger to 100/101
Shop cases, eight new Support groups, with the same baseline artifact-byte gate.
Platform source, SQL, functions and staged release bytes are unchanged by this
ledger update. Draft Platform PR #5 / Shop PR #1 target development and remain
unmerged. Both first feature pushes were independently confirmed skipped by
Cloudflare's commit_message rule; no deployment/configuration or hosted Supabase
mutation occurred. Final follow-up SHAs belong in the PR/delivery report.


## 2026-10-19 — Verified customer Support stabilization and independent regression review

Branch: feature/verified-customer-support-platform

### Purpose and changes

Correct confirmed Support compatibility/state defects and independently close the
previous local validation gaps, updating the existing Draft PRs only. Both shared
protocols remove the unsupported 3660-second remaining JWT ceiling, add exact
issuer/authenticated-audience/UUID checks, and retain real Auth plus live canonical
actor verification. Shop's final identity/generation check now follows asynchronous
error parsing, preventing a late old HTTP 400 from erasing another account's retry.
The new unshipped Platform read RPC uses client-first shared locks; all writer
ordering, post-wait authorization and actor freshness checks remain.

Corrected stale recovery/handoff fixtures through verified read-back and canonical
Master protected-destination approval, preserving historical migration-cutoff
contracts. Production recovery/handoff/POS/billing/provisioning sources and all old
migrations remain unchanged. Bounded native subgroup runners stream progress,
retain both output streams and avoid hidden test grandchildren. The accepted
release remains frozen; only the separate Support candidate was regenerated.

### Validation and decisions

Platform broad suite 312/312; Shop 101/102, retaining the preexisting accepted
artifact raw-byte equality gate. Exact drift is newline-only across three unchanged
Git blobs; promotion/fingerprint changes need a separate owner decision. New
handlers 10/10; Shop Support groups 9/9; native Support 10/10, including independent
read/create/revoke/re-pair/rotation/config/pricing/provisioning/resolution backends,
closure retention and real two-hour GoTrue/Auth/PostgREST verification. Existing
native groups total 32 passes across bounded historical/current runs; focused
privileged handoff passes. Both builds and actual Support browser integrations
pass at 320/768/1440px with synthetic loopback SDK transport. A local restart
interrupted some runs; only completed checks and targeted recoveries count.

### Deployment and remaining gates

No hosted Supabase/Cloudflare mutation or deployment. Same feature branches and
Draft PRs target development, unmerged, with CF-Pages-Skip delivery. Both contracts,
owner CLI-2.120.0 runbooks and validation ledgers describe runtime privilege trust,
precise snapshot/network freshness, protected hash material, optional capability,
manual baseline/pairing gates and staged anonymous closure. Local report:
Support ticket/implementation-evidence/STABILIZATION_REPORT.md. Conditional GO for
owner-controlled additive development deployment after exact dry-run/prerequisites;
customer use and production remain blocked on real hosted managed/BYO/Auth/gateway,
deployed-sender inventory and explicit release/closure/acceptance decisions.

## 2026-10-19 — Final Support integration and staged automatic enrollment

Preserved the accepted 32-migration/6-function package and prior Support-v1
candidate. Added an inactive Support-v2 package (34/7; internal SHA-256
144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414), explicit local
promotion, per-job immutable release pins, and a post-base-job managed Support
journal. Current live Master authority, completed base work, active pairing,
confirmed active owner and completed onboarding precede enrollment. Automatic work
uses a stable UUID/Vault secret and exact readiness/nonce proof. Existing enabled
credentials are adopted without rotation. Optional failures cannot keep the base
POS job open. Shared manual/automatic dispatch fences include historical unknown
writes (even revoked keys); provider completion requires explicit audited Master
review. No lease expiry assumes a remote write was cancelled.

BYO now has full/additive customer-CLI migration/function installation and a
customer-local secret/hash handoff. Master uses the signed-in Platform file flow;
customer privileged authority and plaintext stay local. Support controls use
existing branding, status badges, button/focus tokens and responsive layouts.
Explicit-public-input builds and compiled target/asset verification address stale
local Vite bundles. Owner reported successful manual Client 2 tickets/resolution;
this is historical evidence, not proof of the new automatic or BYO path.

Local validation: Platform 320/320, Shop 105/106 (frozen byte gate retained), 13
native PG17/Auth/Vault Support groups, canonical bootstrap subgroup, actual
entry/router/browser/visual checks, Deno checks and provider ESZIP bundles.
Focused docs: docs/SUPPORT_AUTOMATION.md. Exact commands, final SHAs and evidence:
Support ticket/implementation-evidence/SUPPORT_AUTOMATION_FINAL_HANDOFF.md.
No hosted mutation/deploy/reset, release promotion, anonymous closure or merge.
Existing coordinated feature branches/Draft PRs target development with CF skip.
Owner must approve promotion/deployments, test a fresh managed Shop, then a
separate-account BYO Shop, and decide legacy closure independently.

## 2026-10-20 — Local BYO reliability and Paper Supply communication

Continued on `feature/verified-customer-support-platform` at ba13837, with Draft
PR5/head verified against GitHub. The owner's later Support-v2 promotion supersedes
the preceding entry's inactive status; this pass leaves that pointer and all three
earlier artifact byte checksums unchanged. No local commit, push, merge, hosted
query/write, deployment or production cutover was authorized or performed.

Managed setup now revalidates exact source/prefix even for passed aggregate stages,
checks duplicate source under the migration lock, and rejects a fresh completion
timestamp before pairing/secrets. Native full frozen 34-entry runs succeed; a
pre-existing Auth identity reproduces the timestamp/reservation error locally.
Client3's actual pre-correction trigger remains unproven. No automatic reset or
applied SQL rewrite is justified. The Shop forward diagnostic does not mutate owners.

Complete BYO Setup now points to the customer-local guided installer. CLI authority
and private settings stay customer-side; Platform receives the existing public
target/hash handoff. Provider unknown writes are fenced and require explicit review.
Added independently reviewable Paper forward SQL, branded decision dialogs and
customer-visible message/expectation/history sync, retaining live role/session,
client/source/revision/terminal guards and existing billing/thermal/supply semantics.
Support-v3 is a new inactive, unregistered 36/7 candidate. Managed promotion requires
a separate registry/pin/automation review; no in-flight job is repinned.

Validation: six new native PG17/Auth groups, 13 existing native Support groups,
52 focused Platform groups, six guided groups, actual Paper/Support/Shop entry
browsers, affected Deno checks and both explicit clean builds passed. Broad Platform
was 320/321 followed by corrected real-SHA256 SQL subgroup 3/3; broad Shop 110/111
retains the historical frozen-source equality failure. Evidence and seven reports:
`Support ticket/implementation-evidence/stabilization-2026-10-20-byo-paper`.
Client3 hosted checkpoints remain owner-reported; Client4 hosted BYO acceptance,
candidate/target approval, Paper rollout and production cutover remain separate gates.

## 2026-10-20 — Approved GitHub review checkpoint

The owner explicitly authorized one stabilization commit and push to this existing
feature branch and its existing Draft PR. This is source-control backup/review only.
The staged scope is the completed implementation, forward migrations, scripts,
tests and repository documentation; private settings, pairing files, local journals,
temporary artifacts and the external evidence directory remain excluded.

No tests, builds, simulations or migrations were rerun for this checkpoint. Earlier
validation and its recorded limitations remain the evidence of execution. Commit
messages retain the Cloudflare Pages skip marker. PRs remain Draft/open; no merge,
hosted Supabase change, Cloudflare deployment, production change or Support-v3
promotion is authorized. The preceding entry describes the local stabilization
state before this later source-control authorization.

## 2026-10-21 — BYO guide, enrollment CORS and fresh-acceptance hardening

Branch: feature/verified-customer-support-platform.

The owner reported successful separate-account Client #4 hosted installation,
Support and Paper acceptance. That supersedes the earlier pending checkpoint;
this pass makes no independent new hosted claim. Preserved the owner's uncommitted
enrollment CORS hotfix and exact production/preview origins. Added early origin,
preflight method/header denial while retaining JWT, Auth and canonical Master/
session authorization, originless internal calls and allowed-origin error headers.

Expanded the on-screen BYO workflow to twelve complete stages, with context-bound
copyable commands, native customer CLI login, separate public/private inputs,
verified frontend build, Cloudflare routing/hostname/Auth redirects, confirmed
owner/six steps, Support hash handoff and ticket/paper acceptance. The guide remains
available after onboarding. Readiness labels use existing backend observations;
backend preflight and private-setting presence explicitly do not prove CAPTCHA.

Validation: Platform regression 324/324; native PG17/Auth six groups including real
paper RPC identity/active/terminal/revision/client guards; actual guide and Shop
paper browser recovery/role isolation; exact copied-command walkthrough; affected
Deno check and both explicit public builds/compiled target digest checks passed.
Shop's inherited frozen-source gate was corrected to preserve frozen integrity
and verify the unchanged separate candidate; its five-group subset passed.

Evidence/reports are in the preserved Oct 20 folder's new hardening-2026-10-21
subfolder. No new migrations, Shop release rewrite, managed promotion, customer
credential/journal modification, hosted mutation, deployment, commit or push.
Fresh hosted acceptance and any deployment remain separate owner gates.

## 2026-10-21 — Coordinated client and BYO wizards review checkpoint

Branch: feature/verified-customer-support-platform; starting HEAD 974d011b0501.

Replaced the long BYO modal with twelve navigable stages, explicit installation
mode review, retained commands/templates, blocked recovery, recorded observations
and Resume BYO Setup. A new forward migration adds private client/project/binding
progress with live Master/session authorization, revisions, row locks and audit.
Operator acknowledgments cannot manufacture verified customer infrastructure.
The local installer journal remains separate; no private customer file is accepted.

Converted the original five Add Client sections into a validated Back/Next/review
wizard with session-scoped drafts. An idempotent canonical creation wrapper binds
request UUID, operator and payload, so concurrent retries reconcile one client.
Unknown outcomes lock original fields; editing reviewed fields requires review
again. Existing plans, billing, Inventory, Paper and owner/provisioning rules remain.
Platform-only file-picker, lifecycle and technical/public-environment spacing use
existing design tokens. Shop visuals and frozen release artifacts remain unchanged.

Validation: complete local Platform unit/in-process suite 326/326 and Shop 122/122;
focused native PG17/Auth eight groups and actual browser wizard walkthrough passed.
Final-commit native/browser/build results and sanitized commands are recorded in
the external coordinated-wizards-2026-10-21 evidence directory. Compatible public
transitive patches applied; Vite5/esbuild findings remain pending a separately
reviewed major upgrade. No hosted acceptance is inferred from fixtures.

Final review additionally releases a departed in-flight client draft for original
request reconciliation, preserves full form values, tests another authorized
session and pairing changes, and repairs historical browser fixture pin/stub/popup
races. The older onboarding harness now isolates financial projection fixtures
from persisted owner-onboarding state. These are test harness corrections, not
changes to the financial core. Earlier failed attempts remain in external evidence.
The current Manager fixture uses canonical client RPCs and retains raw read/write,
pricing and owner denial assertions, matching the existing role-isolation migration.
It is separate from the historical bootstrap fixture, whose earlier migration
cutoff deliberately tests the older contract.

Owner authorizes commit/push to existing Draft PR5 against development only. Every
new commit uses the historical, documented [CF-Pages-Skip] prefix. Current provider
skip confirmation is pending unavailable connector/browser access. No deployment,
hosted DB/Auth/Vault/DNS change, customer install, managed promotion or merge.
The new Platform migration remains unapplied hosted; rollout order is documented
in docs/COORDINATED_SETUP_WIZARDS.md. Previous evidence remains preserved.

## 2026-10-22 — Practical BYO instructions and read-only Paper refresh

Branch: feature/verified-customer-support-platform; starting HEAD 84c5e970ae34.

Real onboarding exposed that sequential technical paragraphs still needed external
interpretation. All twelve stages now use structured objectives, locations,
prerequisites, numbered tasks, explained commands, expected results and specific
recovery. New-terminal folder restoration is explicit; routine status is separate
from provider continuation. Owner/core, optional Support/ticket UUID and Paper
acceptance remain distinct from recorded backend observations and manual marks.
Problem reporting is expandable with understandable fixed categories. Existing
server authorization, revision, stage persistence and audit contracts are unchanged.

Support enrollment fields align with field-local help and responsive stacking.
Paper Requests / Deliveries gains Refresh paper status using the existing client
loader with automatic managed Support reconciliation disabled. Context/generation
guards reject departed responses; overlapping reads are blocked. The latest
delivery draft survives refresh/failure, including an explicit review warning when
its selected request is no longer active. Refresh never forces Shop sync or writes.

Validation: one mocked on-screen CLI walkthrough, the focused --refinement-only
browser path, visual inspection at desktop/light and mobile/dark, changed-JS syntax
and scope/credential/whitespace review. No full suites, Shop tests or database tests.
Local fixtures do not establish hosted acceptance. Owner-reported working Client1
flows supersede earlier pending-hosted notes without being retested here.

No migration, Edge, Shop, release, customer-private file or hosted configuration
change. Commit/push to existing Draft PR5 is authorized with [CF-Pages-Skip]; exact
SHA, push, PR and provider skip proof are recorded in the single external correction
report. No deployment or merge; previous evidence remains preserved.

## 2026-10-22 — PAPER-UX-009 confirmed delivery feedback

Branch: feature/verified-customer-support-platform; starting HEAD 4decbd54dce8.

Future delivery timestamps previously reached authoritative database validation,
whose Error became a generic persistent toast. Success had no notification, so an
earlier error could remain visible after a later successful write. This is a
verified code path, not a conclusive attribution of the reported second notice.

Added frontend local-time/calendar/future and quantity/reference validation,
actionable inline feedback, submitting/overlap protection and explicit success.
Acknowledged writes stay successful if their follow-up history read fails.
Uncertain writes reconcile the exact original delivery ID/payload against authorized
records; absent bounded history is not proof of failure. Check original delivery
is read-only; unchanged retries retain UUID/payload across reload. Stale/fulfilled
and conflicting records remain reviewable without creating another supply entry.
Known transactional input rejections allow correction. Payment retry defaults are
unchanged; only delivery opts into retaining rejected receipts for reconciliation.

Validation: the existing browser fixture's delivery-only path covers invalid/future
local time, success/read failure, overlap, lost response, reload/same-UUID retry,
stale/already fulfilled and safe messages. Changed frontend syntax and diff/scope
review complete this narrow check. No full suites or hosted mutation tests.

No Shop, migration, Edge, metering or business-rule change; no backend deployment
required. Authorized feature-only commit/push uses [CF-Pages-Skip]; final SHA and
provider confirmation are recorded in the external PAPER_UX_009_2026-10-22 report.
PR5 remains Draft for development; no merge or deployment is authorized.

## 2026-10-22 — Final coordinated release parity, routes and support consent
Branch: feature/verified-customer-support-platform

### Purpose / changed
Complete final Managed/BYO parity and remaining frontend/security corrections.
Authorized client-detail and Historical URLs survive refresh/Back/Forward after
canonical identity/data load; role/session/selection fences protect late responses.
Public Shop export requires exact URL and matching unexpired anon JWT plus a valid
public widget key. Guided fresh setup references 37 migrations; existing Shops use
the dedicated additive upgrader rather than SQL-only installation.

### Release / security decisions
Built NEW immutable support-v4 only after completed Shop backend commit 089fd787.
The package has 37 migrations/7 functions, SHA-256
f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f.
Updated active pointer, registry (retaining v1/v2/v3), promotion catalog, forward SQL
allowlist and optional reconciler together. Existing job pins never silently move;
missing packages fail closed. New forward SQL and platform-support gate require
separate owner/case/purpose consent before Managed-only, single-use Master handoff.
Shop binds one actual session, checks trusted expiry/revoke, and exposes owner
history. It does not infer approval from a ticket or claim GoTrue sign-out/cached
data erasure. Old unconsented grants are denied; BYO handoff remains prohibited.

Prepared guarded anonymous-intake closure outside automatic migrations. Current
authenticated sender is source-compatible, but installed historical sender
compatibility is unverified: closure is unapplied and remains a release blocker.

### Validation / deployment impact
Two focused Platform tests, local route browser fixture, explicit synthetic-public
build and changed Edge Deno typechecks passed. Targeted PG17 checks passed for both
forward chains, existing-v2 owner/data/credential preservation, consent authority,
idempotency/binding/expiry/revoke, issuance/exchange, final exact catalog and immutable
pins, and guarded table/column/sequence closure. Final package/source parity checked
against committed Shop blobs; prior packages unchanged. No broad suite or hosted
mutation. Detailed scope/results: docs/Release-parity-acceptance.md.

Owner must authorize forward Platform SQL, platform-provision/platform-support,
Shop missing SQL/all seven functions, and both frontend deployments in documented
order. Existing custom Data API hooks require reviewed composition. Fresh separate
Managed/BYO acceptance, hosted revocation/provider recovery, installed-sender gate
and final security review remain. No merge/production approval. Source commits use
[CF-Pages-Skip]; actual post-push provider records belong in external evidence.
See Release-parity.md, Existing-shop-upgrade.md, Release-rollout.md and the issue
register. Previous evidence and history remain intact.

## 2026-10-22 — Guarded empty-development anonymous Support closure
Branch: feature/verified-customer-support-platform

Owner confirmed development project ukbhyerxshteyetwomqy has no clients, Support
tickets, provisioning jobs or Managed release pins and approved this narrow
closure. Supabase CLI 2.120.0 generated
20261022184736_close_empty_dev_anonymous_support.sql. It locks those four tables,
rechecks emptiness before transaction-local compatibility approval, then preserves
the staged table/column/sequence revocations, legacy policy removal and final
privilege/policy verification guard. A changed precondition or remaining effective
grant aborts the entire transaction. No data deletion or authenticated grant change.

Focused in-memory PostgreSQL execution passed exact SQL/PLpgSQL syntax and commit,
nonempty refusal, rollback on inherited residual permission, successful closure,
authenticated-grant preservation and transaction-local approval expiry. SQL review
followed PostgreSQL REVOKE and explicit-locking documentation. Diff/scope review
only; no full suites, Docker, browser, hosted SQL or deployment. Previous migrations,
Support-v4 artifacts/fingerprints, frontend, Edge Functions and Shop are untouched.
Feature-only commit/push uses [CF-Pages-Skip]; PR5 remains Draft against development.
The owner must review the one-migration dry-run and separately apply/verify it.

## 2026-10-23 — Authoritative Support navigation and selective refreshes
Branch: feature/verified-customer-support-platform

### Changed / why
Direct /support could render raw aggregate tickets without verified context or
revision, while Resolve silently searched a different paginated list. All Support
entry paths now share the authorized page loader; raw tickets never render.
Revision-bearing actions reject missing/stale records, prevent overlap, retain
attempted resolution text, and require refresh after conflicts/uncertain outcomes.
Confirmed resolution refreshes only the current page and dashboard count. The
aggregate uses a bounded count instead of loading the entire raw Support table.
Client Refresh status reads the selected client/authorized client projection and
four status RPCs without unrelated ledgers or automatic enrollment writes. Normal
client opening and provisioning retain their existing optional Support lifecycle.

### Evidence / validation
Read relevant prior external reports and orchestration/browser logs before edits.
New read-only hosted logs independently confirm HTTP546 at 150840ms and the
migration/function checkpoints before later successful same-request recovery.
The existing single-invocation chain has no cumulative deadline. A safe bounded
continuation requires trusted pause/ownership semantics; the failure RPC invalidates
health and cannot be reused as an ordinary pause. Concrete plan and remaining risk:
docs/MANAGED_PROVISIONING_TIMEOUT.md. No orchestration workaround was introduced.

Four focused Support/loading tests, three existing rendering/route checks, the
single Support browser fixture (direct/reload/history/sidebar/pagination and both
operator roles), syntax and explicit synthetic-public build passed. Controlled
8ms upstream-delay comparison: resolution 15→3 requests (77.18→31.12ms), Master
status refresh 17→5 (62.40→30.88ms). Fixture timings are not hosted speedup claims.
Broader financial/team loading and session validation remain; no stale-permission
or financial cache was introduced. External evidence holds concise measurements.

### Deployment / Git
Frontend deployment only. No SQL, Edge, Shop, installed customer data, immutable
support-v4 package/fingerprint, selector or pinned job changed. Managed timeout
remains open pending the separately reviewed orchestration change and acceptance.
Commit/push to existing PR5 uses no skip marker so configured feature preview may
build. No manual deployment or merge; PR remains Draft against development.


## 2026-10-23 — On-demand resources and bounded Managed continuations
Branch: feature/verified-customer-support-platform

### Purpose / changed
The broad loader fetched unused ledgers/team data and repeated identity checks.
It now reads the current route through a canonical authorized RPC: bounded/searchable
client cards, exact client details, deferred history/usage, complete explicit
invoice reads and on-demand Team. Overview uses global SQL summaries; page estimates
are labelled and latest invoice status is separate from bounded history. Authority,
view/client generations and request counters reject departed responses. Resource
failures retain a retry view. Existing Support resolution remains page/count-only;
navigation adds no enrollment side effects. No permission/financial cache was added.

The previous Managed 150840ms failure arose from cumulative work without a total
deadline. A CLI-generated forward migration adds durable paused state, invocation/
session fencing and dispatch uncertainty. Existing stage, onboarding, pin and
operation checks sit behind the fence, including legacy v1 entry points. Only the
current live Master invocation advances work. Pauses preserve connection health;
completion requires its verified final stage. Unknown writes cannot pause or be
closed away. Exceptional operator attestation keeps a ten-minute delay even after
transport failure and is audited as operator-reported.

The Edge handler budgets 85 seconds from entry, bounds requests by remaining time,
limits leaf units and isolates owner/preflight. Browser continuation awaits each
pause, preserves original UUID/params/pin, stops on uncertain/departed responses and
offers reload-safe Continue. Turnstile stays in submit memory only; original-secret
re-entry is needed if its stage remains pending. Lost migration replies require
exact ledger/source read-back; other unknown writes require provider review. No
automatic stealing, write replay or worker loop was introduced.

### Validation / integrity
Eleven focused source/Support checks passed: actual engine multi-pause completion,
no replay, lost migration/secret replies and serial frontend submission. Owned PG17
checks cover the forward chain, concurrent row ownership, stale/unfenced denial,
health-preserving pause, recovery delay and scoped roles. Local Support/route
browser, Edge typecheck, explicit synthetic-public build, syntax/diff and exact
committed-source release parity passed. Controlled route fixture: 13→1 requests,
400817→5947 JSON bytes, 52.85→13.45ms at 8ms upstream delay; not hosted latency claims.
Prior evidence is preserved in the external workspace.

Read-only hosted checks confirm protected Master binding and 20 Vault records.
No hosted writes, resets, SQL/Edge rollout or production deployment occurred.
SQL then platform-provision then frontend rollout/fresh hosted acceptance remain.
Managed/BYO share unchanged support-v4 packages/gateways/selectors/fingerprint;
new invocation state is Platform-only. Shop source, older releases and original
pins are untouched. Existing feature PRs stay Draft/Open against development.
The frontend commit allows automatic preview without CF skip. See
ON_DEMAND_RESOURCES.md and MANAGED_PROVISIONING_TIMEOUT.md in docs/.

## 2026-10-23 — Automated release parity, read-only fleet evidence and durable recovery
Branch: feature/verified-customer-support-platform

### Purpose / changes
Shared backend approval now requires an executable requirement contract rather
than matching counts. The canonical gate checks exact committed Shop SQL/function
bytes, hashes/order, dependencies, gateways, selectors/catalogs and both real
installer plans. Both repositories expose release:check and focused Actions checks;
the complete mandatory parity policy was added to Shop without removing its rules.
Accepted historical packages are anchored to starting commit c9bb36e, because
legacy v1 had earlier revisions; new immutable artifacts are anchored to their
first commit. No accepted artifact or original job pin was rewritten.

The new Platform forward migration 20261023012318 adds scoped inventory snapshots,
live Master/session/invocation/target fencing, policy metadata and authoritative
financial receipt lookup. New platform-backend-inventory performs bounded read-only
Managed provider/restricted paired Bridge inspection. The client-detail panel loads
only on demand, distinguishes historical pins, evidence age, compliance and runtime
health, and never upgrades or suspends. Partial structural/ledger evidence does not
prove current deployed source; full-release status remains Unable to verify when
those bytes cannot be established. BYO has restricted/customer-local diagnostics,
without granting Platform administrative access.

Existing usage outbox, billing revisions and config journals remain authoritative.
Shop adds private durable Support submissions, original-actor recovery, lease-fenced
ACK/backoff/review and explicit pending receipts; Platform receiver dedupe/consent
is preserved. Legacy pages receive retryable errors for uncertain delivery to retain
their original UUID. Financial retries read the authoritative original receipt first.

### Final release / validation
Corrected Shop backend source 95448d75b7c78fbe5e7cf0e9a02f87e7d919650d was committed before
building NEW support-v6: 38 migrations / 7 functions, canonical SHA-256
64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31.
Both fresh selectors reference it. The earlier local v5 candidate remains immutable
and uninstalled, superseded after the final compatibility correction. V4 and older
accepted releases/pins are preserved; no customer is automatically upgraded.

Nine focused source/contract cases and four bounded Managed engine checks passed.
The gate rejects seven deliberate divergence cases. Owned isolated PG17 databases
verify both forward chains, final catalog, concurrent Support dedupe, durable queue
ACL/actor/restart/lease/ACK recovery, usage replay, actual invoice/payment idempotency
and receipt read-back, inventory ownership/rate fencing. Changed Edge entrypoints
typecheck; both explicit synthetic-public frontend builds and syntax/diff checks
pass. Full/manual hosted acceptance is intentionally deferred. Detailed results,
final Git/CI/preview observations are in new external release-parity-fleet-continuity
evidence; previous evidence remains untouched.

### Hosted boundary / rollout
Read-only inspection confirmed existing Platform migration 20261022235702 and
platform-provision v25, protected Master binding and 20 Vault rows. Nothing was
reinstalled. New Platform SQL → inventory function/coordinated provision registry →
compatible frontend rollout is pending. Shop missing forward SQL must precede
changed Bridge/Support packages and matching UI, under customer authorization.
No hosted writes, customer upgrade, Auth/Vault change, manual Cloudflare deployment,
production promotion or merge occurred. Original live authorization is needed to
resume queued Support; offline-first and global exactly-once are not claimed.
Both existing feature PRs remain Draft/Open against development.

## 2026-10-23 — Controlled Managed/BYO upgrade execution and final acceptance boundaries
Branch: feature/verified-customer-support-platform

### Changes / decisions
Added CLI-generated forward migration20261023141809 and platform-upgrade, with a
private RLS upgrade journal, exact source/target/plan approval, canonical live Master
and session checks, client-bound invocation fencing, ordered checkpoints and audited
unknown-outcome reconciliation. Both modes now share the same Platform pending-job
fence and executable plan/engine. Provisioning/unknown invocations, owner/bootstrap
and pending config block execution; reverse-direction client-row guards prevent
new reservations from racing an approved upgrade. No old job/pin is rewritten.
The v4→v6 plan changes only one missing migration and Bridge/Support packages.

Managed review uses bounded read-only provider evidence; execution permits two writes
per bounded invocation and pauses serially. Source gaps need explicit operator review;
maintenance requires a real window and separately recorded acknowledgment. No email
delivery was invented. The on-demand UI adds plan/approval/progress/recovery and
downloads no upgrade code until requested. Its9.69kB chunk is separate from the
496.23kB main build. These are build sizes, not hosted performance measurements.

BYO obtains a private expiring request/plan-scoped clearance after Master review and
separate customer CLI approval. Customer admin authority stays local. Reports cannot
be promoted to independent provider proof: final component reports remain
verification_required, with customer-reported/provider-read-back strength separated.
Explicit reviewed closure preserves full_source_verified=false. No fake full-source
complete/Up-to-date state is written. Current SQL is rechecked against the original
checkpoints before further writes; stale tokens/sessions or conflicting progress stop.

Historical v4 operational documents are labelled as checkpoints with current v6
guidance. Platform-only empty closure20261022184736 remains unchanged; a read-only
target preflight blocks populated-target replay, and a separate staged, locked,
owner-reviewed adoption template preserves tickets and all permission revocations.
No closure SQL is added to Shop packages or automatically repaired into a ledger.

### Verification / hosted boundary
Five focused source/CLI/UI cases, three existing directly affected Support/financial/
legacy-receipt cases, real isolated PG17 approval/ACL/pending/concurrent ownership/
session/recovery checks, populated closure preservation and one v4→v6 SQL upgrade
passed. The actual customer CLI fixture completes two serial invocations under its
original UUID; it also proves a blocked Platform claim causes zero provider writes.
Changed Edge typecheck, both explicit synthetic-public builds, syntax/diff and final
committed-source parity pass; the new shared upgrade helpers are gate-checked.

Read-only hosted checks confirm current migration20261023012318, provisionv26 and
inventoryv1, protected Master binding1/Vault20, populated Platform2clients/3tickets,
closed anonymous grants and no current pending provisioning/config. Managed test
ledger matches v4 exactly (37); seven functions/gateways and SQL owner/runtime checks
are present/ready, not full source/browser acceptance. Retrieved v26 has all20
referenced files and v6 package. Original bundler warning provenance remains pending
its exact deployment log; no missing dependency was observed or redeployed.

New SQL→platform-upgrade→compatible UI/tooling rollout is pending. Owner explicitly
kept independent fresh hosted Managed/BYO acceptance pending; BYO admin remains
unavailable. No hosted write/reset/customer upgrade/Auth/Vault change/production
promotion/merge. Support still needs the original user's live authorization. V6 and
all historical packages/fingerprints are unchanged. Existing feature PRs remain
Draft/Open/unmerged against development. External controlled-upgrades-stabilization
REPORT.md/CURRENT.md record exact Git/CI/Pages and remaining owner gates.
