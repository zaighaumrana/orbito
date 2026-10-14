# Platform team lifecycle — corrected PR #4 review and rollout gates

2026-10-12 (Asia/Karachi). This supersedes the 2026-10-11 recovery-email reactivation design. Its historical checkpoint remains in engineering history; its transport instructions are withdrawn. Owner confirmed that migration `20261010233446` has never been applied or manually executed on a hosted database. Only that unreleased migration is revised; the preceding twelve migrations are unchanged.

Historical local audit checkpoint: `fix/pr4-security-stabilization` at `a0dae0fc90332f9fc4a498823c1851c00c3f17b6`, then uncommitted. The complete 39-file correction set was subsequently committed and pushed as **`be43f28b3a2cea0b1d73b2b9611a96818bed810d`**. Current corrections continue on `feature/platform-team-lifecycle-v2`; their exact enclosing revision is Git/PR #4 HEAD. PR #4 remains Draft, open and unmerged, targeting `development`. Neither checkpoint establishes hosted validation.

## Final contracts

| State/action | Behavior |
| --- | --- |
| New invitation | Native `inviteUserByEmail`, one durable issuance reservation, genuinely new Pending identity. No automatic resend after uncertainty. |
| Pending setup | Verified UUID/session/email; SIGNED_IN/INITIAL_SESSION invitation callbacks; native caller password write succeeds before service-only acceptance. No ordinary authority while Pending. |
| Deactivate | Retain exact UUID/email/role/password. Commit Inactive, session cutoff and audit first; record provider dispatch, apply supported Auth ban and verify receipt. |
| Reactivate | Require completed reversible suspension and consistent original identity. Clear only recorded RetraSell-owned ban; restore former Active or Pending status and advance cutoff. No email/link/invitation/new account/password change. |
| Fresh access | Former Active employees use original password. Pre-cutoff sessions remain denied forever. A new native OTP recovery session may set a password but cannot gain normal authority after suspension; fresh password login is required. |
| Legacy Inactive | Unknown origin or missing/unlinked Auth stays review-required. Never adopt/create/delete by email. |
| Permanent deletion | Verified Master, approved continuity, current password, fresh CAPTCHA and acknowledgment. Durable revocation before exact-UUID Auth deletion. Archive/removal/final audit only after database-proven absence. |
| Archived | Immutable Master-only retained identity/dates/actor/request/reason. The identity is terminal; forward 15 permits explicit fresh onboarding of its email after verified absence. |

Canonical operator authority requires confirmed/nonanonymous/undeleted/unbanned Auth, valid bound Master/configuration, matching team email/role, live owned `auth.sessions`, session cutoff and no tombstone. Missing/malformed/expired/mismatched/removed sessions fail closed. Ordinary browsers cannot read Auth sessions or modify cutoffs/identity/operations. Existing RLS, RPCs and privileged Edge checks inherit this boundary.

Restrictive authenticated Storage/private Realtime policies overlay existing policies without granting new permissions. Managed RLS and supported policy-creation authority (owner authority or the loaded supautils allowlist) are prerequisites. Public buckets, anonymous/public channels and already-joined authorization caches need separate hosted inventory; this is not a claim of immediate transport disconnection. Current Platform source has no Realtime subscriptions.

Browser authority checks run every minute, on focus and when visible. Confirmed denial cancels dialogs, clears private state and returns to login with local logout. Network/ambiguous failures do not declare deactivation. Generation checks discard late authorization/config/client/username responses. JavaScript cannot erase previously copied/downloaded information.

## Native Auth gates

Ordinary password forms send `current_password` with the new password. Auth **Require current password** must be enabled and verified separately; frontend checks cannot stop a direct native API bypass. Invitation/recovery use verified caller sessions separately. Implicit native recovery uses OTP AMR; password-only sessions are denied by the setup handler. Query/URL flags alone never authorize setup.

Master verification uses an independent memory-only client, fresh CAPTCHA and local verifier logout. Real GoTrue tests prove multi-session original refresh before/during/after cleanup, repetition, slow cleanup and wrong-password isolation. Single-session mode rejects original refresh DURING verification; it can resume after cleanup, but a browser may already have discarded its session. Session-row existence alone does not prove provider-policy continuity.

The new database continuity policy defaults off and binds approval to the current Master UUID. Only trusted `postgres` can configure it with an audited reason. This does not configure Auth or prove safety. Rebinding invalidates approval. Deletion is denied before password grant/privileged client and at SQL reservation/dispatch until actual hosted continuity is verified. Username verification is also withheld while unapproved.

Public Forgot Password uses native Auth plus CAPTCHA and generic responses across success/provider failures, with neutral fresh-CAPTCHA guidance. Native `/auth/v1/recover` cannot reliably enforce an Inactive email-sending veto while retaining the built-in sender. Ban/canonical state block access; recovery cannot activate an Inactive row. No email veto is claimed.

Rejected third-party transport, Send Email Hook, custom recovery endpoint, reactivation proofs/rate tables/flags and unused wrapper are removed. Native invitation/recovery and required Shop support compatibility remain. No transport fallback or new secrets.

**Built-in shared delivery blocks general production onboarding:** Supabase documents restricted authorized recipients, shared rate limits and best-effort delivery. The selected built-in-only architecture cannot be described as reliable unrestricted production email. Resolve through a separate owner/provider decision; do not silently install another provider.

## Failure recovery and dependencies

Only the reservation winner dispatches Auth. Duplicate/conflicting requests cannot repeat writes or overwrite another worker's outcome. Required audit failures roll back associated SQL. Uncertain password updates stay restricted; saved-password retries can complete acceptance without another password write.

Delete checks Storage owner/owner_id, custom Auth FKs and team FKs at reservation and immediately before dispatch. Native Auth FK allowlist checks schema/table/owner/constraint/exact user_id column; extra custom FKs on managed tables are denied. Freeze relevant DDL and target writes during destructive work: no transaction spans the remote Auth HTTP call.

Ban/unban is not a provider compare-and-set API. Independent/changed bans block Reactivate; concurrent dashboard/provider changes must be frozen. Failure/uncertainty keeps Inactive and an audited review-required request. Do not automatically reban/unban/resend/recreate/redelete. Trusted recovery must independently compare current Auth/SQL against recorded UUID/ban and approve a narrowly audited reconciliation before any correction. No public automatic reconciliation exists for ambiguous ban/unban.

Delete reconciliation rechecks the same durable request and UUID/email absence without repeating deletion. If Auth still exists or dependencies are unknown, stop. Never fabricate history or restore vulnerable handlers. Pinned GoTrue has no verified admin-UUID logout-all endpoint: ban blocks password/refresh while applied; SQL cutoff permanently protects retained session rows. No forged employee JWT or manual production Auth-session deletion.

## 2026-10-14 — Forward 15 retirement, fresh onboarding and invitation renewal

Current local base: `357775fd563eb1df8abc74326de61ec9d2ce0f25`, clean before this
correction. PR #4 remains Draft/unmerged. Read-only staging checks found fourteen
genuine migrations, continuity approval **disabled**, two legacy mapped Auth UUIDs
absent (with no replacement Auth identity at either email), and one Pending
employee with a matching confirmed Auth identity, a recorded sign-in and no open
lifecycle operation. Auth confirmation/sign-in does not prove Platform onboarding.
These are sanitized metadata findings, not approval to change any account.

The disabled policy causes a definite pre-operation HTTP 503. There are no deletion
operations for the three inspected records. The server now returns an explicit
sanitized `deletion_disabled` code with `review_required=false`; the frontend
distinguishes password/CAPTCHA/session/identity rejections. An error after a durable
operation still reports uncertainty and preserves the same-request reconciliation.
The continuity gate stays disabled; successful login or a second tab cannot enable it.

`20261013214541_platform_team_retirement_reonboarding.sql` is a new forward
migration. All fourteen preceding migrations remain immutable. Employee IDs and
archived Auth UUIDs stay unique/terminal; only archive email uniqueness becomes a
history lookup index. Add User explicitly confirms the latest retired predecessor.
The server independently checks that predecessor and absence of previous Auth
identities before reserving a fresh employee UUID. Live-email/UUID uniqueness and
open-operation constraints prevent duplicate/concurrent onboarding and cleanup.
An immutable audit entry records the predecessor; old archives are never edited.

New invitations carry a private reservation nonce into native Auth metadata.
Binding requires that exact nonce, fresh creation/invitation timestamps and a UUID
absent from retirement history. Metadata alone grants no role. This prevents the
native invite API's existing-unconfirmed-user behavior from adopting another
identity. Unknown invite outcomes remain reserved/review-required, never resent
or adopted automatically. Unrelated/mismatched Auth identities block deletion;
verified dangling/NULL mappings may be retired without an Auth delete call.

The Pending status popup now offers **Resend invitation**. Its new JWT-protected
`resend-platform-invitation` endpoint independently requires live Master authority,
a matching Pending Auth UUID, no conflicting operation and a one-minute cooldown.
Unconfirmed identities receive a renewed native invitation; confirmed Pending
identities receive native recovery for the same Set New Password screen. Both keep
the existing UUID, role and Pending status until normal verified password setup.
The server records reservation/dispatch/final audit; duplicate or uncertain requests
cannot dispatch another email. In-progress/uncertain setup or resend requires
operator reconciliation, not automatic cancellation. Provider acceptance is not
proof of delivery. No third-party sender, new secret or separate reset button exists.

The permanent deletion dialog alone ignores backdrop clicks, preserves inputs and
requires explicit Cancel/Escape or a valid single confirmation. Close/logout still
cleans Turnstile and restores focus. Other dialog dismissal behavior is preserved.

Exact local correction manifest (18 files; unstaged, not committed or pushed):

- Frontend: `src/dialogs.js`, `src/events.js`, `src/forms.js`,
  `src/pages/settings.js`, new `src/team-errors.js`.
- Server/configuration: `supabase/functions/_shared/platform-team-v2.ts`,
  new `supabase/functions/resend-platform-invitation/index.ts`, `supabase/config.toml`.
- Forward migration: new
  `supabase/migrations/20261013214541_platform_team_retirement_reonboarding.sql`.
- Focused tests/runners: `tests/auth-provider-local.mjs`, `tests/dialogs.test.mjs`,
  `tests/frontend-races.test.mjs`, `tests/platform-team.test.mjs`,
  `tests/run-platform-team-local.mjs`, `tests/team-lifecycle-browser.mjs`,
  `tests/team-lifecycle-postgres.test.mjs`.
- Documentation: `ENGINEERING_HISTORY.md`, `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md`.

Focused PASS: 17 actual server-source regressions, two actual frontend-handler/error
cases, four dialog groups, four disposable PG17 lifecycle/rollback/security groups,
one real GoTrue hard-delete/fresh-UUID/retired-link group and one real Chromium
dialog group (768px, dark, synthetic transport/CAPTCHA, no external page traffic).
Shared/new-handler Deno checks, JS syntax, synthetic Vite build and integrity pass.
Initial migration-anchor/DOM-fixture failures were corrected. SKIP: actual email
delivery, hosted CAPTCHA/continuity/endpoint acceptance, wall-clock link expiry,
other browser sizes/themes and unrelated full suites. No hosted mutation occurred.

### Ordered staging approval gate

1. Obtain independent source approval and separate checkpoint/deployment approval.
   Take a fresh recoverable backup, then freeze team/identity/provider changes and
   drain in-flight requests. Do not change the scheduler without separate approval.
2. Reconfirm staging project, reviewed SHA, fourteen genuine versions, exact Master
   binding, target mappings, dependencies and no unresolved operations. Run CLI
   2.120.0 dry run: **only forward 15**. Do not replay migrations 13/14.
3. After separate authorization, apply forward 15 transactionally and verify the
   genuine fifteenth history row, unchanged Master/roles/RLS/audit and immutable
   retirement records. Unexpected stored function definitions abort the migration.
4. While frozen, deploy reviewed `create-platform-user`, `delete-platform-user` and
   new `resend-platform-invitation`, all with JWT verification enabled. The create
   handler and forward 15 must be coordinated; old handlers cannot finalize new
   nonce-protected invitations. Confirm deployed source/origin/redirect configuration.
5. Separately deploy the matched staging frontend through the approved Cloudflare
   process; do not merge PR #4 or deploy production as part of this correction.
6. Prove actual original Master refresh during/after independent password verification
   and local verifier cleanup, including repetition and failure paths, under hosted
   Auth session policies and fresh CAPTCHA. Only then separately authorize the
   existing audited `configure_password_verification` call for the verified bound
   UUID. Never infer continuity from login alone or reset the Master password.
7. Authorize disposable-account acceptance first: renewal, expired/retired links,
   retirement, same-email fresh onboarding, role denials and original Master refresh.
   Only after that passes separately authorize cleanup of the three real obsolete
   employees. Verify each exact UUID/email absence/archive/audit before reinviting.

Before commit, a SQL failure rolls back forward 15; never repair history. After
commit, old email-embargo code is not a safe rollback once an email has been reused.
Keep writes frozen on a partial function/frontend rollout. Reconcile interrupted
deletion with the same request and verified Auth absence; do not repeat deletion.
For an uncertain invitation or resend, compare the exact operation, Auth metadata
and provider/audit evidence. A separately approved, narrowly audited trusted recovery
decision is required before releasing a reservation; no generic public SQL cleanup
or automatic provider replay is supplied. Auth deletion cannot be undone by source
rollback. Backup/provider portability and email delivery limitations still apply.

Local implementation only. No policy enablement, real user/email change, hosted
migration, deployment, commit/push or merge. Staging and production remain NO-GO.

## Ordered staging plan — all hosted steps require separate approval

1. Independently review the targeted correction commit on the existing PR #4 source branch. The prior Git checkpoint is published at `be43f28`; the owner has authorized this follow-up checkpoint only after deployment-trigger inspection. Use the verified `[CF-Pages-Skip]` prefix, push only the PR source and keep Draft. No merge/protected-branch update follows.
2. Verify reviewed commit, staging `ukbhyerxshteyetwomqy`, twelve genuine migration rows, original Master UUID/roles and verified fresh backup. Production `mincersddxuaqojczcih` is excluded. Freeze operator/team writes, provider changes and related DDL. Coordinate scheduler pause separately; do not change its cadence automatically.
3. Read-only execute `supabase/bootstrap/team-lifecycle-preflight.sql` with the reviewed private credential process. Check managed owner permissions/RLS, FK definitions, public resources and duplicate mappings. No ownership transfer/application-role grant shortcuts. Stop on differences.
4. Separately verify/approve native current-password enforcement, CAPTCHA, invitation/recovery redirect `https://orbito.ahwad.com/?reset=true`, expiry, recipient/rate eligibility and multi-session behavior. Verify rejected hook/recovery endpoints absent or explicitly disabled server-side if ever deployed; UI hiding is insufficient. None was hosted-verified here.
5. In the coordinated freeze, separately approve deploying the six reviewed team/setup handlers FIRST: create/update/delete/deactivate/reactivate-platform-user and platform-password-setup, all `verify_jwt=true`. Verify every active deployed source/dependency and staging origin secret. Before migration, the new handlers must fail closed because the required session/context/RPC contract is absent; perform only non-mutating rejection checks. Stop on partial replacement. This avoids leaving old handlers able to dispatch Auth writes after SQL privileges change. Confirm no old in-flight requests remain. Also replace the reviewed `platform-support` handler in this coordinated window: issuance now forwards the canonical Master session to the new service-only five-argument RPC and fails closed until migration 13 provides it. Preserve its existing `verify_jwt=false` mixed transport; issue independently verifies getUser plus canonical RPC, exchange requires the bound Shop credential. The other three non-team handlers are excluded; provisioning correction remains a separate deployment item. Do not leave the old four-argument handler active after migration.
6. Repeat CLI 2.120.0 dry run: ONLY `20261010233446`. Apply only after explicit migration approval through the reviewed credential-safe process, with managed-policy prerequisites satisfied. CLI owns SQL/history atomicity; no authored COMMIT or history repair. If migration fails, leave the replacement endpoints fail-closed and stop for recovery; never restore vulnerable handlers.
7. Verify thirteen genuine rows, retained data, privileges and Master/Manager/Billing boundaries. Only after actual continuity verification may trusted PostgreSQL execute `select platform_private.configure_password_verification(:'verified_master_uuid'::uuid,true,:'audited_reason');`. Supply the independently verified existing UUID; leave disabled if safety cannot be proven.
8. Separately authorize staging frontend and disposable hosted accounts/emails. Validate invitation/expiry/reuse, native wrong/current password API, repeated Master verification/refresh, Deactivate/Reactivate same UUID/original password, old access/refresh denial, Storage/private Realtime, role denials, archive and uncertain-operation recovery. No real employee destruction. Resume normal writes only after accepted validation.

SQL/history rollback before commit is locally tested. After committed migration/Auth mutations, reverting JavaScript or deleting a history row is not rollback. Recovery requires a reviewed restore/reconciliation plan; backup encryption/provider portability and waived rehearsal limitations remain.

Full findings, evidence, precise file manifest and production NO-GO: `docs/PRODUCTION_READINESS_REPORT.md`.

## 2026-10-12 — Independent-review correction contract

F1 is fixed in the owner-confirmed unapplied lifecycle migration, without editing any of the twelve applied migrations. Grant issuance stays service-only. Edge verifies the browser using getUser and canonical identity, then forwards the actual session_id, actor UUID, server-derived Platform ref and generated hash. The new five-argument SQL RPC independently verifies the bound confirmed active Master and that exact live owned session. Anonymous/authenticated cannot mint grants directly; the old four-argument RPC is revoked from all API roles. No user claims are fabricated. Exchange remains service-only and checks the recorded capability actor directly against protected UUID/configuration, confirmed active Auth and archive state. It does not fabricate JWTs or claim browser-session authority. Logout alone does not cancel an already issued 90-second capability; canonical disablement/rebinding does. Target/source/binding/lifecycle, hash-only persistence, expiry, single-use lock and audit stay intact. Existing Shop exchange contract/artifact is unchanged.

F2/F3 bind private continuations to authority generation, UUID, session, role, view, selected target and modal/operation context; detail loads additionally require current selection/request generations. Loading/failed/mismatched data cannot drive config writes. A cancelled UI continuation does not roll back an already committed server mutation; inspect durable status before explicit retry. No automatic resubmission is added. Native setup and support popup continuations are also cancelled after logout.

The read-only bootstrap diagnostic no longer fabricates a user subject/session. Verify platform_operator_identity using an actual signed-in Master JWT as a separate hosted smoke gate. SQL-only tests explicitly seed owned synthetic sessions and user claims; service exchange tests use only {role:service_role,iss:supabase}, with no user sub/session_id.

Inherited operator_read permits Manager/Billing shared financial/support/team/control-plane SELECT, consistent with the existing STAGING_TEAM_CUTOVER permission matrix. Hidden navigation is not confidentiality. Owner must explicitly accept this or authorize a separate forward per-table policy/loader change. Live role edits remove previous mutation authority immediately without a fresh-login cutoff; suspension/reactivation still impose the cutoff.

Current results and complete correction manifest are in PRODUCTION_READINESS_REPORT. Code is ready for independent re-review after the authorized source checkpoint; staging and production remain NO-GO pending that review and separately approved hosted preflight/journeys.

## 2026-10-13 — Role isolation supersedes shared reads

The owner has now authorized a separate forward role-isolation change. The prior
shared-read acceptance caveat and ONLY-13 deployment plan above are historical.
Migration 20261010233446 remains unchanged and read-only staging history confirms
it is absent. New 20261012231226 follows it; final history must have fourteen
genuine CLI records. Neither is applied by this local correction.

Manager retains required operational/support/summary access; Billing receives
minimum client identity and explicit financial fields. No raw team/support/
provider/audit leak through hidden navigation or indirect RPCs. Owner confirmed
Manager invoice summaries while View/print is Master/Billing-only. Exact matrix
and all indirect boundaries are in PLATFORM_ROLE_READ_ISOLATION.md. Live role
edits retain the session but clear old browser data on detection; permanent
Deactivate/Reactivate cutoffs and original UUID/email/password/no-email restore
remain unchanged. Native Supabase email architecture is preserved.

Only after independent review and separate hosted approval: current backup,
team and role preflight, verified managed owners/RLS/publication/custom surfaces,
freeze, reviewed handlers first, actual CLI dry run listing ONLY 13 then 14,
controlled migrations, structural/retained-data checks and matching frontend.
Old employee loaders intentionally cannot run against new raw SELECT RLS. Verify
actual role and account journeys before resuming. Failures stay contained; never
repair history or downgrade to insecure handlers. Native continuity/destructive
approval, mail/CAPTCHA, managed services, recovery/Vault/legal/Shop gates remain.
Keep PR #4 Draft; staging/production remain NO-GO.

## 2026-10-14 — Independent F1/F2/F3 correction checkpoint

The independent REPORT.md and both reproduction sources/logs were read before
application edits. The eighteen local files exactly matched the independently
reviewed ZIP; branch/base remain feature/platform-team-lifecycle-v2 / 357775f.
The review's FAIL verdict was investigated, not treated as independent approval.
Before correction, its two actual-handler/decoder reproductions demonstrated F1;
the requested eight-file test run reproduced 121 PASS / 2 FAIL (F2 and F3).
Those reproduction assertions demonstrated defects, not security passes.

### F1: invocation rejection never proves prior operation absence

The old catch override knew only the operation obtained in the current invocation.
Auth/session/password/continuity failures before that assignment could label a
previously dispatched deletion as never started. All deletion failures now retain
`review_required=true` and `operation_state="unverified"`. An explicit
`current_attempt_rejected=true` identifies a known pre-operation rejection of THIS
invocation only; late failures after a local reservation do not receive that marker.
Neither field claims the absence, unresolved stage or completion of a prior request.

No new durable lookup/RPC/permission is introduced: an early failed canonical session
or disabled continuity gate cannot safely establish historical state. Creating a
privileged client before that gate would violate the existing verification boundary.
Even an initial wrong-password/policy rejection therefore retains uncertainty about
possible earlier attempts. Tests separately verify zero operations/dispatches for
those controlled first-attempt fixtures. Completed deletion is reported only from
the existing exact-actor/request/target SQL reconciliation returning completed.

The decoder uses whitelisted static reasons and always retains the request/review
warning. It also handles old `review_required=false` responses conservatively; none
claims "No deletion started." Unknown, contradictory or unreadable responses remain
uncertain. No provider replay, authorization bypass, credential logging or operation
detail exposure is added. Existing UUID/session, password/CAPTCHA, durable revocation,
dependency/absence checks, audit and one-dispatch SQL remain intact.

Fourteen actual-handler/decoder regressions cover initial rejection, uncertain dispatch,
same-ID Auth/continuity/session/password/dependency/target failures, completed repeats,
different/mismatched requests, verified-absence reconciliation and legacy/error decoding.
The independent two-case reproductions were copied outside Git and changed to assert
the corrected behavior, preserving their originals. Both corrected cases pass. Real
SQL also denies conflicting target/actor/request attempts while preserving the original
dispatched stage. No duplicate deletion is observed in these controlled tests.

### F2: precise native-email guard and side-effect-free fixtures

The guard allows "Resend invitation" and native invite/recovery. It rejects actual
known provider SDK imports/dependencies/constructors, API domains, sender-specific
variables and rejected custom-hook/recovery endpoints. Deliberate SDK (including
remote/npm imports), API, environment and legacy-endpoint insertions are detected.
Inactive commented native Supabase SMTP examples are not runtime integration.

Reusable Auth/REST fixtures now live in tests/helpers/platform-team-fixture.mjs,
which imports no test runner and registers no tests. The canonical PostgreSQL test
imports that helper directly; its two groups no longer register the unit suite.
The helper's operation identity/open-operation/completion behavior was aligned with
the existing SQL for meaningful negative tests. A separate test imports it in a new
Node process and verifies no TAP/test registration. No production dependency changes.

### F3: realistic archive state without production fallback changes

The invitation fixture uses the real state initializer, then adds the loaded Master
archive/operation datasets. Actual forms are exercised for ordinary invitations,
latest normalized-email predecessor selection and explicit confirmation/cancellation,
live-email denial, stale predecessor rejection, unchanged archive history and unloaded
malformed data failing closed. Mocked server denials are distinguished from the real
SQL retirement/uniqueness checks. No production form/state fallback was added.

### Executed validation and evidence

Exact commands, exit statuses, timestamps and full outputs are preserved OUTSIDE Git
under Development/RetraSellReviewEvidence/2026-10-14-F1-F3. commands.jsonl is the command
ledger; source-integrity.json records the final manifest/hashes and protected refs.
Before/after reproduction sources and logs are retained. No totals below combine
overlapping selectors or mock tests with end-to-end journeys.

| Executed command/scope | Observed result |
|---|---|
| Requested eight-file `node --test` command from the task | 125/125 PASS, exit 0; original 123 plus provider-fixture isolation and archive cases. Final archive fixture refinement also rerun narrowly: 2/2 PASS. |
| `node --test tests/team-deletion-errors.test.mjs` | 14/14 PASS, exit 0; actual server/decoder with controlled transport/durable-state doubles. |
| Corrected independent two-case reproduction | 2/2 PASS, exit 0; overlaps the fourteen cases, not an additional distinct coverage claim. |
| `node tests/run-platform-team-local.mjs` | Final run: 23/23 PASS, exit 0 (6 bootstrap, 2 canonical, 11 lifecycle, 4 role/API groups); 534 seconds overall. No imported unit-test registrations. |
| `node tests/run-platform-team-local.mjs --retirement-only` | 4/4 PASS, exit 0; real PG17, migration failure rollback, resend and durable deletion/roles. Overlaps general runner. |
| `node tests/run-platform-team-local.mjs --reads-only` | 4/4 PASS, exit 0; real SQL/RLS and local signed-JWT PostgREST at migration-14 baseline. Overlaps general runner. |
| `node tests/auth-provider-local.mjs` | Six native GoTrue groups PASS, exit 0; synthetic accounts, password/refresh/ban/recovery/invite setup, forced expiry, single-session negative control. No SMTP. |
| `node tests/team-lifecycle-browser.mjs` | Six actual Chromium groups PASS, exit 0; 320/768/1440, light/dark, synthetic Auth/CAPTCHA and blocked external traffic. |
| Deno 2.4.5 `check --no-config --no-lock` | PASS, exit 0: shared team source plus create/delete/resend entrypoints. |
| Changed JS/MJS `node --check`; synthetic Vite 5.4.21 build | PASS, exit 0; private env loading disabled, synthetic values and temporary output only. |
| Whitespace/source/secret-format integrity | PASS: applied migrations 1–14 and frozen Shop match HEAD; forward 15 byte-identical to reviewed ZIP; no staged files/protected-ref changes. |

Transient validation failures were retained: two overly strict test-double/guard
conditions were corrected (new invitation fixture row and commented SMTP example).
The initial general runner passed six bootstrap plus two canonical groups, then its
existing 180-second child-process deadline killed the eleven-group lifecycle file.
Only that local file's deadline is now bounded at 480 seconds; Docker command deadlines,
assertions and test selection are unchanged. The complete rerun passed every group;
no test was skipped to pass the runner.
The initial synthetic build hit sandbox EPERM; the same synthetic helper passed with
local file access. Existing Node typeless/experimental and Vite CJS-helper warnings are
tooling warnings, not suppressed or represented as application failures.

SKIP/pending: actual SMTP acceptance/delivery, hosted original Master refresh/continuity,
real CAPTCHA/iframe accessibility, elapsed wall-clock expiry, hosted endpoint/journeys,
migration-15 CLI history-insert/connection-loss fault injection, and unrelated sibling-Shop
tests. Native forced expiry is tested, not elapsed wall-clock expiry. Existing independent
concurrency findings remain evidence, not a new rerun here. No hosted project was contacted.

The current local correction set is 23 files: the prior eighteen, plus modified
tests/platform-auth-dialogs.test.mjs and tests/platform-team-database.test.mjs, and new
tests/helpers/native-email-guard.mjs, tests/helpers/platform-team-fixture.mjs and
tests/team-deletion-errors.test.mjs. This checkpoint further changes shared team errors,
the decoder, affected tests and documentation; forward 15 remains unchanged.

Keep the preceding forward-15-only backup/freeze/dry-run/coordinated rollout and recovery
gates. Retain/reconcile pre-15 open create reservations before cutover; they lack nonce
receipts and cannot be blindly replayed. Original reviewed ZIP is preserved as prior
evidence and has not been updated to contain this checkpoint. No stage/commit/push,
PR modification/merge, policy enablement, scheduler/Shop/Cloudflare change, real email,
employee mutation or hosted SQL/deployment occurred. Fresh independent review is required;
this is not self-issued independent approval. Local corrections implemented and
validated. Ready for fresh independent review. No staging deployment authorized.
Staging and production remain NO-GO.
