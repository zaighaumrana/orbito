> Historical planning reference. Current Platform implementation, final Shop contract, billing blockers and deployment requirements are documented in [PLATFORM_MODERNIZATION_IMPLEMENTATION.md](PLATFORM_MODERNIZATION_IMPLEMENTATION.md). Where these differ, the implementation document and final client code take precedence.

# OrbitoShop → Orbito Platform: Billing & Usage Summary / Platform Bridge

**Canonical handoff · 2026-09-16 · Documentation/planning only**

Companion: [Paper Resupply & Thermal Usage](orbito-paper-metering-platform-handoff.md). These documents define **one shared bidirectional Platform Bridge**. This document owns the common transport, billing projection, cutoff, and access contract; the companion owns paper-specific event measurement and resupply rules.

Evidence: read-only inspection of `Orbitoshopv2-v1-development (4).zip`. No application code, database, or Phase 3 business rules were changed. Platform source and deployed database policies were not available. Names marked **proposed** are design concepts to map to both repositories before implementation, not existing tables, helpers, or endpoints.

## 1. Purpose and fixed product rules

- Add an Owner-only **Billing & Usage** section showing customer-safe usage and billing summaries.
- Platform owns commercial money: invoices, periods, pricing versions, allowances, discounts, tax, adjustments, payment/settlement status, outstanding balances, cutoffs, and supply fulfillment.
- Shop owns operational usage generation, immutable local usage/print events, resupply submission, and durable outbound capture. These local metering guarantees are proposed; the current logging helpers do not provide them.
- Shop displays a small read-only Platform projection. It never decides an invoice is paid from local sales, receipt counts, or payment arithmetic.
- Keep Phase 3 customer repair/sales money separate from the SaaS charges the shop owes Orbito. Preserve existing ledger, payment allocation, and delivery semantics.
- Paper metering remains hidden. `paper_resupply_enabled` controls only the Owner's **Request Resupply** button within Billing & Usage, never usage capture or sync.

## 2. Existing repository findings

Paths and line references below refer to the supplied ZIP's repository root.

| Confirmed source | Current behavior |
| --- | --- |
| `src/shared.js:22–50` | `getPlatform()` creates a separate Supabase client using `VITE_PLATFORM_URL` / `VITE_PLATFORM_ANON`. Browser helpers directly insert into Platform `usage_logs`. No Platform session exchange is shown in this helper. |
| `src/shared.js:31–49` | `CLIENT_ID = Number(VITE_CLIENT_ID || 1)`. `logBillEvent()` sends `module_type: 'BILL'`, `token_count: 1`, `rate_at_log: 5`; `logInventoryEvent()` sends `INVENTORY`, `1`, `1`. These constants are client-supplied values, not proof of authoritative pricing. |
| `src/features/pos/checkout/api.js:108` | Calls `logBillEvent()` after retail checkout. |
| `src/features/pos/repairs/api.js:48,72` | Calls `logBillEvent()` after repair creation and repair payment. Thus “receipt-count” is currently a business-event integration, not a physical print count. |
| `src/features/admin/inventory/api.js:43–58` | `submitInvAdd()` uses `create_inventory_item` with `p_request_id`, then calls `logInventoryEvent()`. Its in-memory pending request map is not a durable Platform outbox. |
| `src/shared.js:153–183,559–573` | Session comes from Supabase Auth plus active `app_users`; `ACCESS` and `can()` gate modules. `isAdmin` includes both Business Owner and Orbito Support. |
| `src/admin/admin.js:30–40,136,151–154,1371`; `src/main.js:62–69` | Back Office dropdown uses `ADMIN_MODULES.filter(can)`. Module entry and route guards also use `can()`. No Billing & Usage module is present in the inspected lists. |
| `src/shared.js:217–223,251–263` | Configuration uses `get_public_shop_config` / `get_app_config`. `currentTenant()` returns shop presentation/configuration, not an authenticated Platform tenant identifier. |
| `src/print/print.js:4–21` | `printThermal(html)` uses an 80 mm iframe and delayed browser printing. This is a capture point; it does not currently provide thermal-length metering. |
| `supabase/migrations/20260903165753_phase2_auth_foundation.sql` | Defines `public.app_users`, active-role helpers, and a single-owner index; `app_private.current_app_role()` derives role from `auth.uid()` and active profile. `current_client_access_allowed()` includes suspension checks. |
| `supabase/migrations/20260903181153_phase2_authenticated_rls.sql` | Establishes database grants/RLS and role-based access patterns. Many existing policies include Manager/Support and must not be copied indiscriminately for Owner billing. |

**Observed gaps:** Logging helpers have no stable usage ID, durable sequence, explicit actor/source reference, persisted retry, or deduplication key. They catch thrown errors but do not inspect the insert response's `error` field. Logging happens after the operational RPC and is awaited, leaving a crash/loss window and potentially delaying UI completion. The source does not establish transactional usage capture. No billing projection, billed/settled cutoff, or paper service implementation was found in the inspected paths/searches.

The archive cannot establish Platform `usage_logs` schema, RLS, invoice consumption, rate interpretation, or how deployed credentials are provisioned. Browser `anon` configuration alone proves neither safe authorization nor an exploitable policy; verify Platform enforcement. Browser-provided identity and rates must not become trusted accounting inputs.

## 3. Owner Billing & Usage UX

Use the existing Back Office module dropdown. **Proposed module key:** `billing-usage`, with label **Billing & Usage** and route `/admin/billing-usage` following the existing module convention. Add it to the module/route lists and only `ACCESS['Business Owner']`; enforce `can()` before rendering, loading data, and handling actions. These are planned edits, not existing names. Owners using POS can use the existing Admin navigation; do not introduce duplicate billing screens.

Show a compact summary:

| Display | Meaning |
| --- | --- |
| Current usage | Customer-safe billable counts for the stated current window; exclude hidden thermal lengths and supply data |
| Outstanding Invoice | Actually issued and still unpaid; invoice reference, period, status, amount outstanding |
| Estimated Current Charges | Un-invoiced usage after the billed boundary, subject to Platform reconciliation; never label “Amount Due” |
| Recent invoice / settlement | Recent billing reference and Platform-provided paid/partial/unpaid status |
| Last synced | Timestamp and stale warning; unavailable is not zero or paid |
| Request Resupply | Button only if `paper_resupply_enabled = true`; brief success/error acknowledgement |

Optional **Estimated Total** = outstanding issued amounts + estimated current charges, only for the same currency and compatible snapshot. Example: invoice outstanding Rs. 2,000 + current estimate Rs. 650 = estimated total Rs. 2,650. After Platform records full payment, outstanding becomes Rs. 0 / PAID; current estimate remains Rs. 650.

For multiple open invoices, show total outstanding and a compact recent-reference list; do not pretend the latest invoice represents all debt. Keep internal pricing rules, raw audit events, anomaly scores, reconciliation notes, operator corrections, and forensic data out of the projection. Paper consumption, roll balances, and supply history remain hidden even from the Owner. A monthly customer statement may include an approved paper breakdown.

## 4. Data ownership boundaries

| Domain | Authority | Shop use |
| --- | --- | --- |
| Operational usage and print intents | Shop backend | Capture immutable events, retain history, deliver through bridge |
| Resupply request creation | Shop backend | Accept Owner submission; deliver with stable request ID |
| SaaS invoices, payments, rates, taxes, allowances, corrections | Platform | Read customer-safe projection only |
| Supply/fulfillment history | Platform | Optional internal request-state mirror for deduplication; no customer supply ledger |
| Billing/configuration projection | Platform | Read-only cache, version-checked trusted updates |

The Shop mirror is a cache, not a second accounting ledger. Local shop-customer payments do not settle Orbito invoices. Only Platform-originated authoritative revisions change SaaS settlement state.

## 5. Shop → Platform usage flow

Extend the existing integration destination and billing semantics through **one bridge adapter**, with common tenant binding, credentials, envelope versioning, retries, and observability. Do not add an unrelated paper transport or subscription sync. Physical endpoints/workers may differ where technically necessary but implement this same contract.

Proposed flow: successful operational action → immutable Shop usage event + durable outbox → trusted bridge → Platform deduplication/canonical ingestion → acknowledgement. Thermal print intents and resupply requests enter this same outbox. Map `BILL` and `INVENTORY` to existing consumers before introducing new metric codes; paper is a separate metric and must not increment `BILL`.

**Proposed common event envelope:** `schema_version`, trusted `client_id`/source binding, stable `event_id`, `source_stream_id`, durable `usage_seq`, event/metric type, source operation ID, quantity/unit, actor, occurred/recorded timestamps, and type-specific payload. Reuse actual column names once discovered. Paper payload follows the companion document. No customer receipt contents need to be exported.

For operational events, plan atomic local event/outbox capture alongside the existing successful operation or a durable reconciliation mechanism keyed to its canonical operation ID. This is an additive reliability change, not a change to Phase 3 financial semantics. Do not claim atomicity for the current post-RPC browser logging. Retries must represent the same action once; distinct genuine actions/reprints have distinct IDs.

## 6. Platform → Shop billing projection

**Proposed logical entity:** `platform_billing_projection`, named to fit the existing snake_case database conventions. It is not present or prescribed as a migration. Reuse any equivalent found during Platform inspection. Keep it separate from operational sales/repair records and from broadly returned `shop_config` data.

| Proposed fields/group | Contract |
| --- | --- |
| `client_id`, source binding | Trusted mapping to this Shop, never browser-selected |
| `invoice_id`, `invoice_number`, `period_start`, `period_end` | Most recent/relevant invoice summary; a compact invoice collection is required if multiple invoices are outstanding |
| `billed_through_usage_seq`, `settled_through_usage_seq` | Scoped to identified source stream; boundary rules in section 7 |
| `invoice_total`, `paid_amount`, `outstanding_amount`, `invoice_status` | Platform-calculated invoice values; exact fixed precision or minor units with declared currency scale |
| `outstanding_total`, current usage/estimate summary | Customer-safe totals; distinguish invoice totals from account totals |
| `currency`, `pricing_version`, safe estimate snapshot | Public-facing estimate inputs only if needed; no internal commercial rules |
| `estimate_through_usage_seq`, estimate period | Coverage of Platform's current estimate, distinct from billed cutoff |
| `platform_updated_at`, `sync_version`, `schema_version` | Authoritative revision, compatibility, and timestamp |
| Local `last_synced_at` | Successful receipt time, not proof of newer content |

Return/apply the complete tenant projection atomically so status, money, and cutoffs cannot come from different versions. Customer billing data must not be added to `get_public_shop_config`; avoid returning it to all staff through `get_app_config`. A protected Owner read operation should use the existing authenticated Shop API/RPC conventions, with its exact name selected during implementation. Bridge writer credentials remain backend-only.

Platform should preferably provide the current estimate. If Shop computes a provisional increment, use only a Platform-issued customer-safe pricing snapshot and only events beyond the estimate coverage boundary, without double counting. If pricing/allowances cannot be represented safely or are stale, show the last estimate as stale rather than inventing a charge. Actual invoicing always recalculates on Platform.

## 7. Usage cutoff / billed / settled semantics

Stable event IDs are required. A durable per-source sequence can compactly express a fully accounted prefix; it is not the same as a sync delivery acknowledgement or a timestamp. Do not assume a database auto-increment sequence guarantees commit order or completeness. Serialize publication or track gaps explicitly; do not advance a billed boundary past missing/unclassified events.

Platform invoices retain explicit event membership or equivalent immutable usage ranges plus policy snapshot. `billed_through_usage_seq` means every eligible event up to that point is accounted for by issued invoices or explicit recorded exclusions. `settled_through_usage_seq` means the contiguous billed prefix is fully settled. Partial payments do not advance a full-settlement boundary. Paying a newer invoice while an earlier one is unpaid cannot advance settlement past the gap. Invoice status remains authoritative independently of these convenience watermarks.

Example: events 101–160 belong to the September issued invoice. Its outstanding amount is shown separately. Events after 160 contribute to the un-invoiced estimate **immediately when the invoice is issued**, not only when it is paid. Once Platform settles that invoice, it may advance the contiguous settlement boundary to 160 and publish outstanding = 0 / paid; post-160 estimates remain unchanged.

Never delete old usage, reset a ledger, or calculate SaaS debt as “lifetime usage total minus payment amount.” For multiple streams use per-stream boundaries and invoice event membership, not a global maximum. Late/backfilled events receive a new ingestion position and retain their original occurrence time; assign them by explicit reconciliation or a later adjustment. Finalized invoices are not silently rewritten. Reversals/credits use explicit records and a newer projection, not destructive edits; a newer valid revision may change payment state, while an older delayed revision may not.

## 8. Offline / outbox / retry behavior

Platform unavailability must not block POS/repair completion while the Shop backend remains available. Capture locally in the Shop database and sync asynchronously. Separate delivery status from immutable event contents. If the browser cannot reach Shop, persist supported print/request intents in a durable device queue with stable IDs; do not claim existing full offline sales support or mark an unconfirmed financial operation successful. Device storage can be cleared, so it is not a tamper-proof ledger.

Show the last good billing projection and “Last synced … / may be out of date.” A missing projection means unavailable, not no debt. Refresh failure must not suspend the account or alter existing entitlement rules. After reconnection, deliver pending events, let Platform reconcile, and apply its newest projection. A failed resupply submission gets brief error feedback; success requires durable Shop acceptance, even if onward Platform delivery is queued.

## 9. Versioning, idempotency, and concurrency

- Outbound uniqueness: `(trusted client/source, event_id)`; retries reuse ID and payload hash. Reject conflicting payload reuse. Resupply has one active request per tenant, atomically enforced.
- Acknowledge only after durable Platform commit. Commit imported data and consumer checkpoint together; replay is safe. Unknown/incompatible payloads are quarantined, not silently discarded.
- Inbound: atomically apply a complete projection only if incoming `sync_version` is greater than stored version for that tenant/source. Equal identical revisions are no-ops; equal conflicting revisions are flagged. Lower versions cannot overwrite newer data.
- Version 18 (paid) must survive a delayed version 17 (unpaid). Use database compare-and-update/transaction protection, not a browser-only comparison. A server timestamp alone is not the ordering mechanism.
- Reuse existing cursor/event mechanics if found. The current helper shows push inserts, so a new pull API is not assumed. Both directions need retry/backoff, durable checkpoints, explicit backfill/retention, and operator-only failure/lag monitoring.
- Deployment must prevent legacy direct logging and bridge ingestion from billing the same operation twice. Plan a cutover boundary and reconciliation of legacy rows that lack stable IDs; do not fabricate historical event identity.

## 10. Permissions / RLS / security

Use the existing Auth + active `public.app_users` identity model. For new Owner reads/request submission, combine the applicable existing client-access check with `app_private.current_app_role() = 'Business Owner'`. Confirm current definitions in the deployment. Do not authorize from browser role strings, editable metadata, or `SESSION.isAdmin` (which includes Support). No new access for Manager, Cashier, Technician, or client-side Support sessions is implied.

New projection storage needs narrowly scoped SELECT permission for the active Owner of the mapped Shop; no browser INSERT/UPDATE/DELETE. Trusted bridge/backend alone writes it. Raw usage/supply/audit records remain inaccessible to customer roles. Backend procedures validate authenticated actor and document ownership before accepting events; employees may generate authorized operational usage without being allowed to read SaaS billing.

Existing single-owner/config patterns suggest a Shop-project boundary, but do not establish a Platform tenant mapping. Bind each Shop backend/source credential to a Platform client in server-controlled configuration. Never trust `VITE_CLIENT_ID`, its fallback `1`, or `currentTenant()` for cross-tenant authorization. Test isolation even if deployment currently uses one project per Shop. Keep Platform privileged keys out of Vite/browser bundles. Preserve existing auth/RLS semantics elsewhere; do not broaden existing generic config endpoints.

## 11. Paper Resupply integration

Inside Owner Billing & Usage, show **Request Resupply** only when `paper_resupply_enabled = true`. If false, hide the paper action without hiding Billing & Usage. After submission show only a brief acknowledgement. Never expose paper length, roll counts, supplied capacity, supply ledger, anomaly flags, or fulfillment calculations in this section.

Thermal events continue with the flag ON and OFF. Submit requests through the common bridge; Platform owns `requested`, `fulfilled`, `rejected`, `cancelled` history. Optional `approved`/`dispatched` logistics states are not required. An internal versioned request mirror may return through the same bridge for duplicate protection, not a second paper sync. The companion's software-print-intent limitation remains in force.

## 12. Existing receipt-count integration mapping

| Existing element | Reuse / hardening plan |
| --- | --- |
| `getPlatform()` / Platform destination | Reuse destination/consumer mapping; move privileged delivery to the common trusted backend adapter after checking Platform auth |
| `logBillEvent()` | Preserve confirmed billable business triggers; replace unreliable delivery with canonical event capture; do not equate every thermal print with BILL |
| `logInventoryEvent()` | Include existing inventory-create usage in the same bridge; preserve the agreed billing meaning |
| `usage_logs` | Inspect its schema, policies, consumer, and invoice links before choosing ingestion storage; adapt rather than create an unrelated billing system |
| `VITE_CLIENT_ID` | Migration input only; replace trust with backend source-to-client binding |
| `CLIENT_EVENT_RATE`, `CLIENT_INV_RATE`, `rate_at_log` | Legacy client suggestions/values; verify historical consumer behavior and use Platform-owned versioned pricing for new invoices |

No Platform consumer code is supplied, so current invoice aggregation and settlement behavior remain unknown. Do not import shop sales tax/rates as SaaS commercial policy.

## 13. Platform cleanup checklist and exact inspection scope

Before coding: locate Platform `usage_logs` schema/RLS and readers, authentication/provisioning, tenant registry, invoice/payment records, current commercial rules, billing timezone/periods, any usage IDs/cursors, entitlement writer, and existing sync workers. Map equivalent projection/cutoff fields; choose transport within the existing integration; define legacy cutover and reconciliation. Establish role restrictions, retention, failure handling, and versioned projection publication. Validate one tenant before expanding.

**Exact files examined for this handoff** (targeted source ranges/searches, not a full repository audit):

- `src/shared.js`
- `src/main.js`
- `src/router.js`
- `src/auth.js`
- `src/admin/admin.js`
- `src/pos/pos.js`
- `src/pos/workshop.js`
- `src/features/pos/checkout/api.js`
- `src/features/pos/repairs/api.js`
- `src/features/admin/inventory/api.js`
- `src/features/admin/checkout/receipts.js`
- `src/print/print.js`
- `supabase/migrations/20260903165753_phase2_auth_foundation.sql`
- `supabase/migrations/20260903170222_phase2_auth_bridge_helpers.sql` (identity/role search matches)
- `supabase/migrations/20260903171448_phase2_security_helpers.sql`
- `supabase/migrations/20260903181153_phase2_authenticated_rls.sql`

Archive-wide relevant text searches supplemented these reads. Findings describe this snapshot, not verified production configuration. Outstanding decisions require the Platform repository: actual invoice schemas/statuses, multi-invoice handling, durable stream mechanism, authoritative rates/currency/rounding, tenant binding, settled-boundary reversals, entitlement sync, and deployed policies.

## 14. Future implementation acceptance tests

- **Owner:** module visible; correct invoice reference/period/status; issued outstanding separate from current estimate; last-sync and unavailable/stale states; multiple outstanding invoices summarized correctly.
- **Other roles:** Manager, Cashier, Technician, and client Support cannot enter the module, call protected reads, or submit Owner-only resupply requests. Tampered role/tenant inputs fail backend checks. Normal staff usage capture continues.
- **Billing:** unpaid projection arrives; Platform records payment; newer projection removes old outstanding while post-cutoff estimates remain; historical usage persists. Test partial payment, out-of-order invoice settlement, currencies/rounding, and missing sequence gaps.
- **Concurrency:** delayed unpaid revision cannot overwrite paid; duplicate same-version payload is safe; conflicting same-version payload is rejected; amounts/status/cutoffs update atomically.
- **Reconciliation:** late usage, explicit corrections, reversals, finalized periods, and legacy cutover do not double-charge or silently rewrite history. BILL and paper remain separate metrics.
- **Offline:** Platform failure does not block normal Shop operations; local outbox captures usage; stale billing is clear; reconnect/retry imports once and returns current projection. Test lost acknowledgements and device/Shop outage limitations separately.
- **Paper:** eligible prints meter with flag ON and OFF; only button visibility changes; hidden paper data never leaks in projection; duplicate click/timeout retries yield one request; minimum lifecycle works without optional states.
- **Regression:** existing Phase 3 ledger, allocations, advance/Udhar semantics, auth, inventory calculations, and printing remain unchanged. Run appropriate build/tests and targeted UI/backend checks during implementation; no runtime feature tests were run for this documentation-only update.

## 15. Final architecture summary

**SHOP:** operational actions and thermal prints → immutable local usage + durable outbound delivery. Owner Billing & Usage → protected Platform projection, separate invoice outstanding and current estimate, freshness indicator, optional resupply button. No local determination of SaaS settlement.

**ONE PLATFORM BRIDGE:** shared trusted tenant binding, stable IDs, retry-safe ingestion, versioned projections, and optional entitlement/request mirrors. No disconnected paper/billing integration.

**PLATFORM:** canonical usage → commercial calculations and invoices → payment/settlement and cutoffs → customer-safe Shop projection. Platform alone owns supply accounting, anomaly review, corrections, and monthly statements.
