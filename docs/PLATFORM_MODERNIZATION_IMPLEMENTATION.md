# Platform modernization implementation report and deployment checklist

> Repository status update — 2026-10-04: Modernization/provisioning (5734847/d65d872) and subsequent changes are committed and pushed. Local HEAD and the live GitHub `feature/platform-overhaul-v1` head match at `a054e28`. Current integration target is `developmentv2`. Preserve the original validation/deployment evidence below as a point-in-time record; Git does not prove hosted deployment. See [engineering history](../ENGINEERING_HISTORY.md) for the owner-reported hosted checkpoint and pending smoke gate.

> Superseded onboarding guidance: use [NEW_CLIENT_ONBOARDING_V2.md](../NEW_CLIENT_ONBOARDING_V2.md), [BYO_SUPABASE_ONBOARDING.md](../BYO_SUPABASE_ONBOARDING.md) and [credential cleanup](../LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md). Manual owner activation is the default. Never collect Shop privileged keys or customer account credentials; retired maps/resolvers are unavailable in the current runtime. Historical rollout details below are not current setup instructions.


> This document preserves earlier implementation history. Current onboarding and credential boundaries are described in the V2 documents linked above; old credential maps are not an emergency fallback.

- Preserve clients, usage_logs, billing_cycles, payments, client_credit and pricing_rate_log.
- Match frozen Shop v1: source_id/client_binding, immutable event_id/source_sequence/kind/operation/operation_id/body/occurred_at, per-event ACKs; billing and resupply revisions returned on polling.
- Authenticate per-source secret hashes server-side; configured source maps to exactly one client. No browser identity authority.
- Evolve usage_logs for canonical BILL/INVENTORY/THERMAL; keep original envelopes for conflict detection and audit. Server receipt time determines Platform periods. Thermal is never gated by resupply.
- Exact locked invoice membership and retry-safe payments in PostgreSQL. No inferred fixed fee or carry migration. Accounting activation requires currency, explicit usage policy and legacy review.
- Customer-safe complete versioned projection stored transactionally; no thermal metadata in Shop billing.
- Canonical entitlement desired state and audited server-only delivery via existing Shop service-role REST permissions. Paper flag travels only in billing projection.
- Paper requests, immutable delivered supplies and lifecycle history; expected-version transitions.
- Reuse Client Detail and Billing; replace remote anonymous reads/writes and financial browser writes.
- Add default-deny financial RLS, read access for active operators, narrowly scoped RPC writes.

## Findings requiring deployment decisions

The initial read-only inspection found that live Platform columns, policies and public functions matched the baseline. Three historical invoices existed; invoice 3 included 136 carried from invoice 2, but both invoices also had full payments. This initially required reconciliation. The owner later confirmed the existing clients are disposable test clients; the scoped reset described below resolves their accounting review block when applied during deployment. The owner subsequently confirmed usage-only billing at configured rates, with no fixed fee/tax/discount/allowance, and per-client currencies. New clients default to usage-v1 and must choose a currency. No tax/discount/allowance agreement exists in current implementation.

Shop update-shop-config function is absent from frozen repo. Existing service_role SELECT/UPDATE grants on shop_config and absence of config mutation triggers were verified read-only in reference project. A Platform server can use that existing database API without changing client code; per-project server credentials still require provisioning. Paper entitlement belongs in billing projection, not shop_config.

## Implemented architecture and files

`supabase/migrations/20260925191052_platform_control_plane.sql` is the only new migration. The downloaded baseline is unchanged. It evolves the existing client, usage, invoice and payment records; adds bridge sources, immutable canonical envelopes, failure history, complete billing revisions, paper requests, confirmed supplies, configuration jobs and operator audit. Private credentials are not exposed through the Data API. Sensitive implementations live in `platform_private`; public RPC wrappers have explicit grants.

`supabase/functions/platform-bridge/index.ts` receives the frozen Shop POST contract. Disable gateway JWT verification for this endpoint only: it authenticates the source-specific bearer by SHA-256 lookup, independently of the caller's JSON identity. Requests are stream-limited to 512 KiB and 100 events. A source maps to exactly one Platform client. Every accepted event and its usage/request row commit before any ACK is returned. Identical retries return duplicate; conflicting identities/sequence/operation IDs produce durable rejection history and no ACK. A bad event does not discard other accepted events in the batch. Missing cutover configuration rejects billable usage for retry instead of silently charging or losing it. Thermal events do not need that boundary.

`supabase/functions/platform-config/index.ts` validates a Platform Auth user, calls the role-authorized reservation RPC, then writes ONLY allowlisted booleans through the existing Shop service-role REST interface. The destination and credential come from server secrets, never client-provided URLs. Paper entitlement uses the billing projection, not shop_config. The response is verified before local state is marked applied. A partial failure never reports success. In-flight/uncertain jobs block further writes to that client; retries do not send a second mutation. Explicitly reconcile unknown outcomes before permitting another write. No lease timeout automatically releases this lock, preventing an old request from racing a newer write.

Frontend changes: `src/operations.js`, `src/billing.js`, `src/supabase.js`, `src/events.js`, `src/forms.js`, `src/helpers.js`, `src/main.js`, `src/pages/clients.js`, `src/pages/billing.js`, `src/modals/client.js`, `src/modals/billing.js`. Existing navigation, registry, invoice rendering, payment forms and rate controls remain. Client Detail now shows Platform operational data instead of anonymous Shop sales/employees queries that hardened RLS cannot support. Errors are visible instead of being silently presented as zero. Historical lists are paginated; authoritative usage totals are SQL aggregates.

## Commercial semantics

- BILL is exactly the canonical creation event: retail sale, parent repair invoice, approved child repair invoice. Quantity is one. Payments, settlements, cancellations, returns and printing create no inferred BILL. Old planning references to repair collection BILLs are superseded by the final `20260919043803_phase4_invoice_creation_bill_semantics.sql` client migration.
- INVENTORY is the frozen client's `create_inventory_item` event, quantity one. It does not create extra BILLs for retail cart lines. Legacy UI wording about restock is historical; this contract is inventory-item creation.
- THERMAL stores source metadata unchanged, including copies, estimated mm, document identity, width, measurement/template/calibration versions, reprint links and unavailable measurements. Copies are ALREADY included in estimated_mm and are not multiplied again. Unavailable measurements stay null. Thermal has zero financial rate and is never invoice membership. Paper disabled does not stop collection, history, aggregation or operator visibility.
- New bridge rate snapshots use Platform pricing at receipt time, not browser timestamps or supplied prices. Rate changes and billability toggles affect future ingestions; existing snapshots are retained. Delayed outbox delivery crossing a rate change uses the receipt-time policy. Confirm this commercial rule before activation.
- `usage-v1` implements the existing per-event business model without fixed fees, taxes, discounts or allowances. These concepts had no operative agreed implementation in the inspected engine. Do not activate this policy for a fixed-fee agreement or infer new charges. Those agreements need a separate explicit policy decision/implementation.

## Atomic accounting and history guard

Generate invoice and record payment use one PostgreSQL transaction each, serialized on the client row. Invoices lock and freeze exact eligible usage IDs and update only those IDs. New arrivals stay unbilled. Period start is the earliest included server-recorded usage day, period end is issue day, UTC; due date is the third day of next month, preserving the existing rule. The separate client grace remains three days. Per-event rates/policy/currency are snapshotted. The displayed invoice unit rates are weighted averages where historical rates differ; exact line rates remain in detailed logs. No monthly fixed fee is invented.

Payments have globally unique request IDs, detect conflicting reuse, recalculate partial/paid status and remaining balance, and create the newer projection in the same transaction. Browser request identities persist through timeouts/reload and concurrent clicks. Overpayments are rejected pending a defined credit policy. New invoices leave debt on the original invoice rather than duplicating it as carried debt. Existing `client_credit`, invoices and payments are retained without rewriting history.

**Test data resolution:** The owner confirmed existing clients are test clients and their accounting history need not be preserved. The guarded, audited, idempotent `supabase/maintenance/reset_legacy_test_accounting.sql` clears only legacy usage, invoices, payments and credits for the verified current client IDs **1 and 3**, retains the registry and configured rates, selects PKR for these two test accounts and removes their review block. It refuses to run if either has modern bridge/accounting activity. It is staged for deployment, not executed remotely. Future real client accounting remains protected; no blanket destructive migration was added.


## Billing projection and boundary meaning

Each revision is a complete frozen Shop v1 payload with ISO currency, BILL/INVENTORY current counts, latest 25 invoice summaries, total outstanding across ALL invoices, current uninvoiced estimate, policy version and paper capability. Thermal details never appear in this payload. Currency must be provisioned explicitly; a currency symbol alone is not a safe ISO currency mapping. No projection is published without it.

Revisions increment under the client lock and are stored before delivery; the Shop's existing `bridge_apply_billing` rejects stale and conflicting revisions. Delivery occurs in responses to Shop polls, including empty batches. Platform exchange time is not a positive Shop apply acknowledgement: the frozen protocol supplies no such ACK and no complete outbox backlog count. The UI labels this limitation.

After a verified cutover, `estimate_through` is the largest complete source-sequence prefix starting at `usage_from_sequence`. The frozen Shop assigns every event sequence under its commit-serialized config-row lock, so missing sequences stop the prefix, including missing thermal or resupply events. `billed_through` stops before the first unbilled canonical usage event within that prefix. `settled_through` also stops before any event whose invoice is not fully paid, regardless of later paid invoices. Values are null before a cutover is configured; legacy outstanding debt also prevents a settled claim. The boundary immediately before the first post-cutover event is start minus one. No missing event is assumed delivered and no highest-sequence ACK is used. Exact invoice membership remains authoritative.

Currencies are independently selected per client. Add/Edit Client accepts a three-letter currency code with examples including PKR, USD, EUR and GBP. The backend refuses currency changes once monetary usage/invoices exist; a new currency requires a separate account, never relabeling old debt. Overview groups outstanding amounts by currency and never sums different currencies. Existing test accounts may use PKR without imposing it on future clients.

## Paper operations and thermal audit

Shop-accepted queued resupply requests remain accepted even if the flag is disabled before transport. The trusted Shop already enforced Owner/flag authorization at submission. Platform enforces one active request and immutable event identity. Lifecycle is requested → fulfilled/rejected/cancelled with expected-version checks. Fulfillment requires confirmed supply in the same transaction. The Shop receives monotonic lifecycle revisions on its next poll.

Supplies are immutable delivered records with stable delivery UUID, reference, optional request, rolls, usable length per roll, width, delivered time and operator. Only delivered capacity is stored/counts. Future delivery times are rejected. Retries reuse delivery identity. Requests do not imply delivered capacity.

Client Detail displays lifetime estimated metres, reprint metres, incomplete counts, monthly UTC document/width groups (latest 120 groups), delivered capacity and estimated difference; latest 30 requests/deliveries and latest 20 ingestion failures are shown. Lifetime aggregates include all records. This is software intent with incomplete-history caveats, not physical output, fraud proof or automatic denial logic. No paper price or per-metre charge is inferred.

## Security / compatibility changes

Anonymous financial/registry reads and writes are closed when the migration is applied. Active operator identity comes from Auth UID mapped to `platform_users.auth_user_id`; the existing master email is resolved from `auth.users`, not user-editable metadata. Billing people can perform finance RPCs; portfolio managers can perform configuration/paper RPCs; the master can do both. Nonoperators cannot read the operational tables. Backend authorization is authoritative even if a browser presents stale controls.

Legacy support submissions retain INSERT-only access; sensitive support reads require an operator. User management remains through existing user Edge Functions; removal deactivates retained Platform membership. Check existing Edge provisioning as part of deployment. Existing team users must have correct auth_user_id values and Active status; no email-only authorization fallback was added.

The baseline lacks session_token/session_started_at columns referenced by the old UI. Those failing writes were removed; Supabase manages sessions. Browser plaintext admin_password reads/writes were removed; historical column contents remain untouched and not granted to browsers. New user-controlled HTML in touched operational views is escaped. Hard deletion of clients/accounting history is disabled; use trusted suspension. Workshop's old database column remains but has no new logic.

## Deployment requirements — NOT performed

1. Review this migration and take the normal production backup. The owner resolved the test-accounting and usage-policy decisions; use the narrowly scoped test reset below before activation. Confirm master Auth identity and active team UID mappings. The migration changes authorization globally, so coordinate all legacy clients.
2. Confirm `VITE_PLATFORM_URL` / `VITE_PLATFORM_ANON` / `VITE_PLATFORM_AUTH_EMAIL` in the existing frontend deployment. No privileged key belongs in any VITE variable.
3. Apply the NEW Platform migration only; do not edit/reapply the downloaded baseline. Deploy the two Platform Edge Functions with the checked-in config.toml JWT settings. No remote action was performed by this implementation.
4. For each deployment, read its actual Shop `app_private.bridge_config.source_id`; choose a nonempty binding and random source secret of at least 32 bytes. Insert `bridge_sources` mapping this UUID and binding to the existing Platform client, initially disabled, and insert ONLY the secret's lowercase SHA-256 hex into `platform_private.source_credentials`. Never place the secret in client code. Provision ISO currency separately; do not infer it from Rs./$.
5. Set Shop server secrets `PLATFORM_BRIDGE_ENDPOINT=https://ukbhyerxshteyetwomqy.supabase.co/functions/v1/platform-bridge` and `PLATFORM_BRIDGE_SOURCE_SECRET=<per-source secret>`. Set the same Shop client_binding server-side. Keep usage_mode=legacy/delivery_enabled=false until cutover is agreed.
6. Retired historical step: do not create PLATFORM_SHOP_CREDENTIALS or collect Shop service keys. Use managed/BYO bridge pairing and the metadata-only cleanup guide.
7. After the additive migration, run the reviewed test-accounting reset script for clients 1 and 3 before activating their bridges. Usage-v1 is now the owner-confirmed policy. New clients select their own currency in the UI. Non-test historical reconciliation is still guarded. Publish via the next authenticated bridge poll.
8. Schedule the Shop's existing platform-bridge Edge Function server-side using its service-role authorization, at an agreed interval (for example one minute), including empty polls. This task creates no cron or remote secret. Scheduling cannot run from a browser. Watch failed calls and Platform event failures.

### Explicit legacy cutover

Pause writes briefly for the coordinated cutover. Retire/refresh cached older Shop bundles. For the current two disposable test clients use the test-accounting reset. For future existing real clients reconcile legacy counts/invoices; do not fabricate IDs. While the Shop bridge_config row is locked, capture `last_sequence + 1` as the first bridge-owned sequence, set usage_mode=bridge, and record that exact boundary plus an operator note in Platform bridge_sources. This is a cross-project operational cutover, not a distributed transaction; keep traffic paused until both sides and source bindings are verified. Close the Platform anonymous legacy path via this migration before releasing Shop traffic, then enable source/delivery and scheduling. New events below the boundary, if deliberately presented for reconciliation, are retained excluded; held_legacy outbox history must NOT be released wholesale. Null boundary leaves usage retryable, not billable. Thermal remains ingestible independently. Client history cannot be automatically deduplicated against legacy rows without operation IDs, so no automatic backfill is claimed.

### Config uncertainty recovery

If a job remains sending/uncertain, stop new writes for that client. After the prior request has definitively completed or failed, read the allowlisted Shop config with its server credential. The Client Detail “Read current Shop settings” action can inspect the allowlisted values without mutation. If it matches the reserved changes, use service-only `platform_finish_config(request_id,'applied',verified_full_config)`; otherwise investigate and finalize failed only when the old operation can no longer arrive. Do not automatically expire the unique in-flight lock or blindly replay a PATCH. Browser retries then observe the completed job. Missing credentials cause no remote mutation. Known pre-dispatch errors and definitive Shop rejections release the browser retry identity; unknown network outcomes retain it.

## Validation / live acceptance

Local PostgreSQL 18 disposable fixture uses a minimal Auth stub: it is not a hosted JWT, gateway or deployment test. Baseline plus new migration applied successfully. `tests/control-plane.sql` checks durable duplicate/conflict handling, source binding, legacy exclusion, thermal with flag OFF, BILL/INVENTORY separation, exact invoice membership, invoice/payment retries, partial/full settlement, authorization/RLS, canonical Technician flag, one config dispatch, paper lifecycle versioning, delivered supply idempotency and flag-independent history. It rolls back.

`tests/concurrency.mjs` runs two actual database sessions: ingestion during an uncommitted invoice waits, then remains unbilled. It leaves fixture rows only in the disposable database. `tests/verify-shop-projection.mjs` reads the frozen Shop SQL function without modifying that repo and proves the actual client function accepts the generated Platform payload and rejects delayed v17 after v18 and conflicting v18. `tests/operations.test.mjs` checks browser retry identity and definitive rejection recovery. No existing automated test script was present.

To repeat locally, create a disposable *_check database with anon/authenticated/service_role (BYPASSRLS) roles; run tests/local-bootstrap.sql, baseline, new migration, then control-plane.sql using psql with ON_ERROR_STOP. For the Node SQL checks set PGHOST/PGPORT/PGUSER, PSQL, PLATFORM_TEST_DB and SHOP_REPO (read-only path); run both .mjs scripts. Run `node --test tests/operations.test.mjs` and `npm run build`. Do not run fixture bootstrap against a remote database.

Manual deployed smoke:
- Provision one source; missing/wrong credential and mismatched binding must fail. Replay an event: one usage row. Conflicting payload: failure recorded/no ACK. Retry after outage.
- After the explicit cutover, one retail/parent/approved-child creation gives one BILL; later payments/prints give none. INVENTORY stays separate.
- Thermal print/reprint and unavailable measurement appear with paper service ON and OFF; raw thermal data never appears in Owner billing.
- Generate one invoice; retry; add usage during generation; only exact membership is billed. Partial/full payment and retry produce correct outstanding and a newer Owner projection.
- Toggle Technician/Repairs/Inventory/Tracking/EMS via the Platform backend, reload Shop config; test unauthorized operator denial and missing/uncertain credential outcomes. No legacy workshop alias writes.
- Enable resupply, submit once, fulfill with a confirmed delivery; next Shop poll reflects terminal lifecycle and allows the next request. Disable flag and confirm thermal collection continues.

No commits, pushes, deployment, remote migration application or client-code edits were made.

### Final local results

- Production build PASS: Vite 5.4.21, 63 modules. Existing CJS API and static/dynamic-import chunk warnings remain nonfatal.
- Baseline + additive migration PASS on disposable PostgreSQL 18.4; final invoice function change rechecked against invariant suite.
- Control-plane SQL invariants PASS; two-session invoice/ingestion race PASS; actual frozen Shop projection application/stale/conflict checks PASS.
- Browser retry unit tests: 2/2 PASS.
- Both Edge Function TypeScript files pass esbuild syntax transformation. No full Deno type-check or hosted Edge/JWT integration claim.
- No full browser acceptance or client regression was run. No existing Platform test script was available.


## Completion update (2026-09-27)

All requested local implementation work is ready for deployment and operator acceptance. No remote changes were made. The added `tests/currencies-boundaries.sql` verifies independent USD/EUR currencies, immutable ledger currency, gaps, late ingestion and out-of-order invoice settlement. `tests/test-accounting-reset.sql` verifies the actual maintenance script, its scope and repeat-run behavior. Both pass with the original SQL invariants, concurrency test, frozen Shop version test and retry tests. Remaining operational steps are applying the migration/test reset, source and secret provisioning, bridge scheduling and live acceptance, all excluded from the original authorization.

A development-only **read-only sample preview** is available at `/preview.html` when running Vite. It imports actual production screen renderers and clearly labels synthetic sample data. It does not call hosted databases or perform mutations, and it is not included in the production `index.html` build. This is a visual preview, not a claim that production deployment is complete. Start Vite for preview with process-only `VITE_PLATFORM_URL=http://127.0.0.1:55440` and `VITE_PLATFORM_ANON=preview-only` to initialize the unused Supabase client without real credentials. For real application use, supply the actual public frontend configuration and deployed backend.

Final continuation result: production build PASS (63 modules), both Edge files and the sample preview pass syntax checks; `git diff --check` PASS. Preview responds HTTP 200 at http://127.0.0.1:4181/preview.html and has been queued in the app browser. No full Deno type-check or hosted integration test is claimed.


## Client provisioning and Turnstile follow-up (2026-09-27)

Normal onboarding now uses Client Detail: project/binding and one-time credential submission, Provision, module controls, Verify, then separately confirmed Activate. New private Vault credential/job records and service-only RPCs reuse existing bridge_sources, source_credentials, billing publication, role checks, config jobs and operator_audit. No accounting semantics or existing migration changed. Activation records a durable exact cutover plan before switching the frozen Shop's existing configuration, leaves held_legacy history untouched and resumes partial completion with the same request identity. No Shop files changed.

New Edge Function: platform-provision (authenticated master-admin operations, plus dedicated-secret scheduled dispatch). That historical privileged resolver has been retired; current platform-config uses only dedicated bridge-call credentials. Management API automation sets Shop Edge secrets and executes only fixed parameterized bridge_config statements. A single Platform scheduler automatically polls enabled Vault-managed clients; its installation is staged as a maintenance script. Existing client schedulers remain until adoption.

New migration: supabase/migrations/20260926234425_client_provisioning.sql. New scheduler installer: supabase/maintenance/install_platform_bridge_schedule.sql. Both require manual review/application. The reset for disposable test accounts is never called by onboarding. Master-only provisioning is enforced in PostgreSQL; ordinary operator RPC responses have no credentials. Existing module/config dispatch is serialized against pending provisioning and audited.

Turnstile is rendered explicitly with a widget ID and generation guard. Login/password reset send captchaToken to Supabase Auth, require fresh verification after failure, and clean up before navigation. Offline/script/service errors retain the screen and disable submission, with retry and online recovery. There is no localhost bypass. Server enforcement requires the administrator to enable Supabase Auth CAPTCHA with the Turnstile secret; only VITE_TURNSTILE_KEY is public.

One-time manual deployment: apply the new migration, deploy platform-provision and updated platform-config, set PLATFORM_MANAGEMENT_TOKEN, configure the shared polling schedule and its two Vault values, enable Auth Turnstile enforcement, configure permitted hostnames/redirects and deploy the frontend. Per-client provisioning, verification, module controls, confirmed activation and credential rotation then use the UI. The complete operator guide and recovery rules are in CLIENT_PROVISIONING.md.

Validation for this follow-up: no automated tests, browser automation, local SQL execution, hosted tests, remote changes, commits or pushes. The single permitted production build passed (Vite 5.4.21, 65 modules; existing nonfatal CJS/chunk warnings). git diff --check passed. This frontend build does not compile or runtime-validate the Edge Functions or SQL. Historical test results above apply only to the earlier modernization.

## Scheduler authentication correction (2026-09-28)

Replaced the brittle equality check against the runtime service-role JWT with PLATFORM_SCHEDULER_SECRET, matched to Vault orbito_platform_scheduler_secret. Only platform-provision now has gateway verify_jwt=false; its operator getUser/master-admin authorization remains intact. Scheduler access accepts exactly the dispatch body. The shared cron keeps its existing name, one-minute interval, endpoint and 90-second timeout. The old Vault service-role entry is retained for other tooling. No migrations, provisioning/cutover or accounting changes. See CLIENT_PROVISIONING.md and SCHEDULER_AUTH_FIX.md for rollout and targeted local test results.

## Dedicated Platform-to-Shop call credential (2026-09-28)

Dispatch now resolves a per-client Vault-backed PLATFORM_BRIDGE_CALL_SECRET instead of sending the Shop service-role JWT. The new additive migration adds current/pending call-secret references and service-only lifecycle/health functions. Existing service-role management/config access, scheduler authentication, source-secret rotation, cutover and accounting remain unchanged. New provisioning installs the credential; master-only provision-call and rotate-call support backfill/rotation without client recreation. Safe per-client diagnostics distinguish missing credentials, HTTP failures, network failures and invalid responses.

See [BRIDGE_CALL_CREDENTIAL.md](BRIDGE_CALL_CREDENTIAL.md) for the exact change manifest, implementation report and deployment checklist. Validation: 40/40 targeted mocked/static tests and git diff --check passed; no database runtime test or frontend build. No Shop edits, live mutations, migrations applied, deployments, commits or pushes. A separate Shop session must implement strict call-secret authentication and per-function verify_jwt=false before live use.
