> Historical planning reference. Current Platform implementation, final Shop contract, billing blockers and deployment requirements are documented in [PLATFORM_MODERNIZATION_IMPLEMENTATION.md](PLATFORM_MODERNIZATION_IMPLEMENTATION.md). Where these differ, the implementation document and final client code take precedence.

# OrbitoShop → Orbito Platform: Paper Resupply & Thermal Usage

**Handoff date:** 2026-09-16  
**Audience:** Developers cleaning up the separate Orbito SaaS platform repository.  
**Scope:** Hidden thermal-paper metering, resupply requests, and platform accounting.
**Status:** Canonical revised handoff; supersedes the earlier version. Documentation only—no application code changes.

**Shared architecture:** [Billing & Usage Summary / Platform Bridge](ORBITOSHOP_PLATFORM_BILLING_USAGE_BRIDGE.md) defines the common bidirectional bridge, Owner authorization, billing projection, cutoffs, and versioning. This document adds paper-specific behavior to that same bridge; it does not define a separate integration.

## 1. Contract status and fixed requirements

Based on the supplied conversation, the user's corrections, and read-only inspection of `Orbitoshopv2-v1-development (4).zip`. The separate Platform repository and deployed databases were not inspected. **All new table names, route names, endpoint names, and transport mechanics below remain proposed until mapped against the actual Shop and Platform repositories.** Existing code findings are identified separately in section 8; intended behavior must not be mistaken for shipped functionality.

- **Paper Resupply Service** uses `paper_resupply_enabled = true / false`. Its only purpose is button visibility inside the Owner-only **Billing & Usage** section: ON shows **Request Resupply**; OFF hides it. It must never gate thermal usage collection, persistence, retries, or sync, or hide the Billing & Usage section itself.
- Thermal usage metering continues independently for every eligible thermal print, with the service ON or OFF.
- For the paper service, the Owner sees only **Request Resupply** and brief success/error acknowledgement after submission. No paper consumption, roll count, estimated remaining rolls, supplied capacity, raw paper usage history, paper audit data, anomaly data, or fulfillment calculations are visible. Billing & Usage separately shows customer-safe usage/estimated charges and authoritative invoice status from the common Platform projection; this does not authorize a paper inventory/audit dashboard.
- The client cannot edit metering data or supply records. Brief submission confirmation/error feedback is allowed; do not add a client inventory dashboard.
- Meter eligible thermal documents, including repair parent, child invoice, repair summary, and retail receipt. Count reprints and multiple copies as additional estimated consumption.
- Expose usage to Orbito Platform alongside the existing receipt-count integration. The platform owns aggregation, supply accounting, anomaly review, commercial rules, and monthly statements.
- Any customer-facing usage breakdown belongs on the end-of-month invoice/statement, not in the client application.

**Measurement limit:** This estimates what OrbitoShop prepares and dispatches for printing. A browser cannot prove physical output, print-dialog confirmation/cancellation, jams, extra copies selected in the printer dialog, or printing outside OrbitoShop. Do not label this physical consumption or verified print completion.

## 2. Client behavior and hidden measurement

1. Obtain the tenant's platform-controlled `paper_resupply_enabled` flag. If unavailable without a valid cached value, hide the button. This fallback has no effect on metering.
2. Show the single resupply button inside Owner Billing & Usage when enabled. Enforce the Owner role in the backend as well as the menu; staff still generate operational/print usage without access to this section. Submit an authenticated request without asking for stock, usage, or roll quantities. Disable the button during submission and show a brief result.
3. Route every eligible thermal print action through the shared print pipeline and capture hidden usage regardless of `paper_resupply_enabled`. Merely viewing or generating a preview must not count.
4. After print layout, fonts, and images settle, measure the actual printable thermal layout at its configured width. Record content length plus configured feed/cut allowance. Version both the template and measurement algorithm.
5. Submit the measured print attempt to the server for validation and durable acceptance, then invoke the print flow. Reuse its event ID on network retries. The accepted record means **print intent**, even if the browser later cancels or dispatch fails.

Proposed calculation:

`estimated_mm = ceil((content_height_css_px × 25.4 / 96 + feed_cut_allowance_mm) × copies)`

CSS pixels mean layout pixels, not device pixels. Calibrate against actual paper width, margins, printer scaling, and templates; version calibration changes. Store `estimated_mm` as the total for all declared copies, so the platform must not multiply it again. Record invalid/unavailable measurements explicitly rather than substituting zero. A genuine reprint receives a new ID; retrying delivery of the same intent does not.

## 3. Proposed data contract

Use UTC timestamps, integer millimetres, stable UUIDs, and a versioned contract. The authenticated backend derives `tenant_id` and actor identity; never trust tenant identity supplied by the browser.

### `thermal_print_usage` — append-only source events

| Field | Meaning |
| --- | --- |
| `id`, `tenant_id` | Unique event and owning tenant |
| `source_seq`, `recorded_at` | Server-assigned durable sync sequence and acceptance time |
| `occurred_at`, `printed_by` | Claimed action time and server-derived actor; time is not proof of output |
| `document_type`, `document_id`, `document_version` | Stable source document reference and revision |
| `copies`, `estimated_mm` | Positive declared copies and total estimated length; length nullable only for a measurement failure |
| `measurement_status` | `estimated` or `unavailable`; never silently treat unavailable as zero |
| `paper_width_mm`, `template_version`, `measurement_version`, `calibration_version` | Reproducibility metadata |
| `is_reprint`, `original_event_id` | Reprint classification and original intent, when known |
| `metering_basis` | `accepted_print_intent` |
| `receipt_usage_ref` | Existing receipt-usage event/reference, if one exists |
| `schema_version` | Contract version, initially `1` |

Retain the measurement inputs required to reproduce the estimate, such as content height and allowance. Do not export receipt contents or customer personal data. A summary or repair child document must not accidentally become an additional billable receipt under existing receipt-count rules.

### `paper_resupply_requests` — tenant requests

`id`, `tenant_id`, `requested_by`, `requested_at`, `status`, `updated_at`, `version`, `source_seq`, `schema_version`.

The tenant creates a request only; there are no tenant-editable quantity, usage, stock, or status fields. Shop captures the request; Platform owns approval/fulfillment history and authoritative lifecycle decisions. Internal notes and fulfillment references are excluded from client responses. Preserve status changes in an append-only Platform history containing actor, timestamp, reason, and version. If Shop needs a status mirror for duplicate-request protection, sync that internal projection without exposing it to the customer.

### Platform-owned records

- **Supplies:** delivery ID, tenant, request reference if applicable, roll count, usable length per roll in millimetres, dispatch/delivery dates, and status. Only confirmed delivered supplies add capacity; preserve the length configured for each delivery.
- **Adjustments:** signed corrections referencing an original record, reason, authorized operator, timestamp, and effective period. Never rewrite source usage to resolve a dispute.
- **Configuration:** `paper_resupply_enabled` controls only button visibility. Eligible templates, calibration, commercial policy/version, and applicable dates are separately controlled by Platform; metering is independent of the service flag.

## 4. API and sync expectations

Use the **common Platform Bridge** in the companion handoff for paper events, BILL/INVENTORY usage, billing projections, optional entitlements, and internal request-state mirroring. First map the actual receipt-count mechanism in both repositories; reuse suitable authentication, tenant mapping, sync, and cursor/event patterns. The attached snapshot uses direct browser writes to Platform `usage_logs`, not a demonstrated pull feed (section 8). Harden identity and delivery as described in the bridge document. The following proposed routes describe logical capabilities only; they do not mandate REST endpoints or a paper-specific transport:

| Operation | Caller → owner | Result |
| --- | --- | --- |
| `POST /thermal-print-intents` | Shop client → Shop backend | Validated accepted event ID; no aggregate totals |
| `POST /paper-resupply-requests` | Shop client → Shop backend | Request ID and minimal acknowledgement |
| `GET /platform/usage-feed?cursor=…&limit=…` | Platform → Shop backend | Usage events, request changes, and next cursor |
| `PATCH /platform/paper-resupply-requests/{id}` | Platform operator → Platform backend | Authorized status transition with expected version; mirror internally to Shop only if needed |

Example feed envelope:

```json
{
  "schema_version": 1,
  "items": [
    {
      "kind": "thermal_print_usage",
      "source_seq": 421,
      "data": {
        "id": "<event-uuid>",
        "tenant_id": "<tenant-uuid>",
        "estimated_mm": 284,
        "copies": 2,
        "measurement_status": "estimated",
        "metering_basis": "accepted_print_intent"
      }
    }
  ],
  "next_cursor": "<opaque-cursor>",
  "has_more": false
}
```

Example event data is abbreviated; production payloads include all required fields above.

- Where the existing integration supports a feed, use server-assigned commit-ordered changes and opaque cursors, not client timestamps. Define pagination so concurrent commits cannot be skipped. Include request changes if mirrored. For a push integration, use durable delivery acknowledgements and replay instead of inventing a pull cursor requirement.
- Deliver at least once. Deduplicate usage by `(tenant_id, id)` and request changes by `(tenant_id, id, version)`. Save imported rows and the checkpoint in one platform transaction.
- Retry with backoff; resume from the last committed cursor. Expose sync lag, last successful sync, quarantined events, and measurement failures to platform operators.
- Platform → Shop request-state mirrors use the same bridge and atomic newer-version-only application as billing projections. They support internal duplicate protection; customer UI remains button plus acknowledgement. Platform owns fulfillment and settlement; Shop must not infer either from its own usage.
- If existing receipt exposure is snapshot-only, add an event feed or versioned cumulative counters with explicit reset/backfill semantics. Never add repeated snapshots together.
- Define retention and a backfill/full-reconciliation path before deployment. An expired cursor must produce an explicit error, never silently skip records.

## 5. Platform reading, aggregation, and billing

1. Import immutable source events and versioned request changes into tenant-isolated platform storage.
2. Aggregate valid estimates: `estimated_metres = SUM(estimated_mm) / 1000`. Report measurement failures separately as incomplete coverage. Break out reprints and document types for operator review.
3. Aggregate by tenant and calendar month in the tenant's configured billing timezone. Proposed default period basis is server `recorded_at`; retain `occurred_at` for audit. Freeze the timezone and policy used for each billed period.
4. Calculate supplied capacity from delivered rolls: `SUM(roll_count × usable_length_mm)`. Estimated remaining capacity is opening capacity plus deliveries and approved adjustments minus estimated usage. Carry balances across months; preserve negative values as review signals.
5. Calculate roll-equivalent only against an explicit usable-roll-length assumption. Mixed roll lengths require an allocation policy or a clearly labeled reference roll length.
6. Compare request timing, delivered capacity, usage, reprint rates, and sync completeness. Flags request operator review; estimates alone must not automatically deny resupply or establish fraud.
7. Apply the actual commercial agreement. **The conversation does not establish paper pricing or authorize per-metre billing.** Delivered-roll charges, subscription allowances, and consumption charges are separate possible policies. Do not enable a new charge by inference.
8. Preserve existing billable receipt-count semantics. Paper usage is a separate metric; correlate using `receipt_usage_ref` without deriving receipt charges from print attempts or charging reprints twice.
9. Snapshot source cutoff, quantities, policy version, rate, currency, and invoice references when closing a period. Repeated billing runs must be idempotent. Late events/corrections produce an explicit reconciliation or later adjustment, never silently change a finalized invoice.

## 6. Lifecycle, permissions, and anti-abuse

**Minimum request states:** `requested`, `fulfilled`, `rejected`, `cancelled`. The initial implementation supports `requested → fulfilled`, `requested → rejected`, or `requested → cancelled`. Platform owns transitions and their history; fulfillment requires confirmed delivery. `approved` and `dispatched` are optional future Platform-only logistics states and are not prerequisites for fulfillment. A duplicate click resolves to the existing active request with a brief acknowledgement. Enforce one active request per tenant atomically (`requested` initially; include optional active states if later introduced), unless a documented operator override applies. Customers do not manage lifecycle states.

**Usage:** Accepted events are immutable. Sync acknowledgement is delivery state, not proof of printing. Voiding an invoice does not erase paper intent already recorded. Corrections are separate audit records. Setting `paper_resupply_enabled = false` only hides the button: metering continues for every eligible thermal print, as do persistence, retries, and sync. Changing the flag does not erase history, cancel requests, or reset balances.

| Principal | Allowed access |
| --- | --- |
| Tenant client | Authorized staff submit print intents independently of the flag; only the Owner reads Billing & Usage and submits resupply requests; paper UI returns minimal acknowledgements |
| Shop backend | Validate documents, actors, and measurement; append tenant-scoped events |
| Platform service | Read authorized tenant feeds; perform permitted request transitions |
| Platform operator | Review aggregates, manage deliveries/configuration, and create audited corrections under role permissions |

Enforce these restrictions in backend authorization and database policies, not only by hiding UI. Use the existing active `app_users` role model for Owner checks; do not use `SESSION.isAdmin`, which also includes Orbito Support. Keep platform/service credentials out of browser code. Deny tenant reads of the raw paper metering ledger and all tenant updates/deletes. Validate document ownership, copies, supported templates, and plausible lengths. Prefer server-side measurement/recalculation from canonical document data; browser measurements remain tamperable and require bounds checks, sampling, and anomaly review. Avoid exposing internal ledger data through generic exports or customer APIs. The separate Owner billing projection is a restricted customer-safe summary, not ledger access.

## 7. Failure handling and acceptance checks

- **Idempotency:** Generate one key per user action and persist it through retries. Scope keys to tenant and operation; store a payload hash and reject reuse with different data. Reprints are new actions. Uniqueness must be enforced server-side.
- **Print outage policy:** Recommended default is to preserve checkout/printing with a durable local outbox if the metering endpoint is unavailable. Replay with original IDs after recovery. A local queue can be deleted or bypassed; surface coverage gaps to operators and do not claim tamper-proof billing. Confirm this tradeoff before implementation.
- **Resupply outage:** Show success only after durable server acceptance. On timeout, retry with the same key; show a brief error if acceptance remains unknown.
- **Billing freshness:** Use the common bridge's last-sync/stale indicator for the Owner billing summary. Platform unavailability must not block normal POS/repair operations; pending events stay in the shared outbox. A stale projection does not mean paid or zero outstanding.
- **Dispatch failure/cancellation:** Do not infer success from `afterprint`. Retain the accepted intent; attach any known failure as separate metadata. Allow audited corrections according to policy.
- **Concurrency:** Use unique constraints for active requests, transactional event/outbox writes where applicable, and expected-version checks for status changes. Return a conflict for stale transitions.
- **Verification:** Confirm identical eligible-print metering with the service flag ON and OFF, with only button visibility changing. Cover acknowledgement-only UI and direct unauthorized access; short/long receipts and all thermal templates; copies/reprints; cancelled dialogs; timeout retries; duplicate clicks; outage recovery; cross-tenant denial; sync during concurrent writes; month boundaries; late imports; minimum request transitions without optional states; and repeated billing runs.

## 8. Attached client repository findings and cleanup checklist

Source paths below are relative to the root of the attached ZIP; they are evidence references, not proposed names.

| Existing code | Observed behavior / integration relevance |
| --- | --- |
| `src/shared.js:24–42` | `getPlatform()` creates a Platform connection using `VITE_PLATFORM_URL` and `VITE_PLATFORM_ANON`. `logBillEvent()` inserts into `usage_logs` with `client_id: CLIENT_ID`, `module_type: 'BILL'`, `token_count: 1`, and `rate_at_log: CLIENT_EVENT_RATE`. `CLIENT_ID` comes from `VITE_CLIENT_ID` (fallback `1`); the rate constant is `5`. These are existing receipt/bill logging values, not paper pricing. |
| `src/features/pos/checkout/api.js:108`; `src/features/pos/repairs/api.js:48,72` | Call `logBillEvent()` from checkout, repair creation, and repair payment flows. This is business-event logging, not one event per physical print. Preserve and verify actual billing semantics before mapping paper usage. |
| `src/print/print.js:4–21` | Shared `printThermal(html)` creates an 80 mm iframe and invokes its `window.print()` after load/barcode rendering and a delay. This is the existing capture point to map, not evidence of measurement or durable metering. |
| `src/print/print.js` | Contains `buildTicketSlip`, `buildReceiptSlip` (with an `isReprint` parameter), `buildSubInvoiceSlip`, `buildReturnSlip`, and `buildRepairSummary`. Map the requested eligible document types to these builders/call sites; verify eligibility of other slips explicitly. |
| `src/shared.js:217–223` | Configuration loads through `get_public_shop_config` / `get_app_config`. Map the new visibility flag to the appropriate existing configuration path. |
| `src/shared.js:44–50`; `src/features/admin/inventory/api.js:56` | `logInventoryEvent()` writes `INVENTORY` usage to the same Platform `usage_logs`; the common bridge must preserve this existing billable stream alongside BILL and paper. |
| `src/shared.js:153–183,559–573`; `src/admin/admin.js:30–40,151–154`; `src/main.js:62–69` | Active Auth/profile role, `ACCESS` / `can()`, module dropdown, and guarded routes provide the mapping for the proposed Owner-only Billing & Usage section. `isAdmin` also includes Support, so is not an Owner-only gate. |

**Snapshot gaps:** The inspected source/schema files did not reveal `paper_resupply_enabled`, paper-resupply handling, or thermal-length usage events. The observed billing helper does not show durable retry storage, an idempotency key, or a cursor; it catches thrown errors but does not inspect the insert result's error field. Platform database policies and consumer behavior cannot be established from this client archive. Do not assume these guarantees already exist or use a browser-supplied `CLIENT_ID` as trusted tenant identity.

During Platform cleanup, locate the consumer of `usage_logs`, its auth/policies, tenant mapping, and billing semantics first. Map new logical fields and operations onto that integration, adding only what is needed for secure identity, durable event delivery, and reconciliation. Confirm measurement trust level, outage handling, roll lengths, retention, timezone, and commercial rules. Keep Platform authoritative for supply records, lifecycle history, corrections, and accounting. This is a documentation handoff for the next phase, not certification of deployed behavior or an instruction to modify unrelated features.

## 9. Final architecture summary

### CLIENT APP

- Thermal print → hidden usage event, including eligible retail receipts, repair parent invoices, child invoices, repair summaries, reprints, and multiple copies.
- Owner **Billing & Usage** → read customer-safe Platform billing projection; distinguish outstanding invoice from estimated current charges.
- Paper Resupply Service ON (`paper_resupply_enabled = true`) → show **Request Resupply** inside that section.
- Paper Resupply Service OFF (`paper_resupply_enabled = false`) → show nothing for the paper service; Billing & Usage remains available to the Owner and thermal metering continues.
- After submission → brief success/error acknowledgement only.
- No paper consumption/audit/supply data shown to customer; no customer editing of metering or supply data.
- Usage outbound and billing/request projections inbound → one common Platform Bridge.

### ORBITO PLATFORM

- Read usage events.
- Read resupply requests.
- Track rolls supplied.
- Calculate estimated usage / roll equivalents.
- Compare usage vs supply.
- Audit anomalies.
- Own approval/fulfillment history and separate corrections/adjustments.
- Calculate monthly commercial charges under the agreed pricing rules, separately from receipt-count billing.
- Publish authoritative billing status, outstanding amounts, and billed/settled boundaries through the same bridge; Shop displays a read-only mirror.
- Produce a monthly customer statement if required.
