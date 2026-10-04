# Onboarding V2 adversarial review — 2026-10-01

> Repository status update — 2026-10-04: The reviewed Onboarding V2 work was later committed (5b6c0eb/2c03676), merged into developmentv2 (4f86abf) and pushed. Local HEAD and the live GitHub `feature/platform-overhaul-v1` head match at `a054e28`. Current integration target is `developmentv2`. Preserve the original validation/deployment evidence below as a point-in-time record; Git does not prove hosted deployment. See [engineering history](ENGINEERING_HISTORY.md) for the owner-reported hosted checkpoint and pending smoke gate.

Review and manual-first follow-up complete. Confirmed local defects were narrowly fixed and revalidated. Both repositories remain on feature/onboarding-v2. Changes are uncommitted. No push, merge, deployment, remote migration, hosted secret change or scheduler cadence change was made. The legal worktree was not inspected or modified.

The combined stabilization and Client Detail cleanup is also complete locally. [ONBOARDING_V2_STABILIZATION.md](ONBOARDING_V2_STABILIZATION.md) records the latest root causes, exact current changed files, forward migrations, Edge dependency audit, setup tooling, commands/results and 32-check hosted acceptance procedure. The earlier implementation inventory below is historical; use that combined report for this pass.

PASS means inspected code and local tests meet the requirement; it does not imply hosted verification or access to live Client 1.

| Section | Verdict | Evidence / limitation |
| --- | --- | --- |
| 1. Fresh detection and migration safety | PASS | Full migration chains; untouched baseline and existing-owner, catalog-only, custom-PIN-only, brand-only and Support-only fixtures. Preserved Shops retain every old config field and PIN. |
| 2. Owner bootstrap idempotency | PASS | SMTP-free reservation, duplicate/manual login, two actual concurrent authenticated first claims, and explicit-invite uncertainty/acceptance recovery. One reservation and canonical owner; no employee. |
| 3. Owner identity security | PASS | Shop session establishes password; no Platform owner password or Shop service key. V2 owner editor/endpoint reject identity changes. Unique owner and identity-shape constraints require employee_id NULL. |
| 4. BYO pairing security | PASS | Active V2 is independent of retired privileged credentials. Direct legacy writer/resolver ACLs are revoked; V2 cannot enter legacy steps, and synthetic retained-key independence is tested. Hosted legacy credential inventory/cleanup remains a release operation, not a code failure. |
| 5. Invite acceptance route | PASS | Server checks Auth UUID/email, reservation, canonical active owner, NULL employee and suspension before password form. Completion rechecks reservation; config-read failure blocks normal routes. |
| 6. Provisioning retry state machine | PASS | Existing unique pending-job index/locks, immutable payload and recovery leases. Unknown SDK results retain lease; scheduler persistence errors are handled. Cadence unchanged. |
| 7. Module mapping | PASS | All 12 plan/Inventory/Paper combinations and 24 break-selection variants tested in SQL. Independent break selection requires EMS. Technician remains canonical; printing always available. |
| 8. Existing business systems | PASS | Financial/capture migrations unchanged. Platform control-plane/currency and Shop usage/repair/bridge/thermal/PIN SQL regressions pass, plus all Node suites for billing, ledgers, support, suspension and credential boundaries. |
| 9. Hosted-only assumptions | PASS | All unproven hosted behavior is explicitly listed below. No hosted success is claimed. |
| 10. Code cleanliness | PASS | No new onboarding markers, customer runtime defaults, secret logging/storage/analytics or privileged-key fallback. Unused frontend credential plumbing removed. Historical/legacy code exceptions are documented below. |

## Manual-first architecture and exact changes

Default bootstrap now calls Shop bridge_onboarding('reserve'), never inviteUserByEmail. It reserves owner name/normalized email/correlation, initializes modules and enables bridge delivery; Platform registers/projects through the existing billing control plane. Client Detail now shows six lifecycle stages, compact health/owner/features cards, one state-dependent primary action and collapsed diagnostics. Backend Ready requires the current 14-check runtime contract, actual config/Auth reachability, five protected function probes, consistent reservation/binding, bridge mode, applied projection and matching enabled Platform source. Status is refreshed after projection. CAPTCHA hostname/key correctness and browser routes still require hosted testing. The six-step wizard remains intact, with Security as step four.

The authorized operator creates a confirmed account/password directly in that Shop's Supabase Dashboard after verifying the intended email. BYO customers grant temporary project access or follow instructions through screen sharing; no Supabase login password or privileged customer keys are collected. Creating Auth alone leaves owner_setup_pending until a matching session claims it.

Shop login verifies its own Auth session before invoking the no-argument authenticated activate_reserved_owner(). Restored verified sessions use the same RPC. It delegates to one private SECURITY DEFINER activation helper with an empty search_path, config/bridge/reservation row locks, confirmed exact normalized email, immutable reservation/binding, pending first claim, no conflicting canonical owner, Active profile and employee_id NULL. An already mapped same canonical owner can be confirmed idempotently after completion; a different identity cannot replace it. Caller-controlled metadata does not authorize a manual role. Existing V0 Shops are excluded. Suspension and private-config gates remain enforced; inactive mapped profiles are not reactivated.

State: owner_setup_pending → externally created confirmed Shop Auth account → authenticated exact reserved identity atomically mapped → owner_active plus onboarding_pending → six-step wizard → onboarding_complete. Infrastructure readiness is a separate diagnostic. No duplicate owner state table or employee is created.

Email invitation is secondary and only requested by the explicit master-admin invite-owner action after ready infrastructure. It retains correlation/uncertainty leases and converges through the same private activation helper. Invite-created profiles remain pending until confirmed Auth; the acceptance route verifies the existing reserved mapping before password establishment. Known failure/unknown outcomes do not undo infrastructure, register/project twice or trigger automatic email resends. Manual recovery uses the same existing Auth account if an invite already created it. The scheduler retries only bootstrap; cadence is unchanged. SMTP is optional, recommended for reliable optional email.

Database changes are forward-only 20261001090000_manual_owner_activation.sql in both repositories. Shop adds the private activation helper and authenticated no-argument wrapper and replaces bridge_onboarding with reserve/manual diagnostics/shared invite finish. It reuses existing reservation/identity columns and unique constraints. Platform extends the job action check/prepare logic with invite-owner, stores owner_setup/infrastructure in safe health, preserves prior health on pairing, revokes the retired public resolver/direct legacy writer, and confines V2 legacy-wrapper steps to complete/failure. Neither migration retrieves hosted values during this development pass, deletes credentials or changes business ledgers/cadence. Historical migrations are not rewritten.

Runtime edits: Platform provisioning gateway, onboarding helper and Add Client/provisioning UI; Shop login, session restoration, bridge onboarding helper and wizard Security wording. Documentation and regression fixtures/runner were updated. Ordinary V2 settings stay immutable. [LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md](LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md) supplies exact pointers/names, metadata-only SQL, dependency review, cleanup order, rollback and post-removal verification.

## Validation after fixes

- Platform: **72/72 Node tests pass**.
- Shop: **70/70 Node tests pass**.
- Both production builds pass after the latest fix. Platform retains existing Vite CJS/mixed-import warnings. Its missing local VITE_TURNSTILE_KEY correctly fails validation; the passing local build uses Cloudflare's public test key via a process variable only. Release requires the real site key; no environment file or hosted setting was changed.
- Both git diff --check runs pass.
- Disposable loopback PostgreSQL tests apply both full migration chains. Shop uses a minimal local Auth schema; Platform uses a Vault substitute, so these tests do not prove hosted Auth or Vault encryption.
- Existing usage/repair billing, bridge, thermal, PIN, control-plane and currency SQL tests pass.
- Two separate PostgreSQL sessions race for the same bootstrap: exactly one reservation/lease, no duplicate owner/employee.
- Auth-confirmed invite recovery before finish/response creates one canonical owner with employee_id NULL.
- Two additional actual authenticated PostgreSQL sessions race at first manual activation: one Auth account, one canonical owner and zero employees. Manual SQL covers unconfirmed/mismatched/unknown users, initialized/suspended Shop, existing conflicting owner, duplicates, email failure and SMTP-free completion.
- Retired public resolver/direct writer are inaccessible to service_role. V2 legacy-step calls are rejected. Tests cover both absent and synthetic retained historical key pointers without returning their values.
- Earlier six-step browser verification used the real wizard with in-memory services; it did not send email. The final route/invite regressions execute real controllers with mocked boundaries.
- Latest actual-role SQL verifies Platform Add Client grants/RLS and sensitive direct-write denial, Shop Edge config/settings/employee/reset privileges, private browser-config denial, and owner staff-email conflicts. Both complete migration chains replay successfully, including the new forward grant/preflight files.
- Client Detail and BYO guide were checked locally with synthetic data on desktop and 390px phone viewports. Six-step save/back/retry/resume/completion and exact decoded 512 KiB logo limits execute in targeted controller/endpoint tests. CLI setup is tested with injected boundaries; real CLI/hosted deployment was not run.
- Final identity consistency review used read-only Platform Auth/function metadata: the deployed master is authorized by its existing UUID, with a real email different from the historical placeholder. New forward migrations preserve that helper. A synthetic pre-checkpoint UUID-master upgrade replay and actual frontend login/restoration/password-flow tests prove compatibility. Runtime explanatory text now follows the same backend checks as progress, independently of timestamps, and explicitly separates external smoke checks. See the combined report's final consistency sections.

## Confirmed defects and exact fixes

1. Startup ignored failed private config reads and could enter normal routes with missing onboarding state. Startup and invite/login completion now share a fail-closed gate, clear routes and offer retry/sign-out. The existing suspension rule and Support exemption apply on invite entry too.
2. Invite acceptance checked only whether some authenticated user existed. Added authenticated server-authorized get_owner_invite_context() against the reserved owner and canonical Auth/app_users identity. The password form requires this check; completion also verifies the reservation.
3. The owner-email editor could change the V2 owner while bootstrap retries required its original email. V2 settings are read-only and account-admin rejects update-owner before mutations. Legacy V0 behavior is retained.
4. Baseline cleanup omitted catalog, ledger/support/EMS history, bridge state/projections and a custom PIN. Added empty-state predicates and a check that the PIN is absent or matches historical default 1234. Configured-state fixtures compare all old settings and hashes before/after.
5. SDK-returned fetch errors were treated as known invite rejections. Only definite 4xx Auth errors release the lease; network/5xx/unknown outcomes retain it for recovery. Shop onboarding DB/Auth requests have a 20-second bound and reject redirects.
6. Scheduler queue/completion/failure RPC errors were ignored. They now produce safe failures/retry state instead of claiming persisted success. Cadence and credential boundaries are unchanged.
7. Break Tracking lacked an onboarding selection control. Added independent Add Client selection, EMS validation and synchronization of its desired bootstrap value.
8. Null bootstrap IDs/version, missing source binding and null tax could pass SQL comparisons. Made these checks explicit and validated numeric tax updates; added regressions.
9. Removed unused frontend credential variables/body cleanup left after the service-role input was removed.
10. The renamed legacy provisioning function retained its prior direct service-role grant. The forward migration revokes it and the retired public resolver, and restricts V2 jobs to their isolated state machine. Historical credential-writing source remains inaccessible through the active wrapper.
11. New provisioning accepts only the closed request field set; passwords/privileged customer credentials are rejected before reservation. Optional invitation diagnostics use fixed messages and enumerated states, including malformed/unknown response handling that preserves manual setup.
12. Latest stabilization fixes explicit table/column/sequence grants, missing runtime detection, readiness/source consistency, canonical server-bound Platform identity, exact logo limits and reserved-email staff conflict diagnostics. New forward files preserve migration history. Deterministic BYO tooling installs/deploys/verifies without receiving customer privileged keys; approved Git integration handles migrations. Owner-conflict guidance requests reconciliation; an unused duplicate link renderer was removed. See the combined report for exact files and validation.

## Fresh-Shop detection: exact predicates and counterexamples

The Shop migration 20260929090000_onboarding_v2.sql first marks existing rows initialized. It neutralizes only singleton id 1 meeting ALL of these conditions:

- Exact old dummy name/warranty, default colors/currency/tax, default prefixes and zero sequences.
- Empty owner/contact/description/logo/platform fields; no Platform client ID; default billing/module/login flags; unsuspended.
- No Auth users, app_users, employees or legacy credentials.
- No sales, tickets, inventory, catalog/components, debt, returns, sessions, attendance, leaves, salary data, password requests, support history, step-up authorizations, or invoice/payment/refund/adjustment/approval/inventory-movement rows.
- No bridge events, billing projection or resupply requests; bridge remains unbound, disabled, legacy and sequence zero.
- PIN hash absent or verifies as historical default 1234.

The exact SQL is the WHERE clause at the beginning of that migration. Qualifying baseline becomes neutral/pending. Bootstrap records version 2; needsOnboarding() requires canonical Business Owner, version 2 and no completion. Existing rows retain version 0 and completion.

The existing-Shop fixture uses a real canonical owner and the same legacy-looking name. Auth/app_users exclusions alone prevent cleanup; before/after JSON and PIN comparisons prove preservation. Configured Client 1 with existing identity/binding is protected by those same predicates. **Live Client 1 was not accessed or verified.**

Conservative false negatives: a business-empty project with only Support, changed branding/PIN, preinstalled binding, imported catalog, NULL/nondefault fields or other historical evidence is initialized and requires deliberate reconciliation. False-positive limit: a purported business byte-for-byte identical to untouched defaults with no database evidence and default PIN 1234 is indistinguishable. Setup existing only outside the database cannot be detected. No business-name-only inference is claimed.

## Owner retry and identity evidence

The invitation cases below apply only to explicit optional invitations. Default reservation has no invite lease/Auth email call. Manual activation is separately proven with exact-email confirmed Auth, mismatch/conflict/suspension/initialized rejection, duplicate calls and actual concurrent authenticated claims.

| Boundary | Result |
| --- | --- |
| Before invitation | Live reservation lease rejects another claim; explicit 4xx rejection records failed and permits retry. |
| Invite committed; finish/response lost | After lease expiry, exact reserved email, request correlation and invited Auth identity are recovered; one canonical mapping. |
| Unknown thrown/SDK timeout or 5xx | Lease retained. Committed identity recovered; if absent, a later attempt can invite. |
| Accepted before finish | Local confirmed-Auth fixture then recovers one owner and reports accepted. |
| Retry after accepted/completed | Stored owner ID and both emails must match; no invitation or branding reset. |
| Concurrent requests | Real separate sessions serialize at singleton config/reservation; second receives no invite lease. |

Role comes from the protected reservation and server code, never caller-selected Auth user metadata. Recovery metadata is a correlation and also requires exact reserved email, invited Auth state and no conflicting profile. External edits to correlation/email can fail closed and need reconciliation. Ordinary V2 settings cannot change owner identity; privileged Auth administration is outside this workflow.

The Platform sends no owner password. Default account/password creation occurs directly in Shop Supabase Auth administration; normal login uses the existing Shop-only Auth gateway. Optional invite password establishment uses authenticated Shop sb.auth.updateUser({password}). No owner password is written to application tables or sent to Platform. Shop service-role access is confined to Shop DB/Auth. Ordinary config keys exclude owner_email, role and employee_id. Database constraints enforce one Business Owner and NULL employee_id.

The reservation, index and locks enforce one canonical application identity and invitation-state row. Exactly-once inbox delivery after SMTP sends but Auth rolls back cannot be proven by application SQL: the [upstream Auth invite implementation](https://github.com/supabase/auth/blob/master/internal/api/invite.go) sends inside its Auth transaction. Provider-side send/rollback remains a hosted uncertainty.

## Provisioning state machine

Platform uses existing running -> complete or running -> retry -> running jobs and the partial unique index for one pending job per client. Manual retries and scheduler claims reuse the immutable bootstrap payload. Config jobs and provision jobs serialize through existing guards. The scheduler can claim two bootstrap jobs older than five minutes without changing cadence; a claim refreshes updated_at, so a second dispatch gets none until expiry. Shop invitation lease is two minutes; bounded calls are shorter than that lease. A completed owner is returned before another invite call.

Interrupted running jobs recover after lease expiry. Status/health and source registration are idempotent; source UUID/binding must match. Projection retry publishes through existing billing code. Stale executions can fail saving state and retry; identity guards still prevent duplicate owners. Actual infrastructure execution duration and scheduler firing remain unproven locally.

## All 12 commercial combinations

B = POS/tickets/repair. P = B + Technician/Workshop + Live Tracking. P+ = P + EMS. Printing and thermal tracking are included in every row. Break Tracking is independently tested selected/unselected and enabled only with EMS.

| Plan | Inventory | Paper Resupply | Base modules |
| --- | --- | --- | --- |
| Basic | No | No | B |
| Basic | No | Yes | B |
| Basic | Yes | No | B |
| Basic | Yes | Yes | B |
| Pro | No | No | P |
| Pro | No | Yes | P |
| Pro | Yes | No | P |
| Pro | Yes | Yes | P |
| Pro Plus | No | No | P+ |
| Pro Plus | No | Yes | P+ |
| Pro Plus | Yes | No | P+ |
| Pro Plus | Yes | Yes | P+ |

SQL compares the mapping function and actual inserted client flags/snapshot for every row and both break choices. No new workshop_enabled logic exists; its sole V2 use compares an old default during untouched-baseline detection. Platform authorized module overrides retain the existing config control plane.

## Existing business systems

No invoice/payment ledger, repair financial core, BILL/INVENTORY/THERMAL capture or print calibration implementation changed. Both git changed-file inventories and unchanged historical migrations establish that boundary; passing financial/bridge SQL and Node tests verify behavior. Plan/addon selection changes entitlements through existing configuration without redefining metering. Paper Resupply does not gate printing/thermal. Support UUID mapping/authentication is unchanged; invite entry now enforces the existing login suspension rule. Call, source and scheduler credentials remain distinct, tested against incorrect/service-role fallback tokens.

## Sensitive BYO file audit

Exactly three entries:

The current download also includes two non-secret comment lines identifying the target project ref and Client ID; setup validates these before installation.

- PLATFORM_BRIDGE_CALL_SECRET: sensitive per-Shop opaque Platform -> Shop operations token; can bootstrap owner and manage modules.
- PLATFORM_BRIDGE_SOURCE_SECRET: independent sensitive Shop -> Platform ingestion token.
- PLATFORM_BRIDGE_ENDPOINT: non-secret ingestion URL.

The two long-lived bridge tokens intentionally persist in Platform Vault and Shop Edge secrets; source verification also stores a hash. The downloaded file copy stays briefly in browser memory, becomes a Blob URL, is deleted from the response object and revoked. It is not HTML/log/query/localStorage/analytics/client-row/job-payload data. Response is no-store; UI/docs identify sensitivity and require secure removal after installation. Browser downloads, backups and operator transfers can retain copies the app cannot erase.

New BYO setup receives no customer service-role/secret key, DB password or PAT. Customer CLI authorization stays local; managed setup uses Platform's authorized Management token. Historical service-key Vault values and any retired deployed credential-map environment entries were not inventoried or removed. **Section 4 passes active-code requirements. Hosted legacy credential inventory/cleanup remains a release operation.** Follow LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md; do not query decrypted values or guess/delete records. No secret values were printed or inspected.

## Hosted-only checks before release

- Supabase deployed Auth version: invite creation/acceptance, password policy, hooks/signup configuration, rate limits, recipient restrictions, expiry/resend and actual SDK/GoTrue timing.
- Optional email only: custom SMTP sender/domain permission, inbox delivery, spam/link scanning and provider-send/transaction-failure results. Custom SMTP is not required for default manual setup.
- Hosted manual account creation/confirmation, Auth hooks/password policy and actual login-to-RPC session propagation must be smoke-tested; local Auth rows are substitutes.
- Exact Site URL and allowed /invite/accept redirect. An unallowed redirect can fall back to Site URL without an API error, per [Supabase invite documentation](https://supabase.com/docs/guides/auth/users); password activation can be stranded despite protected first-run routes.
- Hosted Vault encryption/RPC grants and legacy privileged credential/environment inventory/cleanup. Local Vault is a contract substitute.
- Management API scopes/project access, Edge secret propagation, deployment and JWT gateway configuration.
- Cross-account customer-authorized BYO CLI installation with no customer privileged credentials given to Platform.
- Edge limits/server-side cancellation and actual scheduler authentication/firing/lease recovery.
- Cloudflare SPA direct-route fallbacks, HTTPS origin-root deployment and real browser invite sessions.
- Live Client 1 identity/settings remain initialized. Local fixtures prove predicate behavior; live rows were not accessed.

## Cleanliness findings and recommendation

Searches covered active source/Edge code and new onboarding files for dummy/customer values, service-key inputs/fallbacks, logging/storage/analytics, TODO/FIXME/HACK and unused/duplicate logic. Historical dummy name remains only in historical migrations and the V2 identification predicate. Test fixtures use example domains. No new onboarding markers or unused onboarding function were found. Settings/features helpers are shared between wizard/settings.

Legacy cutover code remains for existing clients. An unreachable legacy provision branch remains behind explicit action rejection; it cannot accept a privileged key or run alternate V2 bootstrap. It was not refactored for style. Historical private credential-writing SQL remains behind the wrapper rejecting new credential writes; active code has no privileged-key resolver/fallback. Existing client verification/cutover remains a coordinated deployment requirement.

**Recommend committing reviewed local changes on feature/onboarding-v2 as a review checkpoint. This is not release approval:** metadata-only hosted legacy inventory/cleanup and hosted smoke checks remain release operations. No commit or external action was performed.

## Documentation

Both repositories contain NEW_CLIENT_ONBOARDING_V2.md, BYO_SUPABASE_ONBOARDING.md and MODULE_ENTITLEMENTS.md. Both repositories also contain LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md. This report and the local cross-repository SQL runner live in Platform.
## Earlier implementation inventory (historical)

The following inventory describes the preceding implementation checkpoint. The exact current stabilization/UI changes are listed in ONBOARDING_V2_STABILIZATION.md. No files were staged merely to obtain a diff.

### Orbito Platform

- Modified: `src/forms.js`, `src/modals/client.js`, `src/provisioning.js`.
- Modified: `supabase/functions/_shared/shop-credentials.ts`, `supabase/functions/platform-config/index.ts`, `supabase/functions/platform-provision/index.ts`.
- Modified: `tests/bridge-call.test.mjs`, `tests/provision-scheduler.test.mjs`.
- Added: `src/onboarding.js`, `supabase/functions/_shared/onboarding.ts`.
- Added: `supabase/migrations/20260929090000_onboarding_v2.sql`, `supabase/migrations/20261001090000_manual_owner_activation.sql`.
- Added: `tests/onboarding-v2.sql`, `tests/manual-owner-activation.sql`, `tests/onboarding-v2.test.mjs`, `tests/run-onboarding-local.mjs`.
- Updated historical operational docs: `docs/BRIDGE_CALL_CREDENTIAL.md`, `docs/CLIENT_PROVISIONING.md`, `docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md`.
- Added: `NEW_CLIENT_ONBOARDING_V2.md`, `BYO_SUPABASE_ONBOARDING.md`, `MODULE_ENTITLEMENTS.md`, `ONBOARDING_V2_REVIEW.md`, `LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md`.

### OrbitoShop

- Modified: `src/admin/admin.js`, `src/main.js`, `src/router.js`, `src/shared.js`.
- Modified: `supabase/functions/account-admin/index.ts`, `supabase/functions/platform-bridge/index.ts`, `supabase/functions/login/index.ts`.
- Modified: `tests/platform-bridge-auth.test.mjs`.
- Added: `src/onboarding-state.js`, `src/onboarding.js`, `src/settings-data.js`.
- Added: `supabase/functions/platform-bridge/onboarding.ts`, `supabase/migrations/20260929090000_onboarding_v2.sql`, `supabase/migrations/20261001090000_manual_owner_activation.sql`.
- Added: `tests/onboarding-v2.sql`, `tests/manual-owner-activation.sql`, `tests/onboarding-v2.test.mjs`, `tests/onboarding-browser.html`, `tests/onboarding-review.png`.
- Added: `NEW_CLIENT_ONBOARDING_V2.md`, `BYO_SUPABASE_ONBOARDING.md`, `MODULE_ENTITLEMENTS.md`, `LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md`.
- Added: `NEW_CLIENT_ONBOARDING_V2.md`, `BYO_SUPABASE_ONBOARDING.md`, `MODULE_ENTITLEMENTS.md`.

