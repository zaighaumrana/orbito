# RetraSell Platform — eleven corrections and official visual system

## Current superseding status — 2026-10-17

The current reviewed code checkpoint is `27f6abde0274ac6c989664d0b363504b93128d10`
on `feature/platform-team-lifecycle-v2`, Draft PR #4 targeting `development`.
All 14 source/correction commits are committed and pushed; the cumulative code
checkpoint is 131 paths, not the earlier 39/61/62/63-file local inventories.
The definitive [acceptance/deferred-testing register](PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md)
and [120-case ledger](PR4_ACCEPTANCE_CASES.csv) supersede current-status claims below.
The original dated checkpoints and failures remain historical evidence.

Independent final review approved documentation finalization only: F1/F2/F3/N1/N2/N3
are locally corrected and independently verified within their recorded scopes.
Owner-reported employee staging journeys and independent state reads are separate
from local tests. Staging has 16 genuine migrations; source migration 17 is unapplied.
Eight employee bundles are deployed (12 functions total), while newer config/support
corrections and D1 provisioner source drift still require authorized rollout.
The permanent-deletion policy was last independently verified **false**.
Git `development` remains `0dbde676ca57ed1599a295e221d274ef080cac41`;
canonical staging Pages serves ad hoc `d3fc517aabb2b5d09ea939aa56830287b5d89bba`,
not the latest feature corrections. Later correction SHAs were skipped by Cloudflare;
production-branch auto-deploy remains enabled, so a future merge may deploy.
No merge/deployment authorization or whole-Platform production GO follows.

D14–D17: The original 63-file implementation, invoice/font and CLI16 follow-ups
are enclosed by commit 015e82e; the seven-file UI polish is d3fc517. The table below
is the original pre-commit local manifest, not today’s whole PR. Local-only/no-push
statements apply to their dated tasks. Independent invoice/browser and CLI16
results are recorded in the central register; physical printing, owner optical
approval and broader accessibility/provider acceptance remain separate. Earlier
plans to deploy all employee functions are historical: eight employee bundles are
already present, but matching newer config/support 17 components and D1 still need
separate approval. Existing author-reported counts are not relabeled as newly
independent results.

## Historical implementation and validation records


> 2026-10-16 focused follow-up: independent finding F1 (invoice print Inter loading)
> is reproduced and corrected locally. See the dated section below for scoped
> results and limitations. The later migration-16 CLI verification below also
> passes locally. Current inventory is 63 files: the invoice browser test is new,
> and the existing CLI test harness is now modified. No commit, push, PR change
> or deployment.

2026-10-15, Asia/Karachi. **Local implementation; independent review pending.
Staging and production remain NO-GO.** No commit, push, PR update, deployment,
hosted SQL, Auth operation, real email or Cloudflare configuration change is
authorized by this document. The Master deletion policy must remain **FALSE**.

## Baseline and boundaries

Started with a clean, synchronized `feature/platform-team-lifecycle-v2` at
`71136819abbf36ef4fc36b69702c14a471582792`. GitHub independently reported PR #4
open, Draft, unmerged, targeting `development`, with that exact source SHA.
The changes below are uncommitted on that same branch. Historical migrations
1–15 and `supabase/functions/_shared/shop-release.json` are preserved. No Shop
checkout, provider project, protected branch or committed release is changed.

## Requirement accounting

| Change | Implementation and limits |
|---|---|
| 01 — Clear Failed Invitation | New JWT-verified endpoint calls a service-only SQL command after repeated canonical Master/confirmed-Auth/live-session verification. Requires the exact original creation request/target/actor, unchanged Pending reservation/snapshot, no linked identity, no competing operation, no unexpected team FK and a two-minute settled review period. SQL independently verifies absence by normalized email, relevant UUIDs and reservation nonce, including soft-deleted Auth rows. Cancels only the unused reservation, removes its unlinked Pending row, and retains the original operation/snapshot/request plus an audited resolution. No Auth deletion, identity adoption, retirement tombstone or automatic reinvitation. Exact retries/concurrent calls yield one resolution/audit. |
| 02 — Invitation status | Human-readable Active/Pending/Inactive/Archived and creation/reconciliation states. Technical request IDs are collapsed in Manage details. Unresolved creation or missing Auth mapping cannot offer resend or permanent deletion as a cleanup workaround. A genuinely linked Pending account retains native invitation/recovery renewal. Native delivery, exact expiry and revocation are **not inferred** from a login or a Platform row; the dialog explicitly states that they cannot be confirmed here. An expired link can be renewed for an otherwise eligible Pending identity. There is no claim of exact native link-validity classification. |
| 03 — Deletion messaging | An authenticated, caller-scoped Master-only history RPC can establish no recorded deletion, a prior completion, or a prior unresolved stage. Only a definite early rejection may use that evidence. Missing/unreadable/mismatched history remains unknown; later provider/operation failures preserve the conservative F1 uncertainty behavior. No service client or destructive reservation is constructed before the existing continuity/password/CAPTCHA gates. |
| 04 — Suspended login | A verified caller may receive an own-UUID/session-scoped inactive notice after canonical authorization denial. No email lookup or new authority is exposed. Native pre-authentication `user_banned` remains generic because GoTrue checks the ban **before validating the password**. Existing provider bans, permanent session cutoffs and DB enforcement remain independent. Recovery never activates an Inactive identity. |
| 05 — Recovery 429 | Definite native 429/rate-limit errors say to wait, without account-existence details. Other definite failures do not claim an email was sent. CAPTCHA remains mandatory. A late recovery response cannot redraw or unlock another Auth flow/session. |
| 06 — Notifications | Add/Edit/Deactivate/Reactivate/Resend/Clear/Delete outcomes have distinct, confirmed wording. Successful role updates survive ordinary render/data refresh. Durable outcomes require dismissal; uncertainty is retained. Failed creation refreshes the Team review state. Logout/authority changes clear prior private notifications and registered invoice previews. Password-change confirmation is deliberately emitted after clearing old dialogs. |
| 07 — Master diagnostic | A separate memory-only Auth client verifies the same canonical Master and a distinct temporary session. The original session is checked and refreshed **during** the temporary grant, then checked/refreshed again after local cleanup, followed by two canonical reads. Cleanup runs on failure; ownership prevents obsolete work refreshing a successor. Single-session refresh loss rejects the diagnostic. No policy, password, identity, employee or permission is changed. The UI warns that single-session settings can sign the administrator out. A diagnostic PASS is **not** deletion approval. |
| 08 — Team page | `/team`, Master-only navigation and canonical route check. Active/Pending/Inactive/Archived tabs/counts, search, adaptive rows/cards, individual Manage dialogs, explicit refresh, invitation actions and read-only archive evidence. No duplicated Settings team implementation. Server authorization remains decisive for all actions and data. Settings retains personal credentials/platform information plus the non-destructive diagnostic. |
| 09 — Master role | Sidebar consistently displays the current canonical role, including Master Admin, beneath the escaped username. No username/email supplies authorization. |
| 10 — Official branding | Exact supplied refined SVG/PNG assets, stable paths, favicon/app metadata and supplied embedded Inter fonts. No logo geometry or accent changes. Public RetailOS/RA artwork/text is removed from the Console and invoice presentation; internal compatibility identifiers remain. No service worker or offline behavior is introduced. |
| 11 — Console UI | Shared official tokens restyle Auth/recovery/password setup, shell/navigation, Overview, Clients/detail/setup, Billing, Support, Settings, Team, forms/tables/dialogs/notifications and empty states. Sidebar stays navy in both themes. Keyboard focus, responsive overflow, labeled searches/roles, adaptive Team rows, reduced motion and print-image readiness are covered. Invoice monetary calculations, ledger selection, rounding and mutations are unchanged. Print readiness rechecks the original authority before printing; rich previews close on revocation. |

The independent requirement for exact expired-versus-revoked link status cannot be
certified from the native public Auth response or existing Platform operation
record. No provider TTL was guessed and no custom mail/verification service was
introduced. This remains a documented native/provider visibility limitation,
with safe Pending renewal and server-enforced eligibility.

The native ban-order decision was checked against the
[pinned official GoTrue password-grant source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/token.go),
alongside official [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
and [local-scope sign-out](https://supabase.com/docs/reference/javascript/auth-signout)
documentation. No provider error is treated as password verification merely
because it identifies an existing banned account.

## New database/server surface

`20261015003232_platform_team_invitation_review.sql` was created by the installed
Supabase CLI **2.120.0** (`migration new platform_team_invitation_review`). It is
forward migration **16**, with no authored transaction boundaries or pipeline-
incompatible statements. Normal ALTER TABLE/CREATE FUNCTION statements remain in
the CLI's SQL/history transaction. No historical SQL is rewritten.

- Private `team_operations.resolution`: protected by existing table grants/RLS;
  retains the failed-clear disposition separately from the original request.
- `platform_team_clear_failed_invitation(uuid,uuid,uuid,uuid)`: service-only,
  locked/authorized absence check, cancellation, placeholder removal and audit.
- `platform_team_delete_state(uuid,uuid)`: authenticated canonical Master only;
  minimal caller/target/request history evidence, no private payload or nonce.
- `platform_account_access_notice()`: own confirmed UUID/owned session only;
  an inactive boolean, never an email/username search or operational permission.
- `platform_team_history()`: existing Master-only projection plus `clear_after`;
  no nonce, snapshot, credentials or provider tokens returned to the browser.

No existing RLS policy, table ownership, internal-role membership, entitlement,
financial, provisioning or Support RPC contract is relaxed or replaced. The
password-verification policy is not enabled. The new Edge entrypoint is
`clear-failed-platform-invitation`; `verify_jwt=true`. Shared Team changes retain
repeated confirmed-Auth/canonical Master/live-session checks and native email APIs.

### Clearance recovery semantics

The waiting period is a conservative settling interval, **not proof that a native
network request can be cancelled**. No in-flight provider job is cancelled by
SQL. A late response cannot complete the cancelled reservation. If a native Auth
identity appears later, it cannot gain Platform authority through that cancelled
request; fresh onboarding checks Auth absence and fails closed on a conflict.
That identity requires separately reviewed reconciliation. Never delete it by
email, automatically resend, or claim that a database transaction rolled Auth back.

A lost clearance response is retried with the **same request/target**; the
retained resolution makes that local-only operation idempotent. A fresh invite is
always a separate, explicit Master action with a new request ID. Completed or
linked invitations and operations with unknown ownership/absence are never cleared.

## Authoritative brand files inspected

Owner directory: `C:\Users\ranaz\Desktop\branding`.

1. `RetraSell-Brand-Guidelines.pdf` — all 24 pages extracted/read; rendered examples inspected.
2. `RetraSell-Brand-Guidelines.html` — editable guide/content and embedded font faces inspected.
3. `RetraSell-Project-Assets-PNG-SVG-Refined.zip` — actual SVG/PNG assets inspected.
4. `RetraSell-Asset-Manifest.json`.
5. `RetraSell-Asset-Manifest.csv`.
6. `RetraSell-Refinement-Technical-Report.md` — dated 15 October, describes the supplied refinement.
7. `RetraSell-Wordmark-Before-After.png` — inspected.
8. `RetraSell-Updated-Mockups.zip` — supplied illustrative mockups; not business requirements.

The final audit also found `branding 2.0/`, containing a newer final-C package,
24-page PDF, editable HTML, CSV/JSON manifests, technical report, updated mockups,
`RetraSell-Wordmark-Three-Way-Comparison.png` and
`RetraSell-Navigation-Header-Comparison.png`. Its technical report explicitly
identifies final optical state C. The PDF text differs only in the refinement
description; typography, palette and rules remain the same. Both mockup ZIPs contain
the overview, dashboard-light/dark, sales and website examples; none defines business
behavior. Both ZIPs passed CRC verification.

The effective CSS is inside the refined ZIP:
`Refinement-Documentation/retrasell-tokens.css`, copied unchanged to
`src/retrasell-tokens.css`. The root folder has the refined ZIP rather than the
older unqualified ZIP filename. The PDF/HTML and actual assets agree on primary
and reversed variants. The supplied SVGs use path lettering, exactly three accent
rectangles and the original viewBoxes/gradients. Copied image bytes are checked
against the final-C JSON and CSV manifest SHA-256 values. The two horizontal
SVGs were replaced byte-for-byte from `branding 2.0`; the other nine image files,
four embedded font weights and CSS tokens already matched that final package.
No geometry was edited or reconstructed by this implementation.

### Required public assets and references

| Exact stable path | Consumer |
|---|---|
| `/brand/logos/retrasell-horizontal-reversed.svg` | Navy sidebar and Auth brand panel; dark Auth card |
| `/brand/logos/retrasell-horizontal-primary.svg` | Light Auth card; invoice paper/print |
| `/brand/logos/retrasell-icon-primary.svg` | Light topbar compact identity |
| `/brand/logos/retrasell-icon-reversed.svg` | Dark topbar compact identity |
| `/brand/favicons/retrasell-favicon-gradient-16.png` | `index.html`, 16px favicon |
| `/brand/favicons/retrasell-favicon-gradient-32.png` | `index.html`, 32px favicon |
| `/brand/favicons/retrasell-favicon-gradient-48.png` | `index.html`, 48px favicon |
| `/brand/app/apple-touch-icon.png` | `index.html`, 180px Apple icon |
| `/brand/app/app-icon-192.png` | `/site.webmanifest` |
| `/brand/app/app-icon-512.png` | `/site.webmanifest` |
| `/brand/app/maskable-512.png` | `/site.webmanifest`, maskable purpose |
| `/brand/fonts/Inter-400.woff2` | Supplied embedded Inter 400, extracted unchanged |
| `/brand/fonts/Inter-500.woff2` | Supplied embedded Inter 500, extracted unchanged |
| `/brand/fonts/Inter-600.woff2` | Supplied embedded Inter 600, extracted unchanged |
| `/brand/fonts/Inter-700.woff2` | Supplied embedded Inter 700, extracted unchanged |
| `/brand/fonts/OFL.txt` | Official Inter redistribution license |

All original image filenames are preserved under `public/brand/`. The extracted
embedded fonts had no standalone filenames; the stable local weight filenames
above are explicit. The package mentioned a font license but contained no separate
OFL file; the official Inter license was retrieved from
https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt. The guide mentions
`favicon.ico`, but that file is not in the supplied ZIP; supplied PNG favicons are
configured instead. No fabricated ICO, placeholder logo or replacement art is used.

Inter/Arial/sans-serif, supplied weights, light `#F5F7FC/#FFFFFF/#0B1228/#2548D8`,
dark `#0B1228/#151E36/#F4F7FF/#A4B7FF`, accessible status/border/focus tokens and
navy sidebar are implemented. Functional controls are solid colors; the official
gradient stays in the supplied mark. Clear space/minimum sizes and aspect ratios
are retained. Fonts/assets are local; no new font CDN or email provider is added.

The supplied package identifies itself as refined and is incorporated locally.
**Owner optical/visual acceptance is still pending.** Replacement refined images
can overwrite these same filenames without frontend source changes; deploy/static
cache verification remains a separate authorized release step. No deployment or
final logo approval is inferred from the filename or local hash checks.

## Validation and evidence — original 2026-10-15 checkpoint

Evidence is outside Git in
`C:\Users\ranaz\Desktop\Development\RetraSellReviewEvidence\2026-10-15-ui`.
Screenshots contain synthetic data only. `before-*` uses the exact starting HEAD;
`after-*` uses the working source. Both themes and 320/768/1440px are represented.
The actual browser is installed Edge Chromium: installed Chrome exited before
Playwright startup. Chrome-specific acceptance is SKIP, not claimed as passed.

The final result/command/file-integrity ledger is recorded in that directory and
summarized in the dated readiness/history entries. Intermediate failures are
retained: a test regex typo, incomplete fixture/import/label/role assumptions,
mobile intrinsic-grid overflow and the unusable Chrome launch. Corrections are
retested; none is silently counted as a passing run.

The owner restored Docker's Linux engine and unlocked D:. Final local checks are
complete. Their earlier dependency failures remain in the evidence; they are not
counted as passes. No hosted validation or release approval follows from this result.

| Final local check | Result | Evidence / actual command |
|---|---|---|
| Selected source regression set | PASS — 286 tests, zero FAIL/SKIP | `regressions-restored.log`; exact 22-file `node --test` command in external `RESULTS.json` |
| PostgreSQL 17 database groups | PASS — 24 groups: six bootstrap, two canonical authorization, twelve lifecycle/review, four SQL/PostgREST isolation | `node tests/run-platform-team-local.mjs`; `sql-all.log` |
| Final forward-16 validator, populated upgrade, late SQL failure and concurrent clearance | PASS — one overlapping focused group, not added to 24 | `node tests/run-platform-team-local.mjs --review-only`; `sql-validator-restored.log` |
| Native local Auth and actual diagnostic | PASS — eight groups; explicit SDK/PostgREST adapters | `node tests/auth-provider-local.mjs`; `auth-native-diagnostic.log` |
| Eight affected Edge Function entrypoints | PASS — native Deno 2.4.5 checks | `deno-restored.log`; full command in `RESULTS.json` |
| Current browser layout/Team/Auth actions | PASS — six viewport/theme groups, plus action journeys | `node tests/team-lifecycle-browser.mjs`; `browser-final-assets.log` |
| Retained Edit Client and Manager/Billing browser journeys | PASS — three widths for each journey; client switch/logout/revocation denial | `node tests/client-modal-browser.mjs`; `client-modal-restored.log` |
| Historical before screenshots | PASS — six groups from exact starting source; comparison evidence only | `node tests/team-lifecycle-browser.mjs --baseline`; `browser-before-complete.log` |
| Synthetic production-mode Vite build | PASS — 75 modules, no mixed-import/build warnings | External `build-synthetic.mjs`; `build-final-assets.log`; env-file loading disabled, output outside Git |
| Source/configuration/integrity | PASS — 31 JavaScript syntax checks, TOML/manifest JSON, whitespace, unchanged migrations 1–15/Shop artifact/protected local and tracking refs | External `audit-local.py` and `source-integrity.json`; nothing staged |
| Imports/branding/privacy | PASS — no new literal-import cycles; eleven image hashes agree with final-C CSV/JSON; fonts/tokens match; 23 supplied contrast pairs meet stated thresholds; no new sensitive-value pattern match | `branding-integrity.json`, `contrast-verified.json`, source integrity ledger. Four pre-existing disposable fixture connection examples are explicitly accounted for |
| Chrome-specific startup, hosted SMTP/CAPTCHA/provider settings, hosted SDK/session acceptance, exact live invitation validity, forward-16 CLI history/connection-loss fault test | SKIP / unverified | No hosted connection, real email, replacement tool installation or manufactured migration history |

No final executed check failed. Intermediate FAIL/BLOCKED logs are retained,
including the ambiguous mobile navigation test selector, now narrowed to the
existing menu button. The before/after screenshot pairs cover Overview, Clients,
client detail, Billing, Support, Settings and login in both themes; after screenshots
also cover Team. Browser requests outside the loopback fixture were blocked and
none was attempted. Exact commands, outcomes and log SHA-256 values are in the
external `RESULTS.json`; application hashes are in `source-integrity.json`.

The native Auth adapter runs actual frontend diagnostic and password-handler
source against local GoTrue + SQL. It substitutes SDK/PostgREST transport, so
real browser SDK events/hosted provider configuration are not certified by it.
Browser transports/CAPTCHA are synthetic; no email or hosted destructive test is
performed. Token contrast checks are not a claim of full WCAG conformance.

## 2026-10-16 — Independent finding F1: invoice print typography/readiness

**Reproduced.** The separate print document named Inter without loading any
`@font-face` resources. The focused local-font-reference regression failed against
the unchanged starting implementation. Logo decoding also lacked a deadline.

Only `printInNewWindow()` changes in billing production source. It now declares
the existing local Inter 400/500/600/700 WOFF2 files using absolute same-origin
URLs and an explicit origin-only document base (no page path, query or fragment).
The files/license, artwork, filenames, invoice markup, financial calculations,
data selection, dimensions, currency formatting and all other billing functions
are unchanged. Fonts are explicitly loaded, matched faces must exist, and their
readiness plus logo readiness must complete before one print invocation. Cached
assets add no fixed delay; no external font service or fallback artwork is used.

A 15-second browser-timer deadline closes unsuccessful preparation and shows a
single app error instead of silently printing Arial or waiting forever. Valid
cached images bypass redundant decoding; failed/missing images, decode rejection
and font failures stop printing. A one-shot completion guard cleans timers and
listeners. A short watcher and pagehide cancellation close pending private content
on popup closure or lost original authority, with a final authority check directly
before printing. Popup creation remains synchronous inside the user gesture.

The native browser test found an adjacent cancellation race: closing a popup could
reject its font promise before its close event was processed, producing an asset
error. A separate failure-before/pass-after test now covers that order; an already
closed popup cancels quietly and cannot print or affect a successor session.

Exact follow-up file set:

- `src/billing.js` — print-document fonts/readiness, bounded failure and cancellation.
- `tests/ui-warnings.test.mjs` — actual print-function tests, both readiness orders,
  cached success, failures/timeouts, one-shot cleanup and authority/closure races.
- `tests/invoice-print-browser.mjs` — new narrowly scoped native popup/font/image
  tests using existing Vite and synthetic transport fixtures.
- `docs/PLATFORM_UI_BRANDING_REVIEW.md` — this finding, results and current manifest.
- `ENGINEERING_HISTORY.md` — append-only dated correction record.

| Follow-up validation | Actual result |
|---|---|
| `node --test --test-name-pattern='four local Inter' tests/ui-warnings.test.mjs` on original source | Expected FAIL — reproduces F1; retained in `f1-before.log` |
| `node --test --test-name-pattern='pending invoice printing' tests/ui-warnings.test.mjs` before close-race fix | Expected FAIL — reproduces cancellation/error ordering; `close-race-before.log` |
| `node --test tests/ui-warnings.test.mjs tests/platform-overhaul.test.mjs tests/platform-auth-dialogs.test.mjs tests/platform-role-loaders.test.mjs tests/session-authority.test.mjs` | PASS — 73 tests, zero FAIL/SKIP; `affected-regressions-final.log` |
| `node tests/invoice-print-browser.mjs` with existing Edge/Playwright paths | PASS — ten scenarios: fonts-first, image-first, cached repeat, missing image, decode rejection, failed font, stalled font, stalled image, popup close and authorization revocation; `invoice-browser-verified.log` |
| Synthetic Vite production build, env-file loading disabled, output outside Git | PASS — 75 modules; `build.log`; exact command/config in evidence |
| Three affected JS syntax checks, whitespace, stable font/asset integrity and scoped preservation audit | PASS; `follow-up-integrity.json` |
| Chrome/other engines, native OS dialog/printer output, hosted acceptance | SKIP — not executed |
| Full source/browser/PG17/Auth/CLI/Deno suites | Not rerun: no financial/authorization contracts, SQL, Edge source, dependencies or existing security implementation changed. Earlier results above remain dated evidence, not newly executed tests |

Browser tests use the actual generated document, native FontFaceSet/image decoding
and four loaded Inter faces. Only Auth/data transport and the final OS print call
are substituted. A cached second print makes no further asset requests. A minimal
probe isolated an installed Edge/CDP interception stall affecting document.write
popup resources; tests use an owned loopback proxy instead. It forwards only to
the local Vite server and denies all external destinations. No application request
was external; 94 Edge background CONNECT attempts were denied in the final run,
with no external forwarding. Earlier harness failures are retained and not counted
as passes. No production workaround for the interception problem was added.

Evidence is separate from the previous checkpoint at
`C:\Users\ranaz\Desktop\Development\RetraSellReviewEvidence\2026-10-16-invoice-print`.
It contains before copies, starting/final hashes, the exact incremental patch,
commands/results and logs. The starting 61 hashes matched the preceding ledger.
The 57 other starting files remain byte-identical; billing source outside the print
function is identical; earlier engineering-history content is retained verbatim.
Migrations 1–16, final-C images, Inter files/license, official tokens, Master/Team/
employee/diagnostic/RBAC code, default-disabled deletion and Shop artifact are
unchanged. The new test alone expands the inventory from 61 to 62 files.

The focused correction is ready for independent re-review. This does not approve
the complete PR or establish hosted acceptance. Browser timer throttling/suspension
can delay the deadline; an OS print job already initiated cannot be recalled.
Physical pagination/drivers and additional browser engines require separate manual
acceptance. PR #4 remains Draft/unmerged at the original committed HEAD. All existing
hosted/recovery/visual release gates remain; staging and production are **NO-GO**.

## 2026-10-16 — Migration 16 actual CLI atomicity verification

**Local migration-16 CLI atomicity: PASS. Overall PR/staging/production: NO-GO.**
Starting state was the exact F1 checkpoint: branch `feature/platform-team-lifecycle-v2`,
HEAD `71136819abbf36ef4fc36b69702c14a471582792`, 62 paths (33 modified/29 new),
all hashes matched, nothing staged. Only the existing CLI test file and this report/
append-only engineering history change in this round; no application or SQL changed.

Actual executable: `node_modules/.bootstrap-tools/supabase.exe`, **2.120.0**, SHA-256
`1cbedd6e494581a1c1d90113660113a06798d9967d19c857127b66b8a428e836`.
The same-version Go companion is not the db-push frontend and was not substituted.
No tool was installed or upgraded. Reviewed pinned sources:
[migration batching](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/migration-apply.ts),
[file transaction mode](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/migration-file.ts),
[single final Sync contract](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/db-connection.service.ts).
This file uses the transactional path, without authored transaction boundaries,
no-transaction directive, role-reset statements or pipeline-incompatible statements.
Its SQL and history insert enter the final extended-protocol batch together.
The injected history trigger inspects the **actual CLI-parsed statement array**
and verifies all new functions/column/history projection/grants exist before firing.
Thus success is not inferred merely from the absence of BEGIN/COMMIT.

Environment: cached official Supabase PG17 image `postgres:17.6.1.155`, native
GoTrue `v2.197.0` migrations (82 genuine Auth versions), real pgcrypto/Vault and
loaded supautils/provider policy allowlist. Minimal Storage/Realtime table fixtures
retain their provider owners; these are not full running Storage/Realtime services.
Migrations 1–12 use the established baseline fixture procedure; 13–16 execute as
non-superuser `postgres`, retaining the genuine database/schema owner and provider
policy capability. No internal-role membership or managed ownership transfer is
introduced. Only nonce-labeled owned containers/networks/databases are used.

All Platform versions 1–15 were applied by the real CLI. The empty and populated
version-15 databases are cloned from that genuine history, not manufactured with
INSERT/repair. Empty installation then applies 16 and remains unbound/unconfigured.
The populated fixture has one existing Master binding/config, five confirmed Auth
identities with owned sessions/AMR, two Active employees, two Pending reservations
(one linked, one failed/unlinked), one Inactive employee, one immutable archive,
one review-required creation, existing audit entries, client/invoice/payment records.

| Scenario | Actual result |
|---|---|
| Empty full-chain installation and repeated execution | PASS — all 16 genuine versions, exactly one version-16 row with statements; functions/column/grants valid; repeat leaves schema/data unchanged |
| Populated 15 → 16 upgrade and repeat | PASS — original binding, identities, reservation/snapshot, archive, audit, configuration and financial records retained; default-disabled deletion and policies unchanged |
| History INSERT rejection after completed SQL, empty and populated | PASS — CLI exits 1; history stays at 15, no version-16 functions/column/orphan grants; schema/data/policy fingerprints equal the pre-attempt state; removal of the test trigger permits one genuine success and a no-op repeat |
| Backend termination during history insertion, empty and populated | PASS — nonce/database/application-name/PgSleep PID gate proves the intended CLI session; terminating only that PID produces CLI failure and full rollback, followed by a clean retry |
| Termination before first ALTER executes | PASS — a test-only DDL-start gate pauses before the first change; termination rolls back and preserves version 15, then retry succeeds |
| Successful commit with lost client acknowledgment | PASS — a loopback PG-wire proxy suppresses the idle ReadyForQuery after history INSERT completes; CLI exits 1, but authoritative inspection finds **all changes committed and one genuine history row**. It is not rollback. Repeated CLI execution preserves that committed state |
| Concurrent native CLI attempts | PASS for integrity — actual statuses `[0,1]`; competing invocation fails with duplicate `resolution` column, rolls back, and cannot duplicate history/data. Authoritative final state is complete; subsequent retry is a no-op. Serialize runners; do not promise concurrent deployment success |

Preservation checks hash the complete public/private/managed-table schema (including
functions, grants, RLS, triggers and constraints), policy definitions, every table's
records in public/platform_private/Auth, and genuine prior Platform history. The
new `resolution` field's initialization is excluded from old-data equality; existing
nested JSON and every preceding record remain covered. Validation also executes
`supabase/bootstrap/validate-team-review.sql`, verifies Master/Manager/Billing
canonical roles, and denies employee/anonymous history access and forged service
clearance at the database boundary. No genuine migration-history row is inserted
by the test controller.

Final commands (from repository root):

```powershell
$env:ORBITO_BOOTSTRAP_CLI_PATH = (Resolve-Path 'node_modules/.bootstrap-tools/supabase.exe').Path
$env:ORBITO_BOOTSTRAP_EVIDENCE_DIR = 'C:\Users\ranaz\Desktop\Development\RetraSellReviewEvidence\2026-10-16-migration16-cli'
node --test --test-reporter=tap --test-name-pattern='migration 16 actual CLI' tests/production-bootstrap-cli.test.mjs
node tests/run-platform-team-local.mjs --review-only
node --check tests/production-bootstrap-cli.test.mjs
git diff --check
```

PASS: nine CLI scenarios (Node reports ten tests including their parent), zero
FAIL/SKIP in the final CLI run; one existing focused SQL/security group, zero
FAIL/SKIP. Earlier runs failed on a missing required synthetic client field and
administrator-owned clones lacking the caller's ordinary public-schema CREATE
permission. Only fixture data/ownership was corrected; failures remain logged.
No migration defect or security relaxation was required. All owned test resources
were cleaned up after verified label/name ownership. Evidence contains exact source/
CLI/image identities, catalog checks in the test, outcomes, sanitized CLI failures,
source/log hashes and initial/final Git state; generated work is outside Git.

Safe recovery rule: after a lost connection, inspect the authoritative primary's
version-16 history, functions/column/grants and prior retained state. If committed,
do not replay SQL. If history is absent and all version-16 changes are absent after
the failed session ends, retry through CLI. If unavailable, mixed or contradictory,
stop for recovery review; never manufacture history or guess that failure rolled back.

Limits / SKIP: no hosted database, TLS/pooler/proxy topology, real failover/recovery,
disk/crash durability or exhaustive interruption timing is tested. One post-commit
acknowledgment-loss boundary is reproduced, not every network failure window. The
full migration chain is not one all-or-nothing transaction; this result concerns
version 16, with earlier versions genuinely committed separately. Full frontend,
browser, Auth HTTP and Deno suites were not rerun because those sources are unchanged.
This does not establish hosted permissions, Vault portability or overall PR approval.
Evidence: `C:\Users\ranaz\Desktop\Development\RetraSellReviewEvidence\2026-10-16-migration16-cli`.

## Remaining gates and future component plan — do not execute now

1. Independent review of this **uncommitted** change set and final owner visual/
   optical approval of the integrated refined artwork.
2. Separate authorization for a fresh hosted read-only inventory, exact migration
   history/dry run, configuration checks and recoverable backup. Do not assume
   which PR #4 migrations are already applied. Preserve every real identity/record.
3. Coordinate a Team/identity write freeze. Verify reviewed pending versions in
   order; migration 16 follows 15. Use the established credential-safe pinned CLI
   cutover procedure; never manually manufacture migration history. Migration-16
   local SQL rollback and its actual CLI history/connection/acknowledgment-loss
   scenarios now pass as recorded above. Hosted cutover/backup/permissions and
   primary-state inspection after uncertain outcomes remain separate gates.
4. Review/rebuild matching shared-source bundles: `create-platform-user`,
   `update-platform-user`, `delete-platform-user`, `deactivate-platform-user`,
   `reactivate-platform-user`, `resend-platform-invitation`,
   `platform-password-setup`, and new `clear-failed-platform-invitation`.
   Preserve JWT verification and the existing staging-only
   `PLATFORM_TEAM_SITE_URL`/managed runtime secrets. No new email service or secret
   is needed. Unrelated bridge/config/provision/support functions are unchanged.
5. Deploy the matching frontend only after separate authorization and compatible
   backend/migration readiness. Do not merge Draft PR #4 or trigger a preview now.
6. Owner-assisted native CAPTCHA/SMTP/invitation/recovery, rate limits, employee
   lifecycle/roles, session events and refresh acceptance using separately approved
   reversible/disposable accounts. Exact native link validity is not proven here.
7. A separately authorized Master diagnostic may sign the operator out in unsafe
   provider configurations. Preserve the original login and recovery custody.
   Neither a local nor a hosted diagnostic PASS enables deletion. The policy stays
   FALSE pending its own independent review and explicit owner approval.
8. Existing provider/Vault backup portability, recovery rehearsal, legal publication,
   production separation and frozen Shop release gates remain in force.

Proposed future commit grouping, **only if separately authorized**: (1) forward
security commands/handlers and focused tests, (2) presentation/Team/official assets
and browser tests, (3) updated review/history/evidence inventory. Keep existing
Draft PR #4 and inspect deployment triggers before any authorized push.

## Exact local changed-file manifest

The following section is generated from the final Git status; no ignored evidence,
build output, environment file, credentials or unrelated file is included.

Current inventory after both 2026-10-16 follow-ups: **63 files — 34 modified, 29 new;
none staged**. The follow-up evidence's `source-integrity.json` records each
file's SHA-256, status and size. The exact
path list follows; the frozen artifact and existing fifteen migrations are absent
because they are unchanged.

| Status | Exact repository path |
|---|---|
| modified | `ENGINEERING_HISTORY.md` |
| modified | `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md` |
| modified | `docs/PRODUCTION_BOOTSTRAP.md` |
| modified | `docs/PRODUCTION_READINESS_REPORT.md` |
| modified | `index.html` |
| modified | `src/billing.js` |
| modified | `src/dialogs.js` |
| modified | `src/events.js` |
| modified | `src/forms.js` |
| modified | `src/main.js` |
| modified | `src/modals/index.js` |
| modified | `src/modals/users.js` |
| modified | `src/pages/clients.js` |
| modified | `src/pages/settings.js` |
| modified | `src/pages/support.js` |
| modified | `src/render.js` |
| modified | `src/state.js` |
| modified | `src/styles.css` |
| modified | `src/supabase.js` |
| modified | `src/team-errors.js` |
| modified | `supabase/config.toml` |
| modified | `supabase/functions/_shared/platform-team-v2.ts` |
| modified | `tests/auth-provider-local.mjs` |
| modified | `tests/auth-ui-ownership.test.mjs` |
| modified | `tests/client-modal-browser.mjs` |
| modified | `tests/dialogs.test.mjs` |
| modified | `tests/frontend-races.test.mjs` |
| modified | `tests/helpers/platform-team-fixture.mjs` |
| modified | `tests/platform-auth-dialogs.test.mjs` |
| modified | `tests/production-bootstrap-cli.test.mjs` |
| modified | `tests/run-platform-team-local.mjs` |
| modified | `tests/team-lifecycle-browser.mjs` |
| modified | `tests/team-lifecycle-postgres.test.mjs` |
| modified | `tests/ui-warnings.test.mjs` |
| new | `docs/PLATFORM_UI_BRANDING_REVIEW.md` |
| new | `public/brand/app/app-icon-192.png` |
| new | `public/brand/app/app-icon-512.png` |
| new | `public/brand/app/apple-touch-icon.png` |
| new | `public/brand/app/maskable-512.png` |
| new | `public/brand/favicons/retrasell-favicon-gradient-16.png` |
| new | `public/brand/favicons/retrasell-favicon-gradient-32.png` |
| new | `public/brand/favicons/retrasell-favicon-gradient-48.png` |
| new | `public/brand/fonts/Inter-400.woff2` |
| new | `public/brand/fonts/Inter-500.woff2` |
| new | `public/brand/fonts/Inter-600.woff2` |
| new | `public/brand/fonts/Inter-700.woff2` |
| new | `public/brand/fonts/OFL.txt` |
| new | `public/brand/logos/retrasell-horizontal-primary.svg` |
| new | `public/brand/logos/retrasell-horizontal-reversed.svg` |
| new | `public/brand/logos/retrasell-icon-primary.svg` |
| new | `public/brand/logos/retrasell-icon-reversed.svg` |
| new | `public/site.webmanifest` |
| new | `src/modal-focus.js` |
| new | `src/pages/team.js` |
| new | `src/retrasell-tokens.css` |
| new | `src/team.js` |
| new | `supabase/bootstrap/validate-team-review.sql` |
| new | `supabase/functions/clear-failed-platform-invitation/index.ts` |
| new | `supabase/migrations/20261015003232_platform_team_invitation_review.sql` |
| new | `tests/helpers/platform-browser-fixture.mjs` |
| new | `tests/invoice-print-browser.mjs` |
| new | `tests/master-continuity.test.mjs` |
| new | `tests/team-review-corrections.test.mjs` |


## 2026-10-17 — Scoped forensic F1/F2/F3 correction status

This dated note supersedes earlier local/uncommitted counts only for the current
forensic correction set. Parent: `d3fc517aabb2b5d09ea939aa56830287b5d89bba`.
Migrations 1–16, frozen Shop release, branding and dependency locks are unchanged.
New forward migration: `20261016160517_pr4_security_corrections.sql`.

- F1: unchanged confirmed successor email is editable; real email collisions,
  UUID identity/archive/tombstone and role protections remain.
- F2: privileged support uses a private Master-approved origin and exact current
  pairing, never editable `clients.shop_url`. No automatic backfill. Master calls
  `platform_support_destination_review(client)` to review current pairing and any
  prior approval, independently verifies the deployed origin, then explicitly calls
  `platform_approve_support_destination(client, origin, project, binding, source,
  expected_revision, reason)` (NULL revision for the first approval). Stale approval
  revisions remain reviewable for governed replacement; handoff fails closed until
  current approval. Neither Manager nor Billing can approve. Re-pair/Master revision
  changes invalidate old grants. Issuance, consumption and browser validate revision.
- F3: durable commercial-intent generation, row-lock serialization and explicit
  current-plan reconciliation prevent old completions from erasing newer intent.
  Same-plan metadata edits retain custom modules. Uncertain requests retain their
  lock; a matching read is observation only. Master recovery retries the exact old
  UUID/payload through the shipped journal before allowing later commercial changes.
  Suspension-only completion cannot falsely clear pending plan synchronization.
  Duplicate/applied recovery responses also verify current intent before success.

Validation: original independent reproductions confirmed all three defects; new
correctness tests failed before and passed after. Final PASS: 296 source tests,
30 PG17 groups, 9 CLI-17 scenarios (10 including parent), 8 native Auth groups,
four actual Chromium suites, 12 Deno entrypoints, synthetic production build and
syntax/whitespace/integrity checks. Earlier failed/interrupted attempts remain in
external evidence at `RetraSellReviewEvidence/2026-10-16-F1-F2-F3`. The two previously
blocked checksum-fixture cases passed using the existing local fixture; no Shop
integrity bypass was introduced. The separate cross-repository PGlite suite was not
run. Journal SQL on a minimal substrate proves local idempotency, not a full Shop.

**Staging and production remain NO-GO.** D1 provisioner drift is unchanged. Hosted
Manager client operations, provisioning/Shop, changed-plan sync, same-plan custom
preservation, finance/addons, Support exchange, provider Storage/Realtime/GraphQL
and production tests remain separate gates. No real email, hosted session-policy
or full provider integration claim follows from local fixtures.

Separately authorized rollout order: fresh backup/maintenance and drain/resolve
config jobs; migration 17 (refuses sending/uncertain jobs); matching config/support
Edge bundles; independently verified Master support approvals; matching frontend;
scoped hosted acceptance. Preserve deletion FALSE. Inspect history/catalog before
retrying an ambiguous CLI result: post-commit acknowledgment loss can be committed.
The approved feature-only push must use the native skip marker and verify the actual
provider skip. No merge/deploy or full documentation finalization is included.


### 2026-10-17 — N1/N2 lightweight follow-up

N1 now rejects conflicting config payloads and verifies fresh matching generation /
`pending=false` before commercial success. Unapplied migration 17 excludes legacy
writers before preflight and rejects unversioned queued reservations at commit.
Migrations 1–16 remain unchanged. Five lightweight Node tests and JS syntax pass;
N2 PostgreSQL/concurrency/rollback, revised CLI atomicity and browser fixtures are
written but NOT executed this round. No SQL parser is installed. Earlier broad
PASS counts refer to the preceding commit. Independent Work must validate these
revised bytes; D1, hosted acceptance and staging/production NO-GO remain unchanged.
