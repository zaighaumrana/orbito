# Onboarding V2 stabilization and Client Detail cleanup — 2026-10-01

Both requested prompts are implemented and validated locally. Platform and Shop remain on `feature/onboarding-v2`; the changes are uncommitted. No commit, push, merge, deployment, remote migration, hosted-secret modification or scheduler cadence change was performed. The legal repository was not inspected or modified. Production Client 1 was not accessed: its live state is not claimed as verified.

## Inspection and implementation plan

Before edits, trace both complete migration chains, actual table/column/sequence grants and RLS, Shop login and account-admin dependencies, owner reservation/activation, six wizard controllers, inline logo persistence, config projection, provisioning retries, pairing generation, existing tests and docs. Then fix the narrow permission/configuration/readiness failures; retain published migration history; provide deterministic cross-account setup; replace only the Client Detail setup presentation; run both suites/builds and disposable full SQL replay; review identity and secret boundaries adversarially. This report records that plan and the resulting implementation.

## 1. Root causes and exact fixes

1. Platform's previous column grants did not cover all V2 Add Client fields. The earlier table-level fix is retained; the latest forward migration supplies SELECT/INSERT/UPDATE while existing RLS limits creation/editing to master/portfolio operators. A direct-update trigger prevents that broader table grant from bypassing audited pricing, currency, entitlement and identity operations. DELETE is unavailable.
2. Shop service-role RLS bypass did not confer `shop_config` SELECT or settings UPDATE privileges. Explicit service grants now cover actual Edge dependencies, including employee rollback and password-reset sequences. Browser roles receive no private-config table access; protected RPCs remain their interface. An account-admin 403 is not assumed to be JWT failure: verified user/profile/suspension checks remain intact, and safe endpoint errors reach the UI.
3. Browser CAPTCHA configuration does not provide server `TURNSTILE_SECRET`. Setup separates public browser values, Supabase built-ins, pairing settings, required server CAPTCHA, and optional Support settings. Normal owner login does not depend on the Support group. Missing required browser build variables fail with their names.
4. Old infrastructure readiness checked reservation/bridge/projection but missed broken functions, grants and runtime dependencies. Readiness now requires the current 14-check contract, real service-client config read, actual Shop Auth API availability, protected probes of five normal functions, immutable reservation/binding, bridge mode/configuration, Shop projection and a matching enabled Platform source registry. Bootstrap refreshes status after projection instead of saving its earlier pending snapshot. Unknown refresh outcomes reuse the existing retry job.
5. Platform frontend inferred master identity from build-time email while username was stored separately. A verified Auth user UUID and server-authorized `platform_operator_identity()` now establish the role for login/restoration. The canonical identity is the existing server-authorized UUID, not a hardcoded email. A final read-only hosted trace confirmed the current UUID-based operator function; checkpoint migrations preserve it. `admin_username` is a display/login alias. Actual-email login works without the optional alias-email variable. Passwords stay in Auth. The prior claim that `platformadmin@retailos.internal` was the unchanged hosted master email was incorrect; it is a historical SQL literal/test fixture only.
6. Cloudflare/Client ID ordering was undocumented. Reserve the Pages hostname first, Add Client using it, copy the displayed ID, then deploy. Fresh V2 ownership comes from the secure bridge reservation; no insecure runtime discovery was added. Optional legacy public usage variables can be supplied after client creation.
7. Client Detail exposed a technical text wall and competing actions. The new component provides a copyable ID/header, six lifecycle stages, compact health/owner/features cards, one dominant state-dependent action, collapsed technical details and a five-stage BYO guide with copyable commands. Legacy clients use the same shell, with existing cutover controls under Advanced and no V2 bootstrap controls. Phone layout puts the next action first and has no horizontal overflow at 390px.
8. Adversarial follow-up found an approximate logo bound and readiness that missed a reserved-email staff mapping. The endpoint now validates decoded PNG/JPEG/WebP data at an exact 512 KiB limit. Preflight reports existing conflicting app_users identity as conflict; Platform guidance asks for reconciliation instead of another Auth account. An unused duplicate Shop-link renderer was removed. A malformed dollar delimiter in a new SQL fixture was corrected before the successful final replay.

## 2. Exact changed files in this combined pass

Paths below are relative to their named allowed repository. This inventory includes untracked additions without staging them.

Platform `C:\Users\ranaz\Desktop\Development\orbito`:

- `src/client-setup.js` (new), `src/events.js`, `src/forms.js`, `src/main.js`, `src/modals/index.js`, `src/pages/clients.js`, `src/provisioning.js`, `src/styles.css`, `src/supabase.js`.
- `supabase/functions/_shared/onboarding.ts`, `vite.config.js`.
- `supabase/migrations/20261001100000_onboarding_v2_client_write_grants.sql` (new), `supabase/migrations/20261001120000_onboarding_stabilization.sql` (new).
- `tests/manual-owner-activation.sql`, `tests/onboarding-v2.test.mjs`, `tests/run-onboarding-local.mjs`, `tests/onboarding-stabilization.sql` (new), `tests/onboarding-stabilization.test.mjs` (new).
- `tests/platform-identity-consistency.test.mjs` (new), `tests/platform-master-upgrade-before.sql` (new), `tests/platform-master-upgrade.sql` (new).
- `ONBOARDING_V2_REVIEW.md`, `ONBOARDING_V2_STABILIZATION.md` (new).

Shop `C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1`:

- `package.json`, `vite.config.js`, `src/shared.js`.
- `supabase/functions/_shared/runtime-preflight.ts` (new); `supabase/functions/account-admin/index.ts`, `login/index.ts`, `password-reset-request/index.ts`, `platform-bridge/onboarding.ts`, `public-track/index.ts`, `verify-pin/index.ts`.
- `supabase/migrations/20261001110000_shop_config_service_role_read.sql` (new), `supabase/migrations/20261001120000_onboarding_runtime_preflight.sql` (new).
- `scripts/byo-setup.mjs` (new), `docs/BYO_SETUP.md` (new).
- `tests/branding.test.mjs`, `tests/onboarding-v2.test.mjs`, `tests/platform-bridge-auth.test.mjs`, `tests/onboarding-stabilization.sql` (new), `tests/onboarding-stabilization.test.mjs` (new).

Ignored local preview/PG artifacts are verification aids, not source changes.

## 3. New forward migrations and runtime dependency audit

The two earlier narrow grant files are retained because their hosted publication cannot be assumed absent. The two latest stabilization files are additive and ordered after manual activation. Historical migration files were not rewritten. Full migration-1-to-latest replay succeeds; no `--include-all`, remote reset or ad hoc hosted SQL was used.

| Shop function | Actual database/API dependency | Runtime / authorization |
|---|---|---|
| login | Config SELECT; app_users CRUD; legacy credentials verification/update/delete; Support audit INSERT/sequence; authenticated activation RPC; own Auth API | Shop built-ins + TURNSTILE_SECRET; Support group optional; CAPTCHA, verified Auth and existing suspension rules |
| account-admin | Config SELECT and allowlisted UPDATE; app_users CRUD; employee CRUD/sequence including rollback; legacy credential changes; reset-request UPDATE; PIN/completion RPCs; Auth admin | Verified caller UUID, Active profile, allowed role and suspension; no ordinary V2 owner replacement |
| verify-pin | Config/app_users SELECT; guarded PIN RPC | Verified own Shop session and role |
| password-reset-request | Config/app_users/employees SELECT; reset-request SELECT/INSERT/sequence | Required CAPTCHA; fixed public response |
| public-track | Config/ticket SELECT | Existing public tracking projection and entitlement check |
| platform-bridge | Private reservation/outbox/config/projection RPCs; new service-only preflight; own Auth Admin availability | Distinct opaque CALL credential; outbound SOURCE credential remains separate |
| logo persistence | Config UPDATE through account-admin | Inline bounded image; no Storage bucket, object path, upload policy or extra Storage privilege required |

`bridge_runtime_preflight()` checks dependency ACL metadata and identity consistency under a fixed response contract; service-client config read and Auth availability additionally exercise live APIs. Normal function probes preserve gateway JWT settings and return only contract/function/configured booleans after CALL authentication. They never return service keys, Auth user data or raw provider errors. Storage's check means inline-logo persistence, not a hosted bucket test.

## 4. Setup tooling

`npm run byo:setup -- ...` accepts a new project ref, downloaded pairing file and separate private runtime file. Default invocation validates branch, targets, allowlisted settings, supported CLI flags and current account project visibility without hosted writes. `--apply` installs the two files separately, deploys exactly six functions with `--use-api`, then verifies 11 installation checks; reservation/bridge mode/projection are completed by Platform Provision Shop. `--remove-pairing` unlinks the canonical pairing file only after success. Failure retains it. CLI output is suppressed and messages never echo values.

Files must be outside both repositories; Client 1/ref 1 is rejected. The downloaded file has public project/client metadata plus exactly three entries: sensitive CALL secret, sensitive independent SOURCE secret, and public Platform bridge endpoint. Bridge secrets intentionally persist in Platform Vault/Shop Edge secrets; they are not ordinary Platform client/job fields. No customer Supabase password, service/secret API key, DB password or permanent PAT is accepted or sent to Platform. The local operator's authorised CLI session stays local.

Migrations are a documented approved Git integration release, not automated password collection. If that integration is unavailable, project-owner migration release is a prerequisite. See the exact procedure in `C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1\docs\BYO_SETUP.md`.

## 5. New and updated tests

Platform additions execute the complete Client Detail renderer including synthetic legacy Client 1, lifecycle actions/conflict wording, escaped copy/link values, single primary action, five-stage guide, every negative runtime check, and server-bound operator identity. Actual authenticated SQL exercises master/portfolio Add Client, manager plan derivation, denied direct sensitive UPDATE, unknown/billing users, canonical master alias independence, old optimistic readiness and wrong binding. Existing bootstrap fixtures now supply the stricter contract and source registration.

Shop additions execute protected runtime probes with missing/wrong credentials, missing dependencies and Auth outage; real owner login without Support configuration and Support failure closure; the real six-step controller/settings mapping/back/retry/resume/completion; verified caller/role account-admin checks and direct logo size bounds; setup tool validation/apply/removal/target protections using injected CLI/fetch. Actual service-role SQL exercises private config read/settings write, employee rollback, resets/sequences/RPCs and denied browser/private entitlement access; manual owner states cover missing, unconfirmed, confirmed, staff conflict, activation and one NULL-employee owner.

The cross-repository SQL runner replays all migrations from empty databases, compares existing settings/PIN preservation, runs all 12 plan/Inventory/Paper combinations and 24 break variants, existing financial/bridge regressions, and two actual concurrent database sessions for invite leases and first manual activation.

## 6. Commands run

In each allowed repository:

```powershell
git branch --show-current
git status --short
node --test --test-concurrency=1 tests/*.test.mjs
npm run build
git diff --check
```

Platform has no local `VITE_TURNSTILE_KEY`; its validator correctly rejects that missing configuration. For local build verification only, the build command used `$env:VITE_TURNSTILE_KEY='1x00000000000000000000AA'`, Cloudflare's public test key. No environment file or hosted variable was changed. Do not deploy these test-key artifacts; configure the real Platform site key for release.

Full local replay command, from Platform (PostgreSQL 18, loopback port 55439):

```powershell
$env:PSQL='C:\Program Files\PostgreSQL\18\bin\psql.exe'
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D 'C:\Users\ranaz\Desktop\Development\orbito\node_modules\.cache\onboarding-pg' -l 'C:\Users\ranaz\Desktop\Development\orbito\node_modules\.cache\onboarding-pg.log' -o '-h 127.0.0.1 -p 55439' -w start
node tests/run-onboarding-local.mjs
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D 'C:\Users\ranaz\Desktop\Development\orbito\node_modules\.cache\onboarding-pg' -m fast -w stop
```

Search/diff review covered current source and new SQL/tooling for customer/dummy values, privileged-key fallbacks, TODO/FIXME/HACK, logging/storage/analytics and duplicate logic. Local browser verification used synthetic renderers at loopback only: pending, owner detected, completed and legacy states, guided modal, desktop/390px phone layouts. It made no hosted calls.

## 7. Final results and adversarial verdicts

Platform **72/72**, Shop **70/70**; zero failed/skipped tests. Both production builds pass after the final source fix. Full migration replay, preservation fixtures, actual-role SQL, financial regressions, concurrent owner claims and the existing UUID-master upgrade replay pass. Both final `git diff --check` checks pass. Platform's existing Vite CJS/mixed-import warnings remain.

PASS means code/local evidence passes, not hosted acceptance. Exact fresh SQL predicates, idempotency boundaries and the 12-combination table are in `ONBOARDING_V2_REVIEW.md`.

| Requested review section | Verdict | Evidence / limit |
|---|---|---|
| 1. Fresh detection/migration safety | PASS | Untouched baseline enters V2; existing owner/catalog/PIN/brand/Support evidence remains initialized. Conservative false negatives and database-indistinguishable baseline limit documented. Live Client 1 not read. |
| 2. Bootstrap idempotency | PASS | Before/after/unknown invite recovery, accepted owner retry, leases and actual concurrent claims; one Auth fixture/owner/reservation, zero employees. Exactly-once SMTP inbox delivery remains external. |
| 3. Owner identity | PASS | Confirmed exact reserved Auth UUID/email; immutable ordinary settings; conflicts denied; NULL employee; no Platform owner password or exported Shop key. |
| 4. BYO secrets | PASS | Two bridge secrets + public endpoint only; no logs/localStorage/query/analytics/ordinary database fields; sensitive/removable file; permitted Vault/Shop persistence documented. |
| 5. Invite route | PASS | Reserved authenticated identity required; arbitrary user denied; first-run routing enforced; password via authenticated Shop Auth session. |
| 6. Provision retries | PASS | Existing single pending-job constraint/leases, same immutable payload/source, timeout recovery and post-projection refresh; cadence unchanged. |
| 7. Modules | PASS | 12 combinations/24 break variants; technician canonical; independent Inventory/Paper; printing/thermal always available. |
| 8. Business systems | PASS | No metering/ledger/repair financial change; existing SQL/Node tests pass; Support identity, suspension and source/CALL separation retained. |
| 9. Hosted assumptions | PASS | Unproven dependencies are listed explicitly below and in the smoke procedure. |
| 10. Cleanliness | PASS | No new dummy runtime defaults, TODO/FIXME/HACK, privileged-input fallback or secret logging; unused duplicate renderer removed. Historical baseline/legacy exceptions remain documented. |

## 8. Remaining manual steps

Publish the reviewed source through an approved release workflow; release Platform forward migrations/functions/build with real public CAPTCHA settings and preserve the existing master's correct hosted alias-email setting if alias login is used. The new Shop owner/operator creates the blank project, reserves Pages URL, applies the complete Shop migration chain through approved Git integration, authorises their own local CLI account, supplies pairing/runtime files, runs validation then setup/apply, configures public browser values/hostname, provisions the reserved owner, creates the confirmed Auth account directly in Shop, checks/login/finishes six steps. These are external installation steps, not missing code fixes. No hosted mutation was performed. The final follow-up read only Platform identity/function metadata, not Client 1 or other client rows.

## 9. Exact fresh-project hosted smoke instructions

Use `docs/BYO_SETUP.md` for commands/fields. Perform this only on the expressly disposable fresh project; never use Client 1. Deletion/recreation is the user's separate operation. Record PASS/FAIL for each check without capturing secret values:

1. Create a new blank customer-account Supabase project; record ref, exclude `kxmovywgshyltwusghhj` and Platform ref.
2. Authentication Users is empty before setup.
3. `app_users` is empty before owner creation.
4. `employees` is empty before owner creation.
5. Apply migration 1 through `20261001120000_onboarding_runtime_preflight.sql` via the approved release; verify recorded history, not just table existence.
6. Run setup/apply and verify all six function deployments succeed; keep normal gateway JWT settings.
7. Supply server TURNSTILE_SECRET separately; run protected installed-runtime preflight with all 11 installation checks passing.
8. Platform Add Client succeeds as master/portfolio; use reserved HTTPS Shop hostname, exact owner email and selected plan/addons.
9. Guided BYO download matches project/client metadata; local validation confirms correct CLI account before installation.
10. Remove a required dependency in the disposable test only if authorised, or observe pre-install pending: readiness must remain Pending; restore before proceeding.
11. Provision Shop succeeds; use the same retry operation after any timeout, not a replacement client/reservation.
12. Confirm reserved owner email/binding match the intended client; no invitation is sent by default.
13. Client Detail displays and copies the actual Client ID.
14. Create exactly one confirmed Auth user/password directly in Shop Dashboard for the reserved normalized email. Check existing Auth before repeating uncertain creation.
15. Check Owner Account reports waiting for owner login; a deliberately unconfirmed/wrong-email fixture cannot activate.
16. Owner signs in through Shop Login with the reserved account.
17. Real CAPTCHA succeeds with matching widget key/server secret and allowed Shop hostname; no Turnstile 403.
18. No authentication-runtime 503; normal owner login works with optional Support settings omitted.
19. The verified session's no-argument `activate_reserved_owner()` succeeds; wrong Auth identity fails.
20. Exactly one Active Business Owner app_user maps to the confirmed Auth UUID/email.
21. That owner's employee_id is NULL; there is no owner employee row.
22. First login/restored pending session opens the wizard; arbitrary redirect cannot skip it.
23. Step 1 saves brand/colors/name and a valid inline PNG/JPEG/WebP ≤512 KiB; oversized/non-image input is rejected.
24. Steps 2–5 save contact, receipt/tax, separate override PIN and feature review. Sign out/re-login to verify saved values/resume.
25. Step 6 completes once; retry does not create identity or business data twice.
26. onboarding_completed_at is populated only after valid completion.
27. Normal dashboard opens; subsequent login remains normal and existing suspension policy still applies.
28. Plan modules match Basic/Pro/Pro Plus; Technician remains canonical, EMS gates independent Break selection.
29. Inventory follows its independent addon; Paper OFF still allows printing/thermal capture.
30. Platform refresh shows healthy matching source/binding/projection and delivered usage; test timeout recovery with the same job if needed. Do not change cadence.
31. Pairing file removed after successful installation; no secrets in repo/VITE/logs/query/localStorage/analytics/ordinary Platform rows. Remove extra download/runtime-file copies through operator procedure.
32. With separately authorised metadata verification, compare Client 1 against its prior baseline: identity/settings/binding/source/cutover unchanged. This development pass did not access its live rows.

Also test optional invite SMTP delivery and `/invite/accept` Auth redirects only if that secondary path is intended; manual-first setup does not depend on them.

## 10. Remaining risks and hosted-only limits

- Supabase Auth confirmation/invitation delivery, custom SMTP, redirects and actual password/session behavior; SMTP transaction rollback can prevent exactly-once inbox guarantees.
- Real CAPTCHA key/secret/hostname correctness, DNS/TLS, Cloudflare SPA routing for `/login`, `/onboarding`, `/invite/accept`.
- Hosted JWT gateway/signing-key behavior and deployed imports/function bundling. Local Node mocks execute handlers but are not a hosted Deno deployment.
- Hosted Vault encryption/access and actual scheduler firing; the local runner substitutes Vault and a minimal Auth schema.
- Management API permissions, Git integration production migration deployment and cross-account grants. Project visibility alone is not write authority; successful installation/deployment proves those operations.
- Supabase CLI was unavailable/offline locally. The setup helper's flag/access/apply/removal behavior is tested with injected CLI/fetch, not a real hosted CLI run. It checks installed flags before mutations.
- Readiness is an observation, not a permanent uptime promise. Check real owner login/route/CAPTCHA even when backend ready. Privileged manual Auth edits can create conflicts requiring reconciliation.
- Download copies/backups cannot be remotely erased. File removal is unlink, not forensic erasure. Legacy hosted credential inventory/cleanup remains a coordinated release operation documented separately.
- Platform's validation build uses a public test CAPTCHA key; release requires the actual site key. No claim is made that the current hosted project received these changes.

## 11. Recommendation

Recommend committing this reviewed work on `feature/onboarding-v2` as a checkpoint and proceeding to a controlled new blank cross-account Shop smoke test **after the reviewed source/migrations/functions are released through the approved process**. No known local correctness/security blocker remains. Hosted acceptance is still pending; this is not deployment approval and does not authorise deleting or modifying Client 1. No commit or destructive action was performed.

## Final consistency follow-up: Platform master identity

Read-only inspection of the configured Platform project `ukbhyerxshteyetwomqy` on 2026-10-01 established:

- Current master Auth UUID: `38c15d46-ea41-450b-b0c4-86b11ecf3bfb`.
- Current confirmed Auth email: `ranazaighaum@gmail.com`; no corresponding platform_users row is needed for this master.
- Current platform_config alias: `ranazaighaum`.
- Deployed `platform_private.operator_role()` grants master by comparing `auth.uid()` with that UUID, then uses Active platform_users UUID mappings for other roles. It does **not** use the historical placeholder email. The new public identity RPC was not yet deployed at inspection.
- Local `VITE_PLATFORM_AUTH_EMAIL` is configured differently and matched no Auth user in this project. No local/hosted values were changed. Do not treat this stale local build input as hosted truth; preserve the current correct Cloudflare setting, use the actual Auth email for login, or deliberately configure the alias destination to the existing account at release. No replacement account is required.

Exact code trace:

| Path | Identity behavior |
|---|---|
| events do-login | Email input → signInWithPassword on that email. Alias input → signInWithPassword on VITE_PLATFORM_AUTH_EMAIL, then requires returned master role and matching server alias. Password goes to Auth only. |
| loadOperatorIdentity | getUser verifies the Auth session; identity RPC's auth_user_id must equal that verified UUID; role must be allowed. |
| platform_operator_identity | auth.uid must exist; role comes from existing operator_role; current email is selected from auth.users by UUID; master display name is admin_username. No Auth user or operator-role function is created/replaced here. |
| session restoration | getSession followed by verified server identity; no VITE/email comparison grants master. Recovery event/reset URL takes precedence over ordinary restoration. |
| alias edit | Reauthentication uses loadOperatorIdentity().email; only admin_username is updated under existing master RLS. It neither updates Auth email nor stores a password. |
| password reset/change | Reset link targets the entered Auth email with CAPTCHA; recovery/current-session password updates call Auth updateUser. Existing team invite acceptance remains UUID-bound. No password is written to platform_config. |
| historical defaults | Baseline admin_username='admin', obsolete admin_password='1234'; historical baseline policies and initial control-plane helper reference platformadmin@retailos.internal. There is no seed/insert creating that Auth user. Later checkpoint migrations preserve deployed operator_role rather than replaying these old definitions. |

The current hosted UUID helper is an existing deployment-specific authorization configuration. Replaying historical Platform migrations into a **new Platform database** is not the same as upgrading this existing Platform and would require an intentional master-UUID bootstrap; this Shop checkpoint does not create a new Platform or infer that UUID from a browser email. Do not rerun historical migration files against the working Platform.

No identity implementation change was needed for the observed hosted upgrade: the new RPC already preserves and delegates to its UUID helper. Tests now explicitly prove that compatibility rather than relying on placeholder-email fixtures. A disposable database starts from pre-checkpoint migrations plus a synthetic differently emailed UUID-authorized master, applies only checkpoint forward files, and verifies byte-identical operator function/Auth rows/alias, real-email RPC and Add Client, alias edit, same UUID after Auth email change, denied placeholder/unknown users, and denied config password writes. Browser tests execute real login, restoration, alias-edit and recovery/change controllers with mocked Auth boundaries.

## Final consistency follow-up: runtime text

Previously the status sentence used only `verified_at`, while the progress/cards used preflight checks. A missing timestamp could therefore contradict valid checks. The sentence now shares `setupState().runtime`: it says **Backend runtime preflight verified** when backend checks pass, regardless of timestamp. Missing/failed checks say pending or needs attention; a valid timestamp is supplementary only, and invalid dates are omitted. A separate sentence explicitly names hosted external smoke checks: CAPTCHA hostname, DNS/TLS and browser routing. No client-side external-check completion is invented.

Regression cases cover verified, failed/missing checks with present/missing/invalid timestamps; the local synthetic preview is regenerated with consistent wording. No new migration or master-account replacement was introduced by these two checks. The full suites/builds/replay/diff checks were rerun after the change.
