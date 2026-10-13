# RetraSell Platform production readiness audit

2026-10-12, Asia/Karachi. **NO-GO for production or unreviewed staging rollout.**
The confirmed local defects described below are corrected and tested. Native Auth
configuration, email-delivery constraints, hosted access boundaries, coordinated
migration/deployment and separate Shop session work remain release gates. No hosted
validation, email, deployment or production change was performed by this audit.

## Repository and scope

- Historical isolated local branch: `fix/pr4-security-stabilization`.
- Reviewed audit base: `a0dae0fc90332f9fc4a498823c1851c00c3f17b6`.
- [PR #4](https://github.com/zaighaumrana/orbito/pull/4): Draft, open, unmerged;
  `feature/platform-team-lifecycle-v2` -> `development`; remote source was unchanged at that historical local checkpoint.
- At the local audit checkpoint these corrections were uncommitted. The owner
  subsequently authorized a GitHub review checkpoint on 2026-10-12. The exact
  published initial correction revision is `be43f28b3a2cea0b1d73b2b9611a96818bed810d`; production NO-GO is unchanged.
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

## Historical stabilization findings and fixes (published be43f28)

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

## Historical stabilization test execution — PASS / FAIL / SKIP

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

Historical local audit manifest: these 39 paths were subsequently committed/pushed at `be43f28b3a2cea0b1d73b2b9611a96818bed810d`. Ignored tools/builds/logs were not committed. The targeted follow-up manifest appears below.

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

## 2026-10-12–13 — F1–F4 targeted correction and re-review checkpoint

**CODE REVIEW: ready for independent re-review of the enclosing Git commit, not certified approved. STAGING / PRODUCTION: NO-GO.** Verified published baseline is **be43f28b3a2cea0b1d73b2b9611a96818bed810d**, Draft PR #4 source feature/platform-team-lifecycle-v2 -> development. The correction revision is the commit containing this report; the PR/final checkpoint report supplies its full SHA after publishing. No hosted resource was contacted or changed. Earlier tables are historical evidence; the independent F1 finding invalidated their support transport claim.

| Finding | Root cause and correction | Before / after evidence |
| --- | --- | --- |
| F1 HIGH | Historical helper set only sub while canonical identity now requires owned live session. Issuance remains service-only: Edge verifies actual caller identity/session and forwards its canonical session_id; five-argument SQL compares bound Master/verified Auth and actual owned live session. Old four-argument API execution is revoked. Server-derived project scope and 256-bit nonce never become browser-selected RPC inputs. Private capability actor validation reads protected canonical state without changing claims; service exchange retains all original bindings/locks/audits. | Pinned be43 baseline on PG17: valid browser Master, service issue denied and otherwise eligible seeded grant exchange false, command fails. Corrected actual service SQL role: issue/exchange pass with explicit verified session argument and no fake user JWT; Manager/forged actor/missing/expired/removed/wrong-owner session, browser minting/legacy issuance and authenticated exchange deny; wrong scope, expiry, revoked Master and replay deny; overlapping consumption has one winner. |
| F2 MEDIUM | Authority-only load guard did not identify selected target/newer request. Add selection/request generations, capture target/view, publish only current results, mark failures/loading and require matching loaded config identity before mutations. | Actual-source A/B reversal previously config.id=1 with selectedClient.id=2; mismatched toggle reached backend. Both fail before and pass after; same-target repeated loads/navigation/failures covered. |
| F3 MEDIUM | Late insert and other continuations wrote private state or started work after logout/view changes. Check original authority generation/UUID/session/role, view/selection/modal before publication/follow-ups. Preserve uncertain server outcomes without automatic retry. | Before: successful Add response restored private selectedClient after clear; native link response reopened reset-password after logout. After: success/failure/revocation/re-login/same-user new session/navigation/modal changes, Edit/config/provision/popup/setup outcomes are discarded. Current normal Add and original-session verifier behavior retained. |
| F4 LOW | Historical local-only language survived a published checkpoint. Label old audit/manifest historical, record exact be43 publication and current enclosing source revision, append dated history/current results. | Git verifies prior checkpoint; no committed/deployed/hosted status is inferred from local tests. |

The adjacent confirmed fixes include the same continuation defect in native link boot/retry, delayed password setup and pending support popup, plus verifier busy cleanup, thrown config-read loading cleanup and allowing a same-client detail load to finish while a modal opens (without allowing stale form completion to close another modal). No broader RBAC, financial, provider email or Shop redesign. Twelve historical migrations remain immutable; only owner-confirmed unapplied version 13 changes. No new migration version/history repair.

### Current execution results

| Check | Result / scope |
| --- | --- |
| Broad existing plus focused new regressions | **PASS 235; FAIL 0; SKIP 0** (225 preserved + nine race groups + one native-setup group). Actual source with explicit transport doubles. |
| PG17 database suites | **PASS six bootstrap groups; two canonical groups** (50 combined canonical/handler tests); original eight lifecycle groups pass; final **nine lifecycle groups PASS**, including role edit/shared reads. Real provider schemas; synthetic SQL users where stated. |
| Actual pinned CLI 2.120.0 | **PASS eight groups** including real history-insert rejection/backend termination/rollback/retry/unsafe flush negative control. Final affected lifecycle fresh/upgrade history cases rerun after final SQL correction; no history fabricated. Six nested bootstrap groups overlap, not extra unique coverage. |
| Real local GoTrue v2.197.0 / PG17 | **PASS six groups**: current password, original Master refresh/cleanup, single-session interruption/default-off gate, retained UUID/password and cutoff, native recovery/Pending/expired/reused links. SQL adapter replaces PostgREST. No SMTP delivery. |
| Support authorization / concurrency | **PASS one comprehensive PG17 group**: actual service-only issue/consume with a Master session distinct from Auth UUID, real-shaped service claims without sub/session_id, binding/lifecycle/revocation/expiry/replay/one winner and audit. SQL-only Auth/Vault fixture; no provider/gateway attestation. Baseline mode intentionally **FAILS** at be43 (regression reproduction), not a current-source failure. |
| SQL-only runner | **PASS** full fresh Platform chain, retained-identity upgrade and late failure/full rollback; PostgreSQL 17 server, installed psql 18 client. **SKIP Shop execution**. |
| Native Chrome / Playwright | **PASS twelve groups**, 320/768/1440px light/dark, dialogs/Team/focus/keyboard/rerender/logout, zero external traffic/page errors. Client races also run against actual JS in VM; real hosted Client views not claimed. |
| Native Deno / synthetic Vite | **PASS ten frozen entrypoints; PASS build** with four synthetic public variables, ignored output. Existing Vite CJS deprecation persists. Initial browser attempt lacked module path and reported SKIP; correct existing paths resolved it without installation; final twelve groups PASS. |
| Syntax / diff / integrity / exposure | **PASS** source JS syntax, whitespace, sensitive-pattern scan, twelve historical blobs, frozen artifact, protected refs and clean Shop. Existing five import-cycle participants unchanged; none added. Staged checks repeated before checkpoint. |
| Full disposable PostgREST/Edge support gateway | **SKIP: no cached PostgREST image/executable**; no dependency download/repair. SQL boundary plus actual Edge-source transport doubles are not a full gateway journey. |
| Hosted validation | **SKIP**, separately authorized staging gate: actual Auth settings/CAPTCHA/mail/recipient eligibility/session continuity, gateway/support handoff, Storage/Realtime/managed policy permissions and disposable writes. No hosted account or email tests. |

### Reproduce safely

Run the broad suite and existing local commands above. Dedicated support runner uses only its own labelled PG17 container/loopback port and cleans it after verifying ownership:

~~~powershell
node tests/run-support-local.mjs --baseline # Expected FAIL against pinned be43 SQL; no source/history edits
node tests/run-support-local.mjs            # Expected PASS on corrected chain
node --test tests/frontend-races.test.mjs tests/auth-setup.test.mjs
node tests/run-platform-team-local.mjs --lifecycle-only
~~~

Use installed ORBITO_LOCAL_PSQL if the Windows default differs. Native browser harness paths remain documented above. Baseline fixtures use explicitly synthetic owned sessions for browser authorization; service claims never acquire user/session fields. All fixture resources are local and disposable; existing Docker containers/volumes are untouched.

### Policy decisions and remaining release gates

- Existing STAGING_TEAM_CUTOVER matrix documents shared canonical/operational reads for Manager/Billing. Historical operator_read also exposes financial/support/team/control-plane SELECT even when navigation hides those sections. Owner must accept that contract or approve a separate narrower policy/loader change. This round does not certify per-role confidentiality.
- Actual service-only begin_edit/finish_edit changes Manager to Billing on the same session; canonical identity and protected mutation immediately use the live new role. No fresh-login cutoff is added for edits; suspension/reactivation cutoffs, password AMR and deleted-session denials remain intact.
- Keep native password enforcement, actual Master refresh continuity before trusted approval, built-in email recipient/rate constraints, provider permissions, backup/restore/Vault and legal/separate-Shop gates open. No Resend/SMTP/hook architecture is reintroduced. No-email Reactivate, deletion/password/CAPTCHA/audit/archive/uncertainty protections remain tested.
- After independent source re-review, obtain separate staging preflight/freeze/backup/rollout authorization. The coordinated backend sequence must include the reviewed platform-support handler: new session-forwarding issuance fails closed before migration 13, while the old four-argument handler cannot issue afterward. Preserve its mixed-transport JWT flag and unchanged Shop exchange contract. Apply only reviewed migration, then authorize frontend and approved disposable hosted journeys. Never automatically repair history or retry uncertain provider writes.

### Deployment trigger safety / checkpoint

Read-only current Cloudflare inspection: repository orbito, development serving orbito.ahwad.com at 0dbde676ca57ed1599a295e221d274ef080cac41; npm run build/dist/root; no deploy hooks. Preview includes * and excludes only the earlier bootstrap branch, so PR #4 is eligible. Existing be43 and a0 commits are provider-recorded skipped. The verified native [CF-Pages-Skip] prefix is required for this authorized source push ([official procedure](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)). GitHub has no repository webhooks/source or development workflows; installed apps remain Codex/Cloudflare/Cursor; no local Git hooks. Preview Access restriction is not backend isolation. No configuration change. Publish only PR source, verify provider skip/current SHA and Draft/unmerged state afterward; final Git/PR records supply post-push evidence.

### Complete targeted follow-up manifest — 43 files

- ENGINEERING_HISTORY.md — Dated targeted corrections, tests and boundaries.
- docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md — Published checkpoint and coordinated support/team rollout gates.
- docs/PRODUCTION_READINESS_REPORT.md — Historical evidence, current findings/results and complete follow-up manifest.
- docs/SUPPORT_SESSION_HANDOFF.md — New verified-session service issuance/capability exchange contract; old contract labelled historical.
- src/async-context.js — Shared UUID/session/role/view/selection/modal continuity and loaded-target validation.
- src/auth-setup.js — Cancel late native link exchange/retry/error routing on logout.
- src/events.js — Invalidate selection/load requests; gate toggles/read/config/team/billing/setup continuations.
- src/forms.js — Discard late Add/Edit/config/team/password outcomes and follow-up writes; release verifier busy state safely.
- src/main.js — Bound form errors, startup results and browser navigation.
- src/pages/clients.js — Withhold config controls until selected and loaded client identities match.
- src/provisioning.js — Cancel stale UI publication, downloads and automatic next-stage dispatch.
- src/state.js — Selection/request generations and private/busy-state clearing.
- src/supabase.js — Selection/request-bound detail loads, failure state and config pre-dispatch continuity.
- src/support-handoff.js — Close pending popup rather than open Shop after logout/navigation.
- supabase/bootstrap/validate.sql — Structural checks only; actual signed-in JWT identity verification required, no impersonation.
- supabase/functions/platform-support/index.ts — Verify actual caller, forward canonical session to service-only issue RPC; unchanged service-only exchange.
- supabase/migrations/20261010233446_platform_team_lifecycle_v2.sql — Unapplied forward override: service-only live-Master/owned-session issuance and private canonical capability actor checks.
- tests/auth-setup.test.mjs — Late OTP/retry cancellation failure-before/pass-after.
- tests/control-plane.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/currencies-boundaries.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/dialogs-browser.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/frontend-races.test.mjs — Nine actual-source adversarial race/continuation groups.
- tests/local-bootstrap.sql — Remove implicit user/session JWT fallback; explicit SQL-only fixture sessions.
- tests/manual-owner-activation.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/onboarding-stabilization.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/onboarding-stabilization.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/onboarding-v2.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/onboarding-v2.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/overhaul-sql.test.mjs — Explicit verified-session issue arguments, sessionless service JWTs and API ACL assertions.
- tests/platform-auth-dialogs.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/platform-identity-consistency.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/platform-master-upgrade.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/platform-overhaul.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/platform-overhaul.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/run-support-local.mjs — Owned PG17 disposable runner, credential sanitization/cleanup and pinned failing baseline mode.
- tests/session-authority.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/support-access.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/support-handoff-postgres.test.mjs — Real service claims/roles, failure-before, issuance/exchange denials, binding/expiry/revocation/replay/concurrency.
- tests/support-handoff.sql — Explicit owned synthetic user JWT/session claims; no service session substitution.
- tests/support-handoff.test.mjs — Caller issue transport and bound transient popup fixture.
- tests/team-lifecycle-browser.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.
- tests/team-lifecycle-postgres.test.mjs — Actual finish_edit live-role reduction and documented shared-read probe.
- tests/ui-warnings.test.mjs — Load the actual shared continuity code and declare valid synthetic UI/context/request fixtures.

No generated build/tool/test evidence, credential file, historical migration, frozen Shop artifact or unrelated source is part of this manifest.

### Final trust-boundary review — 2026-10-13

The provisional authenticated issuance design was rejected before commit/deployment: its server-derived project/nonce inputs would have become browser-editable RPC parameters. Final issuance retains service-only authority and adds an explicitly forwarded, independently checked canonical session. The service JWT itself has no sub/session_id. This is a narrow support boundary, not a generic service-role authorization bypass. Final SQL was rerun through actual CLI history rollback/retry; service-role SQL negatives and 235 source regressions are rerun on this final design. Historical local proposal wording in engineering history is superseded by the dated correction below.

## 2026-10-13 — R1/R2 targeted authentication and read ownership correction

Published checkpoint **65429dba0e19aea6467f1347222e044f5e7549bc** was independently reviewed: the earlier F1–F4 reproductions are corrected, but R1/R2 still made that checkpoint **CODE REVIEW FAIL**. The earlier readiness recommendation is historical, not approval of this follow-up. Current source is ready for focused independent re-review only after the authorized safe Git checkpoint. **STAGING / PRODUCTION remain NO-GO.** Exact follow-up SHA belongs to the enclosing Git revision and PR #4, which must stay Draft/unmerged.

### Exact correction and adjacent evidence

- **R1:** Each login claims a unique attempt object/UUID and advances authority generation. Every awaited signout, password login, setup lookup, canonical identity and protected load checks that owner before continuing. Catch cannot clear/sign out successor state; finally cannot release a successor's busy flag. clearSensitiveState invalidates the attempt and releases loginLoading, including canonical revocation and cross-tab SIGNED_OUT. Owned failure cleanup retains its own lock until local signout returns. The already-logged-out preflight/failure signout phase tolerates its expected native SIGNED_OUT; signout during authenticating/loading still cancels. Canonical identity, CAPTCHA, local signout scope, session cutoff and server authorization are unchanged. Native signout generates SIGNED_OUT and local scope is explicit ([official reference](https://supabase.com/docs/reference/javascript/auth-signout)).
- **Adjacent R1:** A delayed initial session lookup could also reset a later login in the controlled actual-handler fixture. Startup checks its captured generation before routing/publishing; starting a new attempt invalidates old startup work. No replacement Auth architecture or browser role authority is introduced.
- **R2:** Shop-config reads ignore modal identity while checking original authority/page/client/selection/request. Success/API failure/rejected transport settle only the owned read. Finally clears only that exact still-owned loading object/request on cancellation; a newer client/request is untouched. Shop singleton config ID remains clamped to the Platform client ID. Failures withhold mutations and expose the existing read-only Refresh status action. Opening/closing Edit Client does not discard the read or close/replace its modal. Form/mutation modal guards remain strict.

### Reproducible failure-before / pass-after

New tests execute actual production events.js, state.js, helpers.js and main.js (including SDK callback registration), with controlled transport promises. The read recovery executes the actual loadClientData implementation. No simplified replacement login/ownership handler, hosted traffic or live token is used. Baseline source is loaded with git show from the exact reviewed commit, not by editing/resetting the checkout:

~~~powershell
$env:ORBITO_UI_REVIEW_BASELINE='65429db'
node --test tests/auth-ui-ownership.test.mjs # Expected FAIL: seven failures, one retained-behavior pass
Remove-Item Env:ORBITO_UI_REVIEW_BASELINE
node --test tests/auth-ui-ownership.test.mjs # PASS eight groups on current source
~~~

Coverage: config resolve/reject after canonical revocation; cross-tab SIGNED_OUT before identity and during loading; actual successor login after logout; late resolve/reject after successor success or while its lock is held; owned failure/cleanup and retry; late startup resolve/reject; modal open/close during read success/API failure/rejection; existing read-only refresh recovery; client switch/logout/revocation/role cancellation. Existing F1–F4 and modal-sensitive mutation regressions remain included.

### Actual validation, scope and limitations

| Check | Result in this round |
| --- | --- |
| Broad regression suite | **PASS 243; FAIL 0; SKIP 0**: all previous 235 plus eight new ownership groups. Two existing fixtures now initialize the real state's authority generation; assertions retained. |
| Real local PostgreSQL 17 | **PASS six bootstrap, two canonical and nine lifecycle groups**. Canonical run includes 50 combined handler/database tests, overlapping broad coverage. Owned disposable databases with native Auth schema and explicitly identified SQL/Vault fixtures. |
| Real local GoTrue v2.197.0 / PG17 | **PASS six provider groups**, including native current-password, Master refresh/cleanup, retained UUID/password and old-session cutoff, Pending/recovery/expired/reused links; single-session interruption/default-off destructive gate preserved. SQL adapter replaces PostgREST. |
| Support Access | **PASS one comprehensive real PG17 service-role authorization/concurrency group**: actual issue/exchange, binding/revocation/rebinding/expiry/replay and one winner. No Support source/contract changed. |
| Browser | **PASS all twelve existing native Chrome viewport/theme groups**, 320/768/1440px, zero external traffic/page errors. Backend/CAPTCHA doubles; R1/R2 timing probes are VM handler tests, not hosted/native cross-tab journeys. |
| Deno / build | **PASS ten native frozen Deno entrypoints; PASS synthetic Vite build**. Cached dependencies reused; no installation or reproducible clean-install claim. Existing Vite CJS deprecation remains. |
| Integrity / syntax / exposure | **PASS** JS syntax, whitespace/sensitive scan, twelve historical migration blobs, unchanged full SQL/Edge source, frozen artifact, protected refs and clean Shop. Five existing cycle participants unchanged. Staged checks required before publication. |
| CLI atomicity | **Not rerun this round**: no SQL/CLI source changes. Earlier eight-group actual CLI evidence remains historical, not a new execution claim. |
| Hosted / gateway / mail | **SKIP** hosted resources, real email/CAPTCHA, full PostgREST/Edge gateway, managed Storage/Realtime and hosted session continuity. No real employee/account operations. |

Mocked timing proves handler ownership/dispatch, not every native SDK storage/cross-tab event ordering or cancellation of already dispatched Auth operations. The real local provider tests do not prove hosted single-session/MFA/inactivity/timebox settings. No issued request is assumed rolled back or blindly resubmitted. Changelog markdown retrieval was attempted but the web adapter rejected its content type; current official signout documentation was checked. No library/version/configuration change depends on a claimed latest-provider guarantee.

### Exact follow-up manifest — nine files

| Path | Responsibility |
| --- | --- |
| src/events.js | Owned login success/failure/cleanup; modal-independent owned Shop-config read. |
| src/state.js | Login attempt state and cancellation/busy/routing reset. |
| src/main.js | Cross-tab login cancellation and guarded startup publication. |
| src/pages/clients.js | Existing read-only Refresh status action on failed/cancelled detail. |
| tests/auth-ui-ownership.test.mjs (new) | Eight actual-handler baseline/current adversarial ownership groups. |
| tests/platform-identity-consistency.test.mjs | Initialize generation in existing email/alias-login fixture. |
| tests/ui-warnings.test.mjs | Initialize generation in existing click/native-submit fixture. |
| docs/PRODUCTION_READINESS_REPORT.md | Dated evidence, exact scope, limitations and review gates. |
| ENGINEERING_HISTORY.md | Append correction decisions/results; preserve prior evidence. |

### Git / release boundary

Owner authorizes only the existing Draft PR #4 update after deployment-trigger inspection. Use the approved native [CF-Pages-Skip] prefix and push only feature/platform-team-lifecycle-v2. Record the exact SHA and provider skip in PR/final checkpoint evidence after publication; do not infer provider skip from empty GitHub checks. Stop before push if trigger safety cannot be established. No hosted modification, migration, function/frontend deployment, protected-branch change, Shop change, new RBAC contract or alternate email delivery is part of this correction.

Read-only pre-push trigger review completed: refreshed retrasellsaas settings still link zaighaumrana/orbito, development serves staging at 0dbde676, npm run build/dist/root, no deploy hooks. Prior exact 65429db is provider-recorded skipped. Source/base contain no Actions workflows; no repository webhooks or active local hooks; GitHub Pages disabled; installed integrations remain Codex/Cloudflare/Cursor. A stuck existing browser target was recovered with a fresh tab in the same browser, without settings changes. The verified native skip prefix is required because this feature branch remains preview-eligible. This is no-deployment verification, not proof of preview/backend isolation.

Pending: focused independent re-review, owner shared-read/immediate-role-edit acceptance, separately authorized read-only staging Auth/backup/configuration preflight, and later separate coordinated rollout/disposable-account validation. Current-password enforcement, Master refresh continuity/default-off destructive approval, native sender limits, managed policies, backup/Vault portability, legal/provider and separate Shop session-hardening gates remain open.

## 2026-10-13 — Edit Client DOM and role-specific database read correction

This dated correction supersedes the preceding shared-read acceptance gate. The
owner requires real role-specific confidentiality and confirmed that Manager
keeps invoice dates/totals/status summaries, with View/print limited to Master and
Billing. Reviewed base: 6ea96cbc6cddda1b07b37646dba7e3456e45d52f. Existing Draft
PR #4 stays unmerged. **Independent source review: ready after safe checkpoint;
STAGING and PRODUCTION: NO-GO.**

### Findings and implementation

The old renderer preserved modal state while replacing the actual form inputs.
The pinned reviewed renderer loses typed fields after the actual pending Shop
read. The correction retains the owned Edit Client backdrop/form DOM and restores
focus/caret. Authority/page/client/selection/modal ownership remains strict;
logout, role change, target switch and close/reopen cannot retain stale DOM.
Routine refresh, successful/failed/rejected reads, save/cancel and responsive
layout have real browser coverage. Saving an unverified client keeps the draft,
reports the required refresh and sends no write.

Seventeen inherited operator_read policies and all-role loaders exposed raw team,
support, financial and provider/audit rows. Real populated SQL fixtures reproduce
Billing ticket contents and Manager private invoice notes before the correction.
Indirect client/provision/overhaul RPCs and executable private helpers were also
part of the leak surface.

New migration **20261012231226_platform_role_read_isolation.sql** changes all 17
raw policies to Master-only, adds restrictive PUBLIC read ceilings, supplies
explicit canonical role-selected projections and closes private helper execution.
Checked definer wrappers preserve legitimate mutations; Manager client/support
writes use bounded RPCs because direct UPDATE/RETURNING needs SELECT RLS.
Billing retains approved financial fields but no support, team, provider or audit
contents. Manager gets approved summaries and operational/paper/thermal data.
Storage/private channels gain a live-Master ceiling; application table streams
are removed to avoid DELETE/RLS leakage. Schema-level/ALL-TABLE publication and
missing managed prerequisites fail closed. Migration 13 and all twelve applied
historical files remain byte-identical.

Employee loaders request only permitted datasets/aggregates and own identity.
They validate UUID/session/role, paginate and publish only current responses.
Canonical role changes immediately clear old data/navigation/modal/selection and
invalidate pending continuations while keeping the same Auth session. A failed
native refresh cannot retain the previous role's records. The final audit also
reproduced a changed-role page followed by a failed native identity retry; the
loader now clears its old role cache before that retry, with a seventh focused
failure-before/pass-after regression. Read failures render an
explicit unavailable state and block dependent actions, never an empty successful
financial ledger; own employee password Settings remains available.

Browser validation caught a selected-client refresh scope error during the new
implementation; it was fixed and given a regression. Failed post-write refresh
now renders its error instead of leaving stale form UI. The final audit also
preserves archived client financial records instead of silently dropping them
through an operational-client join. A permissive-policy/PUBLIC-grant regression
proves the additional restrictive read ceiling cannot be OR-bypassed.

Complete effective matrix, explicit column lists and every versioned direct/
indirect surface: [PLATFORM_ROLE_READ_ISOLATION.md](PLATFORM_ROLE_READ_ISOLATION.md).
No role-contract owner decision remains pending. Unknown hosted custom APIs,
provider settings and actual deployment behavior still require the live gate.

### Validation and honest limits

- **PASS 250 regressions:** original 243 plus seven actual loader/validator groups;
  previous R1/R2 and F1–F4 retained. Zero final failures/skips.
- **Expected FAIL baseline:** actual Chrome pending Shop read with exact reviewed
  6ea96cb renderer replaces typed name. Current **seven browser groups PASS**:
  Edit Client at 320/768/1440px, Manager/Billing journeys at those widths, and stale
  target/logout/revocation. Actual Vite modules/DOM, synthetic SDK transport,
  zero external traffic/page errors. **Twelve existing dialog/Team groups PASS**.
- **PASS six PG17 bootstrap, two canonical and nine lifecycle groups.** Canonical
  invocation reports 50 overlapping handler/SQL tests, not extra unique groups.
  Overbroad read assertions were updated to the explicit owner contract.
- **PASS four populated real PG17/real Auth/Vault-schema/PostgREST groups:**
  positive/negative role fields, invalid identities/live edits, legitimate
  mutations/rollback and authenticated HTTP. Pending/inactive/archive/deleted/
  revoked/expired/stale sessions, forged metadata, joins, private-schema RPCs,
  Storage/channel policy and publication boundaries covered. Real PostgREST
  13.0.8 uses locally signed synthetic fixture JWTs; it is not a mocked gateway.
- **PASS eight actual CLI 2.120.0 groups.** Forward fresh/staging cases now include
  migration 14: forced history INSERT failure after SQL completion rolls back
  objects/policies/grants/data; old authority survives; clean retry creates one
  genuine row and fourteen total versions. New read preflight/validator execute
  against genuine CLI history. Final affected forward cases rerun after audit.
- **PASS six real GoTrue 2.197.0/PG17 groups:** current password, refresh/cleanup,
  owned ban, retained identity/password, cutoff and setup/link expiry/reuse. Its
  SQL adapter is explicit; separate PostgREST tests cover HTTP authorization.
  Single-session interruption reproduces the existing destructive-release gate.
- **PASS real PG17 Support Access authorization/rebinding/replay/concurrency.**
  Its older support-specific fixture uses synthetic Auth/Vault helpers; separate
  PG17/native Auth suites use real provider schemas. No Vault portability claim.
- **PASS ten frozen native Deno entrypoints; synthetic Vite build.** Four dummy
  public variables, ignored output. Existing Vite CJS deprecation remains.
- **PASS** syntax/whitespace/sensitive checks, unchanged twelve historical plus
  lifecycle-13 bytes, frozen artifact, protected refs and clean Shop. Five existing
  import-cycle participants unchanged. Repeat staged/committed checks before push.
- **SKIP** hosted account/Auth writes, real mail/CAPTCHA, full Edge gateway,
  provider Storage/Realtime services/public channels, hosted GraphQL/custom APIs
  and hosted session policies. SQL policy fixtures are not provider-service proof.

Intermediate expected baseline failure, two stale transport/auth fixtures,
inherited Storage expectations, mobile offscreen-navigation fixture and the new
selected-client scope error were resolved without weakening security. The final
added invoice fixture initially violated the existing client foreign key; it was
removed without altering the constraint, retaining archived-client coverage.
The browser explicitly dismisses its verified failure notification before the
next pointer action instead of forcing a click through it. The final
results above supersede intermediate failures. No missing dependency is a pass.

Reproduction: run all non-database *.test.mjs suites, run-platform-team-local.mjs,
auth-provider-local.mjs, run-support-local.mjs and production-bootstrap-cli.test.mjs
with the absolute pinned CLI path. Existing Playwright/Chrome paths run
client-modal-browser.mjs (--baseline expects failure), dialogs-browser.mjs and
team-lifecycle-browser.mjs. Owned random labelled resources only; no hosted target
accepted. Official cached postgrest/postgrest:v13.0.8 observed manifest digest:
sha256:d09618df2b7b9547c80a076c2f4045b326be8d7ac06060d263caefec1334e3c9.
Use synthetic public build overrides and --frozen Deno checks on all ten entries.

### Exact correction manifest — 31 files

| File | Purpose |
| --- | --- |
| src/render.js | Actual owned Edit Client DOM/focus/caret and explicit read-error/loading view. |
| src/state.js | Role cache/generation invalidation and read readiness/error state. |
| src/supabase.js | Canonical role-aware projections, scoped detail and explicit errors. |
| src/helpers.js | Clear previous role records before canonical refresh. |
| src/main.js | Render role invalidation and read errors through app callbacks. |
| src/events.js | Financial action/View/print guards, support RPC and refresh. |
| src/forms.js | Bounded client writes, verified-data gating and post-write refresh failure. |
| src/billing.js | Master/Billing preview/print guards. |
| src/pages/clients.js | Manager summaries, restricted private panels/history, setup guidance. |
| src/pages/overview.js | Billing aggregate support count and financial navigation; no Shop URL. |
| src/modals/client.js | Manager currency readonly, matching existing server authority. |
| supabase/migrations/20261012231226_platform_role_read_isolation.sql (new) | Forward confidentiality, projections/wrappers, managed ceilings/publication. |
| supabase/bootstrap/role-read-preflight.sql (new) | Read-only count/order, managed/publication/custom-view prerequisites. |
| supabase/bootstrap/validate-role-reads.sql (new) | Post-migration structure/history check, no impersonation. |
| tests/platform-role-reads-postgres.test.mjs (new) | Populated SQL/PostgREST boundaries, compatibility and rollback. |
| tests/platform-role-loaders.test.mjs (new) | Seven actual loader/validator/cache/pagination/failure cases. |
| tests/client-modal-browser.mjs (new) | Actual DOM baseline/current, adjacent refresh and role journeys. |
| tests/run-platform-team-local.mjs | Integrate isolated role reads and focus option. |
| tests/team-lifecycle-postgres.test.mjs | Update intentionally overbroad inherited read assertions. |
| tests/production-bootstrap-cli.test.mjs | Preserve original harness; extend forward history failure/retry. |
| tests/auth-provider-local.mjs | Explicit managed Realtime policy fixture prerequisite. |
| tests/local-bootstrap.sql | SQL-only managed Realtime fixture prerequisite. |
| tests/frontend-races.test.mjs | New client-RPC transport doubles; preserve ownership assertions. |
| tests/platform-auth-dialogs.test.mjs | Legitimate authenticated Billing print fixture. |
| docs/PLATFORM_ROLE_READ_ISOLATION.md (new) | Role/field/surface inventory and architecture/limits. |
| docs/PRODUCTION_READINESS_REPORT.md | Dated findings, evidence and exact manifest. |
| docs/STAGING_TEAM_CUTOVER.md | Superseding effective matrix and two-version rollout gate. |
| docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md | Current sequence and old-loader incompatibility. |
| docs/PRODUCTION_BOOTSTRAP.md | Fourteen-version order and recovery requirements. |
| docs/PRODUCTION_BOOTSTRAP_REVIEW.md | Current migration/test/checkpoint correction. |
| ENGINEERING_HISTORY.md | Dated owner decision, fixes, evidence and boundaries. |

### Current hosted state and release gates

One authorized read-only staging migration-history query confirmed twelve genuine
records through 20261008191709, with lifecycle 20261010233446 absent. No customer/
Auth/credential data was read or changed. Production was not contacted. New rights
are local only. Current backup, managed ownership/custom catalog and actual CLI
plan must be reviewed again before separately approved hosted execution.

Future cutover requires migration **13 then 14**, matching backend replacements
and frontend in a maintenance freeze. Old employee loaders deliberately fail
under stricter raw RLS. Do not deploy frontend early, fabricate/delete history or
restore broad reads as an automatic rollback. Migration-14 SQL/history rollback
is tested; the full chain and committed Auth/earlier migrations are not one undoable
transaction. Reverting JavaScript cannot reverse those changes.

Read-only trigger review confirms current Cloudflare repository/build/staging
branch/no deploy hooks and prior exact native skips. This feature is preview-
eligible: use approved **[CF-Pages-Skip]** prefix, push only its ref, and inspect
its exact provider skip afterward. GitHub workflows, hooks, Pages and installed
integrations are checked before checkpoint. Record final SHA/provider result in
PR/final evidence. Preview access never proves backend isolation.

Remaining gates: independent source re-review; separately approved hosted catalog,
GraphQL/public-channel/managed-policy/backup preflight; native current-password/
refresh continuity before destructive policy approval; real mail/CAPTCHA/role/
lifecycle journeys with approved disposable accounts; coordinated backend/13/14/
frontend authorization; backup/Vault recovery, legal/provider and separate frozen
Shop/session gates. No merge, deployment or real account operation is authorized.

## 2026-10-13 — Focused bfc24ca review corrections

The independent Work review reproduced two MEDIUM defects. This six-file follow-up
addresses only those defects and the actually affected Billing addon notice:
src/supabase.js, src/forms.js, tests/platform-role-loaders.test.mjs,
tests/frontend-races.test.mjs, this report and ENGINEERING_HISTORY.md.

Each verified, owned role-tagged page now invalidates former-role state directly,
even after another dataset has rejected Promise.all. A single bounded reload
fetches the new role's datasets; old generation/session responses cannot reverse
it. A second role change fails visibly without an automatic request loop. Normal
loads gain no requests. Authority/session validation and database RLS are unchanged.

Manager plan synchronization uses already approved Active/Suspended and present
infrastructure status; the existing server config boundary still verifies role,
binding and credentials. Master retains its prior verified-connection path.
Unready, failed, rejected or uncertain sync explicitly reports the committed
Platform change and unconfirmed Shop outcome, closes the save form, refreshes
status and directs recorded uncertainty to Master reconciliation. Existing server
intent checks prevent blind repeat writes. Billing rates still save normally;
an inventory-addon change explicitly requires Master/Manager Shop reconciliation,
because Billing's existing server permission deliberately denies config writes.
No private provisioning read or new Billing privilege is introduced.

**Validation:** five focused cases FAIL against the reviewed source, then PASS
afterward; **27 directly affected tests PASS** (23 loader/race/operation checks
and four selected configuration/recovery checks), zero final FAIL/SKIP. Covers
both role directions, first-error/late-change ordering, paused native verification,
late former-role replies, Manager/Master sync, unready setup, failed/uncertain/
rejected sync, unresolved-intent blocking and Billing/Master rates. Actual handlers
and config helper run with synthetic transports. Syntax, synthetic Vite build,
whitespace and sensitive/integrity checks PASS; existing Vite CJS warning remains.

SQL/PG17/CLI/Auth/Deno and the full 250/19-browser suites were **not rerun**:
permissions, migrations, RPC contracts, Edge source and dependencies did not change.
Their preceding results remain historical evidence. Hosted Shop outcomes, native
session behavior and UI journeys remain unverified this round. All existing hosted
release gates remain. Safe checkpoint requires current trigger inspection, native
CF-Pages-Skip and exact provider verification. Keep Draft PR #4 unmerged;
**independent re-review pending; STAGING / PRODUCTION remain NO-GO.**

### 2026-10-13 — Same-plan Edit Client correction

Automatic entitlement sync now requires a successfully saved plan different from
the captured original plan. Same-plan name/industry/Shop URL edits send no Shop
configuration request and preserve custom modules. Master/Manager plan changes,
Billing reconciliation and uncertainty/ownership guards remain intact. Name-only
FAIL before / PASS after; both focused cases and 19 affected form/config checks,
syntax/whitespace PASS. No build, full/browser/PG/Auth/CLI/Deno suites were run;
no SQL/server contract changed. Hosted behavior remains unverified. Draft PR #4
stays unmerged; staging/production remain NO-GO.
