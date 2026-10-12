# RetraSell Platform production readiness audit

2026-10-12, Asia/Karachi. **NO-GO for production or unreviewed staging rollout.**
The confirmed local defects described below are corrected and tested. Native Auth
configuration, email-delivery constraints, hosted access boundaries, coordinated
migration/deployment and separate Shop session work remain release gates. No hosted
validation, email, deployment or production change was performed by this audit.

## Repository and scope

- Isolated local branch: `fix/pr4-security-stabilization`.
- Reviewed audit base: `a0dae0fc90332f9fc4a498823c1851c00c3f17b6`.
- [PR #4](https://github.com/zaighaumrana/orbito/pull/4): Draft, open, unmerged;
  `feature/platform-team-lifecycle-v2` -> `development`; remote source unchanged.
- At the local audit checkpoint these corrections were uncommitted. The owner
  subsequently authorized a GitHub review checkpoint on 2026-10-12. The exact
  published revision is the latest PR #4 commit; production NO-GO is unchanged.
- Read-only remote refs remain: development `0dbde676ca57ed1599a295e221d274ef080cac41`,
  deployment `a43db6a2b5fc51f8f9039f156c6edcd6dbfeb519`, frozen main
  `5df274ae9e8c187cc39e2013185cdf205e776fb1`.
- Twelve historical migration Git blobs and committed Shop release artifact match
  HEAD. Frozen Shop checkout remains clean. No Shop edit/build/repackaging.

This was a repository-wide inventory and critical-path audit, with targeted source
tracing and negative/journey tests. It is not a blanket line-by-line certification
of every historical document or generated release payload. Frontend, all ten Edge
entrypoints/shared dependencies, full migration chain, operator RLS/RPC boundaries,
Auth/session handling, billing, provisioning, lifecycle, support and integration
contracts were inspected. Historical/deferred compatibility is preserved.

## Confirmed findings and fixes

| Finding | Correction/evidence |
| --- | --- |
| Ordinary password forms ignored current password | Both send `current_password`; missing/wrong values fail without success/logout. Native API enforcement reproduced with current-password setting enabled. Hosted setting still requires verification. |
| Old JWT could regain authority after Reactivate | Require live owned Auth session, valid status/UUID/email/role and permanent session cutoff. Reactivate advances cutoff; fresh password AMR required for ordinary access after suspension. Missing/malformed/wrong-owner/expired/removed/old sessions denied at real SQL boundary. |
| Reactivate contradicted final owner decision | Restore same original UUID/email/role/password, no email/link/invite/account replacement. Completed owned ban receipt required; independent/changed bans denied. Former Pending stays Pending. |
| Provider failure could be mistaken for full revocation/restoration | Durable SQL restriction/audit precedes HTTP dispatch. Verify provider receipt and final SQL state. Uncertain outcome stays restricted/review-required; duplicate dispatch cannot repeat external write. |
| Runtime deletion dependencies could change after installation | Check Storage ownership and Auth/team FKs at reservation and immediately before dispatch. Strict native managed-FK allowlist; custom FK even on a managed Auth table blocks. Archive/audit failures retain restricted review state. |
| Browser Auth validity did not establish Platform authority | Canonical status RPC every minute/focus/visibility; confirmed denial clears identity/private state, dialogs and local session. Network errors do not imply deactivation. |
| Late asynchronous responses could refill cleared state | Generation guards on authorization/config/client loads and username results; private loaders do not start when logged out. Logout clears/render-locks state before asynchronous local signout. |
| Fresh login conflicted with guarded data loading | Set authenticated state only after canonical identity, before protected loader; do not restore it after concurrent revocation. Login/alias regression verifies ordering. |
| Native implicit recovery AMR mismatch and post-suspension setup gap | Real GoTrue recovery emits eligible OTP AMR. Actual setup handler now accepts verified native OTP/recovery and rejects password-only grants. New recovery may set a password for Active but grants no ordinary post-suspension authority until password login; cannot activate Inactive. |
| Independent Master password grant can interrupt original session | Actual single-session mode rejects original refresh during verification. Default-off, current-Master-bound audited continuity approval blocks deletion before password grant/service construction and at SQL reservation/dispatch. Frontend alias verification withheld until approved. |
| Public recovery disclosed account-specific state | Generic native responses across success/errors, neutral CAPTCHA guidance. Native email-veto limitation documented explicitly. |
| Stored HTML injection in Support Tickets | Escape subject/message/client/status/filter/IDs; permit credential-free HTTP(S) links only with noopener/noreferrer. Malicious markup, attribute injection and javascript links are regression-tested. |
| Provisioning failed native Deno checking | Explicit `never` function enables target narrowing; compare actual read-back Shop binding against server context rather than nonexistent call-credential binding. Missing credential/mismatched binding stop before writes; protected activation/rotation digests unchanged. |
| Fixed migration hashes depended on CRLF checkout | Canonicalize newline representation while retaining original fixed digests; explicit substantive-SQL mutation negative check. Historical migrations unchanged. |

The provisioning change is a type/contract correction; the earlier optional
credential-binding comparison was effectively a no-op, not evidence that every
existing verification failed at runtime. No credentials or Shop contracts changed.

## Legacy cleanup and retained compatibility

Removed rejected custom Send Email Hook/recovery endpoint, Resend requests/secrets,
reactivation proof/rate/context SQL, transport tests and their unreachable lock
entries. Removed the unused two-line shared compatibility reexport and obsolete
browser recovery messaging/empty plaintext-password config placeholder. Runtime
search and frozen Deno dependency checks confirm no rejected transport remains.

Retained native invitation, supported recovery, Pending password-step retry states,
immutable audit/archive history, source/call credential separation, scheduler
authentication/cadence and intentional legacy Shop support provisioning settings.
`waiting_password` is still used for a confirmed failed Pending password attempt;
it is not a retained employee-reactivation workflow. No speculative mass rename,
dependency upgrade, UI redesign, legal/publication or environment change.

## Critical-path audit evidence

| Area | Result and practical limit |
| --- | --- |
| Team create/edit/onboarding | Canonical confirmed Master rechecks precede service writes; stable request/target IDs, durable issuance, native invitation and checked acceptance. Real local native invite link -> actual handler -> password write -> Active -> assigned-role login succeeds. No inbox delivery tested. |
| Team authorization/deletion | Manager/Billing/forged roles/unconfirmed actors denied; Master protected; archive immutable; uncertainty cannot blindly redelete; concurrency has one reservation winner. Runtime dependencies, stale sessions and grants tested in PostgreSQL 17. |
| Billing/client lifecycle | Existing canonical billing RPCs and idempotent request identity remain; control-plane/currency/accounting regressions pass. Suspend/archive/infrastructure retirement remain distinct and retain history. No new financial semantics or remote lifecycle operations. |
| Provisioning/config/scheduler | Server canonical RPC reserves operator changes before destination writes; dedicated call credential and protected Management/scheduler secrets remain server-side. Scheduler and onboarding negative regressions pass; no hosted Management or real Shop calls. |
| Support handoff | Existing Master/target/source/binding/lifecycle checks, 90-second hash-only single-use grant and separate Shop credential preserved. Actual concurrent SQL consumption has one winner. Existing issued grants are scoped capability contracts, not browser JWT sessions. |
| Storage/private Realtime | Restrictive policy rejects stale/Inactive sessions despite permissive fixture policies; fresh authorized session retains access. Managed table-owner/RLS prerequisites have read-only preflight. Actual hosted bucket/channel inventory and open-channel termination are unverified. |
| Frontend/rendering | Synthetic build, source syntax, mocked login/Clients/Billing/Settings/navigation/PIN regressions, native dialogs/Team viewport tests and stored-XSS regression pass. Native browser backend transports/CAPTCHA are synthetic. No new circular-import participants; five existing cycle participants remain. |
| Secrets/release boundary | Browser contains public configuration only; no added service/Management secrets. Changed-source scan finds no private keys/live JWT/secret-key pattern. Twelve historical migrations/artifact and protected refs unchanged. |

## Test execution — PASS / FAIL / SKIP

| Check | Final result |
| --- | --- |
| Broad Node/PGlite/source regression suite | **PASS: 225, FAIL: 0, SKIP: 0**. Provider/transport doubles are explicit; not hosted validation. |
| Real PG17 bootstrap suite | **PASS: 6 groups**: fresh prerequisites, retries/rebinding/privileges, approved upgrade/identity/data, missing prerequisites/collisions, concurrent binding, lifecycle/provision/support. |
| Canonical pre/post UUID SQL groups | **PASS: 2 groups**; combined command also ran 47 then-current handler regressions (49 reported tests). New handler cases are included in final broad suite. |
| Real PG17 lifecycle suite | **PASS: 8 groups, FAIL/SKIP: 0**, including custom managed FK, Storage/Realtime restrictive RLS, session ownership/cutoff/AMR, trusted policy, audit rollback and concurrency. Final affected rerun after recovery correction also passes all 8. |
| Actual CLI 2.120.0 history/rollback suite | **PASS: 8 groups**. Bootstrap history rejection and backend termination fresh/upgrade; unsafe VACUUM flush negative control; six bootstrap rerun; new lifecycle history rejection/retry fresh/upgrade. Final lifecycle-only rerun: **2 PASS**, six unrelated cases not rerun in that filtered command. |
| Real GoTrue v2.197.0 + PG17 Auth journeys | **PASS: 6 groups**: multi-session refresh continuity; native current password; retained UUID/password with provider ban/old-session denial; actual recovery handler/native password and password-only denial; expired/reused links + actual Pending acceptance; single-session interruption/default-off deletion gate. |
| SQL-only legacy runner | **PASS** fresh full Platform chain, existing-identity upgrade and injected late SQL failure/full rollback. PG17 server, installed psql 18 client; substitute Auth/Vault fixtures are explicitly not provider encryption proof. **SKIP Shop execution** via `--platform-only`. |
| Existing real support concurrency | **PASS: 1 group**, owned PG17 server, synthetic SQL-only Auth/Vault, one consumed grant/final audit. |
| Native Chrome/Playwright | **PASS: 12 viewport/theme groups**: dialogs and Team at 320/768/1440px, light/dark; focus trap/keyboard/Escape/Cancel/backdrop/repeated confirmation/rerender/logout, CAPTCHA gating and canonical focus revocation. Zero external requests/page errors. |
| Native Deno 2.4.5 | **PASS: all 10 remaining function entrypoints**, frozen lock. |
| Synthetic Vite build | **PASS** using four synthetic public variables and ignored output folder. Existing Vite CJS API deprecation remains; no warning suppression. |
| Syntax/whitespace/immutability/sensitive scan | **PASS**; frontend JS/changed harness syntax, no new circular participants, fixed LF/CRLF tests, historical/artifact Git blob checks and `git diff --check`. |
| Hosted gateway/Auth settings, real mail/CAPTCHA, refresh timebox/inactivity, hosted visual/write smoke, actual provider permissions/config/public Storage/open Realtime | **SKIP / release gate**. No hosted connection or mutation authorized/performed. |

Development runs initially failed for a missing pinned-CLI environment variable,
test doubles that lacked new state/atob dependencies, native OTP/session setup
incompatibility and an expiry fixture that assumed an implicit default. These were
diagnosed, corrected and rerun. Final PASS rows refer to actual completed execution,
not waived or missing-dependency checks. Test groups overlap; do not sum these as
unique independent tests. Cached tools/images were used without installation.

The actual CLI harness deliberately fails the genuine history INSERT after SQL
has completed. New objects/grants/data are absent after rollback; committed staging
approval/legacy authority survive bootstrap failure. Clean retry records exactly
one genuine row (13 total after lifecycle). Bootstrap backend termination is
tested. VACUUM in an unsafe temporary copy proves a pipeline flush can commit prior
SQL; production migration contains only compatible statements. Lifecycle-specific
backend interruption, Windows/process crashes and network/provider failure timing
are not all proven locally. A lost connection after commit is an unknown outcome:
read genuine history/state before deciding on retry; never repair history manually.

## Remaining release blockers / limitations

1. **Hosted Auth policy:** verify Require current password and real original Master
   continuity under actual multi-session/timebox/inactivity/MFA settings. Approval
   remains off by default. Do not enable deletion on an operator attestation alone.
2. **Native mail architecture:** built-in shared sender has recipient/rate/delivery
   constraints. General production employee onboarding/recovery is unresolved under
   the owner's built-in-only decision. No unauthorized SMTP/provider fallback.
3. **Hosted preflight and rollout:** actual Storage/Realtime owner permission, RLS,
   public resources, FK inventory, UUID/role retention, twelve genuine rows and
   absence of rejected hook/recovery routes must be verified under separate approval.
   New migration/six handlers/frontend require a coordinated freeze and source review.
4. **External-operation races:** provider ban API has no conditional unban; runtime
   FK check cannot lock remote deletion plus future DDL. Freeze direct provider,
   schema and target changes. Ambiguous ban/unban needs trusted audited recovery.
5. **Provider transports/sessions:** supported ban tested locally; no verified
   arbitrary-UUID session-logout API. SQL cutoff protects retained rows. Public
   recover email veto and immediate cached/public Realtime/public-bucket revocation
   are not claimed. Password recovery must never independently activate Inactive.
6. **Hosted journeys:** real invite delivery, CAPTCHA consumption, expired links,
   master/team writes, refresh continuity and old JWT/refresh/gateway behavior need
   approved disposable staging users/emails. Local SQL adapters are not PostgREST
   or hosted gateway validation. No real employee mutation is permitted implicitly.
7. **Frozen Shop:** ordinary protected Shop operations reject suspension once it
   reaches Shop DB; `Orbito Support` exception is intentional. Cached/open tabs and
   existing Auth sessions are not all immediately revoked/cleared. Separate Shop
   session-hardening review/authorization is needed before claiming immediate Shop
   revocation for production. Do not confuse this with Platform employee Deactivate.
8. **Recovery/legal:** previous temporary backup waived encryption/restore rehearsal
   and Vault portability remains unproven. Reconfirm fresh recoverable backup before
   approved cutover. Existing publication/legal/provider gates are unchanged.

## Exact changed-file manifest

Changes are local only; ignored tool binaries/builds/logs are not Git artifacts.

| Files | Responsibility |
| --- | --- |
| `ENGINEERING_HISTORY.md` | Dated correction, evidence and release gates; prior entries retained. |
| `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md` | Superseding final contracts and ordered separately authorized staging plan. |
| `docs/PRODUCTION_READINESS_REPORT.md` (new) | This audit/findings/evidence/file manifest. |
| `deno.lock` | Remove eight unreachable rejected-hook integrity/redirect entries only. |
| `src/auth-setup.js` | Native Pending/recovery routing; remove reactivation proof flow. |
| `src/events.js` | Native generic recovery, no-email Reactivate, login/clear-state ordering and focus/visibility authority checks. |
| `src/forms.js` | Current-password transport, late alias result guard, secure local state clearing. |
| `src/helpers.js` | Canonical authority validation with network uncertainty handling. |
| `src/main.js` | Logged-out form denial, Auth event checks and startup/logout cleanup. |
| `src/modals/users.js` | Remove obsolete recovery-reactivation wording. |
| `src/pages/settings.js` | Final lifecycle status/actions/explanation. |
| `src/pages/support.js` | Stored HTML/attribute/link injection correction. |
| `src/state.js` | Null default role, no unauthorized nav, authority generation/private-state clearing. |
| `src/supabase.js` | Continuity guard and late private-response rejection. |
| `supabase/config.toml` | Remove rejected hook/public recovery entries; six team/setup JWT flags preserved. |
| `supabase/bootstrap/team-lifecycle-preflight.sql` (new) | Read-only history/mapping/managed RLS/owner/dependency preflight. |
| `supabase/functions/_shared/platform-team-v2.ts` | Final native team lifecycle, current-password verification gates and native recovery eligibility. |
| `supabase/functions/platform-provision/index.ts` | Narrowing/type and canonical read-back binding correction. |
| `supabase/migrations/20261010233446_platform_team_lifecycle_v2.sql` | Unapplied migration: session/cutoff, owned suspension, deletion dependency check, restricted policies, audited continuity approval and existing durable team/archive contracts. |
| `tests/auth-provider-local.mjs` (new) | Owned real GoTrue/PG17 provider and actual password-handler journeys. |
| `tests/session-authority.test.mjs` (new) | Actual validator/private-loader/late-response boundary tests. |
| `tests/support-rendering.test.mjs` (new) | Stored-script/attribute/unsafe-link negative cases. |
| `tests/auth-setup.test.mjs` | Reject obsolete Inactive proof activation. |
| `tests/bridge-call.test.mjs` | Fixed-hash newline portability and provisioning read-back denial. |
| `tests/dialogs-browser.mjs` | Updated actual state dependency in synthetic native browser fixture. |
| `tests/local-bootstrap.sql` | Explicit SQL-only synthetic Auth sessions/AMR/storage prerequisites. |
| `tests/onboarding-v2.test.mjs` | Authenticated dispatcher fixture; production authorization preserved. |
| `tests/platform-auth-dialogs.test.mjs` | Current-password/continuity/late-alias and original-session doubles. |
| `tests/platform-identity-consistency.test.mjs` | Native recovery/current-password and canonical-login data-load ordering. |
| `tests/platform-overhaul.test.mjs` | Authenticated dispatcher fixture. |
| `tests/platform-team.test.mjs` | Final server lifecycle negatives, no rejected transport, native AMR and continuity denials. |
| `tests/production-bootstrap-cli.test.mjs` | Lifecycle statement/signature/session fixture updates; original bootstrap atomicity controls preserved. |
| `tests/team-lifecycle-browser.mjs` | Actual state/validator focus revocation and six layout/theme journeys. |
| `tests/team-lifecycle-postgres.test.mjs` | Final eight real database security/upgrade/concurrency groups. |
| `tests/ui-warnings.test.mjs` | Canonical validator/local-logout and authenticated-dispatch fixtures. |
| Deleted: `supabase/functions/_shared/platform-team.ts` | Proven unused compatibility reexport. |
| Deleted: `supabase/functions/platform-auth-email/index.ts` | Rejected custom Send Email Hook. |
| Deleted: `supabase/functions/platform-password-recovery/index.ts` | Rejected custom recovery transport. |
| Deleted: `tests/team-email-hook.test.ts` | Obsolete transport-specific tests replaced by native/provider tests. |

## Reproduction and next action

Use cached Docker Linux images `public.ecr.aws/supabase/postgres:17.6.1.155` and
`public.ecr.aws/supabase/gotrue:v2.197.0`. Harnesses isolate randomly named, labelled
resources; cleanup validates ownership and never stops existing containers/volumes.
No real secrets/hosted targets are accepted. Build supplies synthetic variables only.

```powershell
$suitePaths=@(rg --files tests -g '*.test.mjs' | Where-Object { $_ -notmatch '(production-bootstrap|platform-team-database|team-lifecycle-postgres|support-handoff-postgres)' })
node --test @suitePaths
node tests/run-platform-team-local.mjs
node tests/auth-provider-local.mjs
$env:ORBITO_BOOTSTRAP_CLI_PATH=(Resolve-Path node_modules/.bootstrap-tools/supabase.exe).Path
node --test tests/production-bootstrap-cli.test.mjs
$env:PLAYWRIGHT_MODULE_PATH='C:\Users\ranaz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
$env:CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/dialogs-browser.mjs
node tests/team-lifecycle-browser.mjs
$entryPaths=@(rg --files supabase/functions -g 'index.ts')
& node_modules/.bootstrap-tools/deno-2.4.5/deno.exe check --frozen @entryPaths
$env:VITE_PLATFORM_URL='https://synthetic.invalid'
$env:VITE_PLATFORM_ANON='synthetic-public-fixture'
$env:VITE_PLATFORM_AUTH_EMAIL='master@example.test'
$env:VITE_TURNSTILE_KEY='synthetic-captcha-fixture'
npm run build -- --outDir node_modules/.bootstrap-tools/stabilization-build
git diff --check
```

The pinned CLI SHA-256 validated by its harness is
`1cbedd6e494581a1c1d90113660113a06798d9967d19c857127b66b8a428e836`.
The SQL-only runner can additionally run `--platform-only` against an owned PG17
loopback fixture using installed psql; its Vault substitute is deliberate. Do not
point any test command at staging/production or an existing database/container.

Next: independent review of the corrected source through the existing Draft PR #4.
The staging plan is in the lifecycle review. No merge/deploy follows automatically,
and this report is not production authorization.

Primary references: [password security](https://supabase.com/docs/guides/auth/password-security),
[Auth sessions](https://supabase.com/docs/guides/auth/sessions),
[built-in email/SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp),
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[pinned provider password update](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go),
[pinned session validity](https://github.com/supabase/auth/blob/v2.197.0/internal/models/sessions.go).


## 2026-10-12 — GitHub review checkpoint authorization

The owner authorized committing the complete 39-file correction set and updating
existing Draft PR #4, conditional on preventing unintended deployment. Source/test
behavior is unchanged from the recorded final local validation; only checkpoint
wording/history is refreshed. The 39-file manifest still includes every tracked,
untracked and deleted path. No generated output or ignored test evidence is included.

Read-only deployment preflight verified Cloudflare Pages `retrasellsaas` links
`zaighaumrana/orbito`, production branch `development`, build `npm run build`, output
`dist`, repository root and no deploy hooks. Preview rules include `*` and exclude
only `feature/production-bootstrap-hardening`; PR #4's branch is not permanently
excluded. Its prior skip-prefixed `a0dae0f` is recorded **skipped / No deployment
available**. The checkpoint therefore uses the supported `[CF-Pages-Skip]` prefix,
not an assumption of preview/backend isolation. Preview access is restricted by
Cloudflare Access; backend isolation was not inspected or claimed.

GitHub has no repository webhooks, GitHub Pages is disabled, and no Actions
workflow exists on PR source or development. Installed repository apps are ChatGPT
Codex Connector, Cloudflare Workers and Pages, and Cursor. No configuration changed.
After publishing, verify the exact new commit in Cloudflare as skipped and confirm
Draft/unmerged PR state and protected refs. GitHub's commit/PR records and the final
checkpoint report supply the resulting SHA and post-push status; this pre-commit
entry does not claim those future checks have already passed.
