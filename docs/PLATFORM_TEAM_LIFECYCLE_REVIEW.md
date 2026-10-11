# Platform team lifecycle V2 — local review and rollout gate

Date: 2026-10-11 (Asia/Karachi). Base: `development` at
`0dbde676ca57ed1599a295e221d274ef080cac41`. Branch:
`feature/platform-team-lifecycle-v2`. Local implementation only; draft PR,
skip-prefixed commit, no merge or hosted deployment is authorized by this work.

## Confirmed causes and corrected contracts

The prior startup recognized only PASSWORD_RECOVERY, although invitation sessions
can arrive as SIGNED_IN or INITIAL_SESSION. The old password handler ignored
`platform_accept_invite` errors. Old Remove revoked the team row and deleted Auth
without an archive or a durable reconciliation record. Browser grants permitted
direct team updates outside the server audit boundary.

The new router captures link hints before SDK initialization, scrubs credential
fragments before rendering, verifies Auth and canonical setup context, and routes
Pending sessions to password setup regardless of callback event. A reset query
alone does not put an existing Master into onboarding. Auth callbacks defer SDK
work outside its lock. Logout/finish/cancel clear hints and cancel queued work so
the next ordinary login does not reopen recovery. Invalid/expired/revoked/consumed
links and recording races have explicit error/retry states.

Password setup now calls a JWT-protected server, which verifies the exact live
UUID and Pending record or approved recovery proof. The caller's Auth bearer
updates their password; a successful matching Auth response is recorded before
the service-only acceptance RPC may activate the row. Failed acceptance is not
success. A saved-password retry resumes activation without saving another password.
A network-uncertain password update remains blocked for reviewed cancellation.
Manager and Billing onboarding retain their previously assigned role.

| State | Authorization and actions |
| --- | --- |
| Active | Original Manager/Billing role; Edit, Deactivate, Delete Permanently. |
| Pending | No ordinary Platform authority; invitation status, Deactivate/cancel, Delete Permanently. |
| Inactive | Auth UUID and assigned role retained, ordinary authority denied even with an old JWT. Reactivate initiates recovery; status stays Inactive until checked password setup. |
| Archived | Immutable Master-only history with original IDs, role, dates, actor, request and reason. No restore/edit/reinvite through ordinary controls. |

There is **no separate Send Password Reset Email button**. Reactivate generates a
Supabase recovery link for the existing Auth UUID, stores only its digest in the
private operation, and sends the link to the employee. No invitation/new Auth user
is created. Formerly Pending employees also finish checked password setup before
becoming Active. Existing provider bans are never silently removed.

Legacy Inactive rows have no known reversible origin (`suspended_from` remains
NULL). Reactivate is unavailable. Missing/null Auth links are never adopted or
recreated. An unlinked row whose email belongs to an Auth account blocks deletion
for reviewed reconciliation; email matching never authorizes deleting that account.
A truly absent legacy Auth identity can be archived after password-confirmed
Master approval and database verification of UUID/email absence.

## Permanent deletion and uncertainty

The custom dialog requires the canonical Master account, current password, fresh
CAPTCHA and explicit acknowledgment. An independent, memory-only Auth client
verifies the password through Supabase's CAPTCHA-protected password grant, checks
the returned UUID and confirmed/active state, and signs out only that verification
session. Cleanup failure blocks deletion. Repeated canonical Master checks precede
mutation; service-role construction follows the destructive verification.

One request/target/actor identifies the durable operation. Target advisory locks
and one open-operation index serialize changes. Only the reservation winner may
dispatch an external Auth mutation; repeated calls cannot resend or clobber the
first caller's review state. Required start audit and status revocation commit
together. Dispatch is recorded before Auth deletion. Archive insertion, removal
of the live row, completion and final audit commit together only after actual Auth
absence is verified. Concurrent password completion and deactivation serialize;
deactivation cancels setup and the final status remains Inactive.

If Auth deletion is uncertain, keep the row Inactive and show the same request for
"Verify deletion outcome". That action re-verifies Master password/CAPTCHA and
only reconciles database-proven absence; it never repeats the Auth delete. If the
Auth identity still exists, stop for recovery review. Never restore insecure
handlers, fabricate history, delete by email or blindly retry a provider mutation.
An archive or required audit failure after Auth deletion leaves a restricted live
row and durable operation, permitting later same-request absence reconciliation.

Creation/edit uncertainty also remains visible and blocks conflicting operations.
There is no automatic adoption/reinvite or guessed rollback. Any finish_create or
finish_edit recovery needs separately reviewed provider evidence of the exact
UUID/request and original intended data. A newly created identity with an uncertain
invitation cannot be assumed absent because no UUID was attached to the live row.

Incoming team/Auth foreign keys are migration blockers until retention is reviewed.
Storage ownership (legacy owner and owner_id) blocks deletion until an explicitly
approved transfer. Missing Storage inventory blocks deletion. Platform financial,
client, provisioning and support ledgers are not removed. Auth deletion permanently
removes provider-owned Auth records; local archive restoration does not recreate
passwords or sessions. Loaded browser data cannot be erased by deactivation.

## Native recovery boundary and required email configuration

The public recovery function verifies fresh Turnstile server-side, checks the
trusted hostname, applies a database rate limit, and checks account state before
issuing anything. Inactive returns the owner's exact contact-administrator
message. Unknown, Pending and Archived addresses receive a generic response and
no email. Active delivery runs through EdgeRuntime.waitUntil to avoid disclosing
known addresses through transport errors/latency; failures are audited using only
request UUID/outcome. Background delivery is best effort within worker limits,
not a durable email queue and never an automatic resend loop.

**UI/Edge recovery checks alone do not block Supabase's native /recover endpoint.**
`platform-auth-email` implements the signed Supabase Send Email Hook. The actual
Standard Webhooks verifier checks signatures/timestamps; the database context
denies native recovery mail for Inactive/Pending/Archived and UUID drift. An
admin-generated reactivation link uses a separate hash-bound delivery path; no
broad approval window permits native self-service recovery while Inactive.

The [official Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
replaces SMTP for **all** Auth emails. This implementation chooses a server-side
Resend transport; that provider choice, verified sender and required configuration
need owner approval before hosted rollout. Do not enable the hook or lifecycle
feature on the assumption the existing SMTP settings will continue delivering.
Supported email types are invite, signup, recovery, magiclink and secure email
change (including the reversed current/new-recipient hashes). Other enabled Auth
notification types fail closed and need template/transport review before enabling
the hook. Review current Auth version, enabled providers, signup/OTP settings,
redirects, CAPTCHA, rate limits and email notifications before cutover.

Required server names (never Vite/browser values):

- Supabase-managed SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
- PLATFORM_TEAM_SITE_URL: approved HTTPS frontend origin.
- PLATFORM_AUTH_RESEND_API_KEY and PLATFORM_AUTH_EMAIL_FROM: approved transport.
- PLATFORM_AUTH_HOOK_SECRET: matching provider-generated signed-hook secret.
- PLATFORM_AUTH_TURNSTILE_SECRET: matching approved public site key and hostname.
- PLATFORM_AUTH_EMAIL_GUARD_READY: initially absent/false; set true only after
  separately authorized native-endpoint/email-hook verification. It is an operator
  attestation, **not automatic evidence the provider hook is configured**.

The exact Inactive message intentionally reveals deactivation for a submitted
address after CAPTCHA. The native hook's rejection can also disclose eligibility.
Unknown addresses remain generic; do not claim absolute resistance to account
enumeration. Previously issued Active recovery links or old JWTs may still change
an Auth password through native Auth, but cannot activate an Inactive row without
the approved operation/proof. An Active request may race deactivation before mail
arrival; it cannot restore Platform authority. Already initiated retry responses
do not claim delivery was confirmed. Resend acceptance is not proof of inbox receipt.

Tokens/passwords/CAPTCHA stay transient; no logs or admin responses disclose
recovery links. The stored recovery proof expires after 30 minutes in addition to
Supabase's configured single-use OTP expiry. Provider expiry is independently
enforced by verifyOtp. A page reload after fragment scrubbing loses an Inactive
proof; do not persist it in browser storage. Master cancellation and a newly
approved Reactivate can recover that case. An interrupted password-setting claim
requires the same controlled recovery, not a guessed successful password update.

## Database/function footprint

Only forward migration `20261010233446_platform_team_lifecycle_v2.sql` is added;
the CLI generated its timestamp. All 12 historical migrations and the committed
Shop release artifact are unchanged. The new migration adds archive/operations/
recovery-rate storage, unique mappings, transition guards and service-only command/
password/email RPCs; revokes browser and service direct team writes, retires the
JWT-only acceptance bypass and preserves UUID-based canonical role authorization.
It preserves the existing historical immutable audit trigger rather than creating
a colliding replacement. Archive/audit writes cannot be altered by browser/service
clients. Database-owner recovery remains a trusted administrative boundary.

Changed existing handlers: create-platform-user, update-platform-user,
delete-platform-user. New handlers: deactivate-platform-user,
reactivate-platform-user, platform-password-setup, platform-password-recovery,
platform-auth-email. JWT is enabled for the six privileged/setup handlers. Public
recovery uses CAPTCHA; the hook uses cryptographic signatures (their gateway JWT
flags are false by design). The other four Platform functions are unchanged.

There is no authored transaction boundary, concurrent index, VACUUM, COPY FROM
STDIN or other flush-requiring statement in the new migration. CLI 2.120.0 owns
the batch and genuine history insertion. Local CLI tests reject history insertion
after all feature SQL/grants execute, prove full rollback and unchanged Master,
then remove only the fixture fault and obtain exactly 13 genuine history rows.
An unchanged second push is a no-op. SQL-only late-failure tests do not substitute
for that actual CLI evidence. New-feature connection loss after a successful commit
acknowledgment is not locally proven; inspect history/state before any retry. The
older bootstrap interruption/flush negative-control tests remain available.

## Reproducible local evidence

Prerequisites: existing Docker Linux engine, cached PG17 `17.6.1.155` and GoTrue
`v2.197.0`, pinned Supabase CLI 2.120.0, Deno 2.4.5, Node, existing Chrome/Playwright.
No dependency installation or existing-container/volume changes are required.
Missing opt-in prerequisites are failures/blockers, never passing validation.

| Check | Final result and scope |
| --- | --- |
| Broad Node regressions | PASS: 221, zero failed/skipped; actual source, explicit Auth/mail doubles; older PGlite crypto/Vault substitutes are not encryption proof. |
| Bootstrap database groups | PASS: 6 on real disposable PG17/Auth/Vault schemas. |
| Canonical pre/post UUID database groups | PASS: 2 plus repeated focused handler cases; verified-session transport doubles remain explicit. |
| Lifecycle database groups | PASS: 6, including roles, Pending password gates, old JWT denial, proofs/expiry/cancel, provider bans, storage ownership, audit failures, archive/reconciliation and concurrency. Synthetic Storage table tests both ownership columns; not a running Storage service. |
| Actual CLI new-migration regression | PASS: fresh and staging-style history-insert failure, unchanged schema/data/grants/identity, clean retry and no-op repeat; genuine history only. |
| Real Standard Webhooks tests | PASS: 2, valid/invalid/expired signatures, native recovery suppression and secure email-change recipients, mocked mail transport. |
| Native Deno checks | PASS: all 8 entrypoints with actual pinned imports; no no-check fallback. |
| Real local browser | PASS: 6 groups, 320/768/1440px, light/dark; actual Settings/dialog/events/styles, keyboard/focus/cancel, CAPTCHA gate, one-shot submit, rerender/logout, escaping and no external traffic. Provider/CAPTCHA responses are synthetic. |
| Vite build | PASS: all Vite configuration supplied synthetically, output under ignored test tooling; existing Vite CJS deprecation remains. |
| Syntax/whitespace/secret and immutable-file review | PASS at final checkpoint; no evidence/build output or private configuration committed. |
| Hosted/native Auth OTP, gateway, SMTP/Resend, session-refresh and real email delivery | SKIP: no hosted authorization; not proven by the mocks, database schemas or local browser. |

During development real SQL exposed an existing audit-trigger collision, which
was corrected by preserving the historical trigger. Old disposable fixtures also
needed narrowly scoped owner seeding around the new mutation guard. Production
permissions were not relaxed. Test-only case-sensitive/cross-realm assertions
were corrected. Initial browser launch without the executable setting skipped;
supplying the existing Chrome path produced the six actual passing groups.
Both owned Docker runners completed and cleaned up successfully. A subsequent
engine-availability check was BLOCKED because Docker's Linux pipe became
unavailable; this does not turn that later check into a pass or invalidate the
earlier completed database/CLI results. No further environment repair was attempted.

Commands from the repository (all targets created by these runners are disposable):

```powershell
node tests/run-platform-team-local.mjs
$env:ORBITO_BOOTSTRAP_CLI_PATH=(Resolve-Path node_modules/.bootstrap-tools/supabase.exe).Path
node --test --test-name-pattern='team lifecycle CLI' tests/production-bootstrap-cli.test.mjs
$deno='node_modules/.bootstrap-tools/deno-2.4.5/deno.exe'
& $deno test --node-modules-dir=none --allow-env tests/team-email-hook.test.ts
$env:PLAYWRIGHT_MODULE_PATH='C:\Users\ranaz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
$env:CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/team-lifecycle-browser.mjs
$env:VITE_PLATFORM_URL='https://synthetic.invalid'
$env:VITE_PLATFORM_ANON='synthetic-public-fixture'
$env:VITE_PLATFORM_AUTH_EMAIL='master@example.test'
$env:VITE_TURNSTILE_KEY='synthetic-captcha-fixture'
npm run build -- --outDir node_modules/.bootstrap-tools/team-v2-build
```

## Ordered staging rollout — separate approvals required

1. Independent source review and owner approval first. Reconfirm reviewed HEAD,
   staging identity, current 12 genuine migration rows, bound Master and deployed
   function inventory. Inventory duplicates, legacy null/missing/banned identities,
   Storage ownership and custom references without changing users. Take a new
   comprehensive staging backup and coordinate a team/identity maintenance freeze.
2. Approve the email provider/sender/templates and Auth-hook availability. Preserve
   current Auth/SMTP/CAPTCHA/redirect settings and recovery evidence. Confirm the
   invitation/recovery allowlist includes the staging `/?reset=true` route. Resolve
   every unsupported enabled email type. Rehearse the coordinated release locally.
3. Using credential-safe pinned CLI 2.120.0, dry-run staging and confirm only the
   new migration is pending. After explicit migration authorization, apply that
   single forward migration. Verify 13 genuine history rows, unchanged bound Master,
   retained ledgers/users/config, exact grants and new guards. Old team writes now
   fail closed; do not restore the old acceptance/direct-write bypass for availability.
4. After deployment/secret authorization, configure approved server transport and
   deploy exactly the eight handlers listed above, preserving their gateway flags.
   Keep the readiness attestation false. Compare deployed bundles with reviewed
   source and verify unrelated functions remain unchanged.
5. After separate Auth-configuration approval, enable the signed Send Email Hook.
   Using specifically approved disposable accounts and mailboxes, verify native
   /recover for Inactive/Pending/Archived sends no email, Active recovery works,
   hook signature failures deny delivery, all enabled email types work and public
   signup/OTP routes cannot bypass Platform activation. Do not probe real accounts.
   Verify configured OTP expiry and single use. Only then attest readiness=true.
6. Before enabling destructive team operations, verify the server password grant
   respects CAPTCHA/rate limits and does not invalidate the original Master's
   refresh session under the project's actual single-session/Auth settings. Mocks
   do not prove that. If it fails, stop for a separately reviewed provider-supported
   reauthentication design; never weaken CAPTCHA or cleanup.
7. Separately authorize merge/frontend staging deployment. Check frontend project
   variables target staging, and hooks cannot migrate or deploy other environments.
   The future merge commit message must exclude the feature-only Cloudflare skip
   marker; review the entire title/body rather than copying source commit messages.
   A preview/build does not prove backend deployment. Smoke login, Clients, Team,
   Billing, Settings/PIN, navigation, refresh, mobile/desktop and error states.
8. With disposable-account authorization only, test Manager/Billing invites in a
   private browser (SIGNED_IN/INITIAL_SESSION), password failures and activation
   retries, normal role restrictions, deactivation with an old JWT, Reactivate
   retaining the UUID and remaining Inactive until setup, cancelled/expired links,
   direct native recovery denial and tombstones. Test wrong Master password/CAPTCHA,
   original Master refresh continuity, successful Pending/Active deletion and
   archived read-only evidence. Never delete or change a real employee for smoke.
9. Resume writes only after validations pass. Any provider uncertainty requires
   same-request inspection under continued containment, not automatic retry or
   rollback to legacy handlers. Preserve backups/audit. Auth deletion, delivered
   emails and password changes cannot be undone by a Git rollback. No production
   or Shop rollout is included; each requires its own reviewed authorization.

## Exact source/documentation/test file manifest

42 intentional files at the checkpoint; ignored local evidence/builds are excluded.

- `ENGINEERING_HISTORY.md`
- `deno.lock`
- `docs/PLATFORM_TEAM_LIFECYCLE_REVIEW.md`
- `src/auth-setup.js`
- `src/dialogs.js`
- `src/events.js`
- `src/forms.js`
- `src/main.js`
- `src/modals/users.js`
- `src/pages/settings.js`
- `src/render.js`
- `src/styles.css`
- `src/supabase.js`
- `src/turnstile.js`
- `supabase/config.toml`
- `supabase/functions/_shared/platform-team-v2.ts`
- `supabase/functions/_shared/platform-team.ts`
- `supabase/functions/create-platform-user/index.ts`
- `supabase/functions/deactivate-platform-user/index.ts`
- `supabase/functions/delete-platform-user/index.ts`
- `supabase/functions/platform-auth-email/index.ts`
- `supabase/functions/platform-password-recovery/index.ts`
- `supabase/functions/platform-password-setup/index.ts`
- `supabase/functions/reactivate-platform-user/index.ts`
- `supabase/functions/update-platform-user/index.ts`
- `supabase/migrations/20261010233446_platform_team_lifecycle_v2.sql`
- `tests/auth-setup.test.mjs`
- `tests/onboarding-stabilization.sql`
- `tests/platform-auth-dialogs.test.mjs`
- `tests/platform-identity-consistency.test.mjs`
- `tests/platform-overhaul.sql`
- `tests/platform-team-database.test.mjs`
- `tests/platform-team.test.mjs`
- `tests/production-bootstrap-cli.test.mjs`
- `tests/production-bootstrap.test.mjs`
- `tests/run-platform-team-local.mjs`
- `tests/support-access.sql`
- `tests/support-handoff.sql`
- `tests/team-email-hook.test.ts`
- `tests/team-lifecycle-browser.mjs`
- `tests/team-lifecycle-postgres.test.mjs`
- `tests/ui-warnings.test.mjs`
