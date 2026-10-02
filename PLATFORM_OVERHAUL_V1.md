# RetraSell Platform Overhaul V1 checkpoint

Both clean starting checkouts were already on `feature/platform-overhaul-v1` with local `developmentv2` as an ancestor. Platform includes merged Onboarding V2; Shop includes merged Onboarding V2 and legal finalization. No old `development` base, legal worktree or hosted client/project was used.

## Lifecycle and recovery

`lifecycle_state` is Provisioning, Active, Suspended or Archived. Existing rows retain Active/Suspended meaning; fresh V2 rows begin Provisioning. A verified status refresh promotes a new client when backend preflight and owner onboarding are complete. Suspend/Reactivate continue through the one existing remote configuration handler. Archived is terminal in this V1; Historical is the searchable archived view, not another mutation or deletion state. Infrastructure status is independently unknown/present/unreachable/destroyed/decommissioned.

Archive is a master-only local operation: retain every invoice, payment, usage record, configuration request and audit event, disable Platform bridge coordination and close stranded jobs with an audited reason and explicitly unknown remote outcome. It succeeds without contacting the Shop. Late callbacks cannot reactivate the account. Archive does not revoke a reachable Shop's access: suspend it first if required. Infrastructure destruction is separate; the UI records externally completed destruction/decommissioning only after an exact project-ref confirmation and reason. No history deletion action exists. Known retired projects cannot be contacted for configuration, provisioning or scheduler bridge calls.

Server jobs are authoritative. Configuration localStorage ghosts are discarded after a successful server read; the separate payment retry protocol remains unchanged. Master recovery shows original UUID, type, intended changes, timestamps, current local state, last remote observation and status. Recovery offers read, reconcile, replay the SAME UUID/payload, or audited manual closure. Read alone or read-back mismatch does not release uncertainty. Configuration recovery waits 60 seconds and serializes recovery with a lease. Interrupted provisioners require ten minutes before audited release for safe same-request retry. Passed stages survive recovery. Legacy side-effectful provisioning operations require manual reconciliation instead of being blindly released for retry. Scheduler cadence is unchanged.

## Managed provisioning and secrets

The existing `platform-provision` Edge boundary now handles `managed-setup`, `rotate-turnstile` and an authorized public environment lookup. It uses a reviewed, deterministic Shop release built by `Shop/scripts/build-platform-release.mjs`; no Git commit triggers or browser-provided SQL/function sources are accepted.

Stages: project identity/access; approved atomic migrations; server bridge settings; Turnstile; six Edge Functions; bridge/source registration and unchanged owner reservation; runtime preflight. Each stage and migration/function checkpoint has the existing operation UUID, state and timestamp. Pending steps are shown explicitly. Failed or manual stages can be resumed without repeating passed writes. Migration transaction/advisory lock/history read-back handles commit-before-timeout; function deployment uses the same approved archive/slug; secret retries reuse the same bridge values. Turnstile retains only a one-way fingerprint to reject changed-secret same-request replay, configured timestamp and public site key. Re-enter the original secret for an uncertain retry, or explicitly close and start rotation. Successful Turnstile steps require no resubmission.

Management tokens, Vault call/source credentials and any service keys returned by the Management API remain server-only. The one-time Turnstile form clears its password input before sending directly to authenticated server logic; its plaintext never enters RPC parameters, database fields, audit/stage results, localStorage, URLs or response data. No credentials are logged. Public key responses are reduced to the verified `anon` role only; the complete API-key array is never returned. The current Shop gateway still needs its legacy public anon JWT; publishable-key-only targets need manual gateway compatibility work, not a privileged-key fallback. Public environment copy contains exactly the Shop URL, public anon JWT and public Turnstile site key. BYO copy accepts these public values manually; cross-account secret installation remains local.

Project creation, Cloudflare project creation and Cloudflare environment writes remain manual. Managed setup refuses existing schemas without approved migration history and unrelated/initialized bindings before secret/function replacement. A separate manual adoption review is required for those targets. Managed/BYO mode is immutable after creation. Owner passwords remain exclusively in Shop Supabase Auth; manual owner activation remains the default.

## Requirement accounting

| Prompt section | Disposition |
|---|---|
| 0 working rules | Implemented: correct branches/base, forward migrations, local changes only. CLI/service escalation was rejected under stale verification scope; existing in-process SQL runtime used instead. |
| 1 architecture | Preserved: isolated Shop database and Platform control plane, server privilege boundary. |
| 2 stable contracts | Preserved and covered by focused bridge/onboarding/billing/legal regressions; durable config journal is the narrow correctness extension. |
| 3 operation safety | Implemented: uncertainty retained, same-request replay, no blind fresh duplicate. |
| 4 lifecycle | Implemented: four persisted lifecycle states, separate infrastructure state, historical view, local archive. Remote destructive decommission deferred. |
| 5 fake delete UX | Replaced by real archive and explicit manual decommission recording; history deletion absent. |
| 6 reconciliation | Implemented: server status, read/retry/reconcile/close, leases and audited reasons. |
| 7 unreachable/destroyed | Implemented: unknown outcome retained; known destroyed/decommissioned dispatch blocked; archive works offline. |
| 8 managed existing target | Implemented server stages for approved fresh/adopted V2 targets. Untracked/legacy business schemas require manual adoption review. |
| 9 privileged boundary | Implemented: master authorization, no browser deployment token/service key, no plaintext secret persistence. |
| 10 Turnstile | Implemented installation, public site-key retention and explicit rotation with same-request fingerprint guard. |
| 11 Cloudflare assistance | Implemented public-only copy/load; API automation deliberately deferred. |
| 12 stages/retries | Implemented persisted checkpoints, IDs, pending/running/passed/failed/manual display, safe failed-stage retry. |
| 13 managed/BYO | Implemented immutable mode and audited creation decision. |
| 14 owner activation | Preserved manual-first reservation and Auth-controlled passwords. |
| 15 preflight UX | Implemented database/migration/privilege/function/Auth/Turnstile/bridge/owner checks; hosted external checks remain separate. |
| 16 empty billing | Implemented exact zero/nonzero wording in Platform and Shop; calculations untouched. |
| 17 audit | Implemented suspend/reactivate/archive/retirement/recovery/stages/rotation/mode decisions without plaintext credentials. |
| 18 RBAC | Implemented master-only lifecycle/recovery/deployment/rotation; existing portfolio configuration permission preserved. |
| 19 frontend state | Implemented refresh, modal cleanup, archived action/list suppression, submit coalescing and server retry truth. |
| 20 branding | Current RetraSell public branding preserved; technical identifiers and Orbito Support unchanged. |
| 21 legal | Preserved unpublished 1.0 documents/revision 2026-10-03.1, owner/staff architecture and onboarding-before-legal. |
| 22 migrations | New additive Platform and Shop migrations only; existing migrations untouched. |
| 23 tests | Focused handler, UI/state, legal/onboarding and in-process forward-chain SQL validation; results below. |
| 24 reuse | Existing provisioning jobs, bridge, config handler and scheduler reused. |
| 25 deferrals | Listed below with concrete dependencies; UI makes no deployment/publication claim. |
| 26 completeness | Every section has an implementation/preservation/dependency disposition in this table. |
| 27 report | Combined concise completion report and this checkpoint inventory. |

## Files

Platform: `src/lifecycle.js`, `src/client-setup.js`, `src/provisioning.js`, `src/operations.js`, `src/supabase.js`, `src/forms.js`, `src/events.js`, `src/state.js`, `src/pages/{clients,billing,overview}.js`, `src/modals/{client,index}.js`, `supabase/functions/platform-{config,provision}/index.ts`, `supabase/functions/_shared/{managed-setup.ts,shop-release.json}`, `tests/{platform-overhaul.test.mjs,platform-overhaul.sql,overhaul-sql.test.mjs}`, updated onboarding test fixtures and this report.

Platform migration: `20261003120000_platform_overhaul_v1.sql`.

Shop: `supabase/functions/_shared/runtime-preflight.ts`, `src/admin/pages/billing-usage.js`, `scripts/build-platform-release.mjs`, `tests/{config-journal.sql,platform-overhaul.test.mjs}`, updated onboarding fixture imports for current branding/legal gate, and `docs/PLATFORM_OVERHAUL_V1.md`.

Shop migration: `20261003121000_config_request_journal.sql`.

## Validation and manual smoke tests

Validation: Platform 84/84 focused tests, Shop 52/52 focused tests; zero failures/skips. The Platform count includes three in-process SQL tests covering both repositories and the actual managed migration envelopes. Both production builds passed; both `git diff --check` checks passed. Production builds use synthetic public values and isolated ignored output; those artifacts are not deployable account configuration. In-process PostgreSQL executes both full migration chains, focused lifecycle/recovery/stage fixtures and the actual managed migration envelopes with replay. Crypto/bcrypt and Vault are substitutes, not hosted encryption evidence. Its existing PGlite 0.3.14 test runtime is required in the sibling Shop `node_modules/.legal-test-runtime`; missing-runtime tests are explicitly skipped, never counted as passed.

Remaining hosted/manual checks (no hosted operations performed here):

1. Validate scoped Management API access to the selected separate test Shop; verify a Platform target, BYO target and mismatched Shop binding are rejected.
2. Install the approved artifact on a disposable authorized Shop; confirm CLI-compatible migration versions, ZIP imports/gateway flags and all six functions. Interrupt each stage and exercise same-request recovery, including timeout-after-migration commit/function deploy/secret write.
3. Verify live Vault encryption and UUID-based operator authorization/RBAC under hosted roles; test anonymous/portfolio/billing denials for recovery/retirement/rotation.
4. Verify Turnstile secret/site pairing, allowed hostname, browser CAPTCHA, DNS/TLS, Cloudflare SPA paths and Auth redirect URLs. Optional email invitations/custom SMTP remain hosted-only.
5. Complete manual owner Auth activation and all six onboarding steps, refresh Platform status to Active, and verify unpublished legal entry/staff bypass, suspension and reactivation.
6. With two browser sessions, race recovery/provision submissions and verify one pending operation/recovery lease. In-process SQL checks uniqueness and state locks, but does not prove hosted cross-process concurrency/Edge execution limits.
7. Archive a disposable reachable Shop after suspension; separately destroy a disposable Shop externally and archive it offline. Verify retained invoice/payment/usage/audit rows and no late callback resurrection or scheduler dispatch.

## Explicit deferrals

Automatic Supabase project creation; Cloudflare project creation/environment writes; automatic destructive remote decommission; deletion of financial/audit history; arbitrary legacy/untracked business-schema adoption; automatic managed/BYO rebinding; publishable-only gateway migration; final legal publication and provider/professional due diligence. These need separate infrastructure/retention/compatibility review or provider decisions. Manual recording of already completed decommission is implemented, not a remote deletion claim.

Official API contracts were checked against [Supabase for Platforms](https://supabase.com/docs/guides/integrations/supabase-for-platforms) and the [Management API schema](https://api.supabase.com/api/v1-json). No hosted mutations or credentials were used for that documentation lookup.

No commit, staging, push, merge, deployment, hosted migration, live secret change or Cloudflare action was performed. Client 1 and the legal worktree were untouched.
