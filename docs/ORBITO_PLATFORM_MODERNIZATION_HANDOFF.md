> Historical planning reference. Current Platform implementation, final Shop contract, billing blockers and deployment requirements are documented in [PLATFORM_MODERNIZATION_IMPLEMENTATION.md](PLATFORM_MODERNIZATION_IMPLEMENTATION.md). Where these differ, the implementation document and final client code take precedence.

# Orbito Platform Modernization Handoff

**Date:** 2026-09-16  
**Purpose:** Implementation-ready handoff for the future cleanup and modernization of the `orbito-main` Platform repository after the OrbitoShop client application is frozen.  
**Status:** Planning / architecture handoff. No code changes are implied by this document.

---

## 1. Executive Summary

The OrbitoShop client application is now close to feature-complete and has a mature operational core: POS, repairs, Workshop, inventory, employee roles, printing, receipt archive, repair-family accounting, Udhar, refunds, adjustments, and audited Phase 2/3 backend controls.

The separate Orbito Platform repository is **not a blank slate**. It already contains the main SaaS business concepts required for the next stage:

- client registry
- usage logging
- usage-based billing
- billing cycles / invoices
- payments
- client credit / carried balance
- pricing-rate history
- support tickets
- platform users and roles
- client activation/suspension
- client module toggles
- client database remote-view tooling
- invoice printing
- client billing history

The Platform therefore does **not** need a ground-up rewrite.

The main weakness is that important Platform operations are currently implemented as **browser-driven multi-step database writes** and the current Shop→Platform usage link is a prototype-style browser integration. The future work is primarily to:

1. harden usage ingestion,
2. move invoice/payment state changes into atomic backend transactions,
3. introduce one trusted bidirectional Shop↔Platform bridge,
4. publish an authoritative billing projection back to OrbitoShop,
5. add Paper Resupply / thermal-paper metering,
6. preserve the working Platform UI wherever practical,
7. then perform a final Platform security/performance/code-quality regression.

The architectural goal is:

```text
                ORBITOSHOP
       operational source of truth
 POS / Repairs / Inventory / Printing
                  │
                  │ usage + requests
                  ▼
        ┌──────────────────────┐
        │   PLATFORM BRIDGE    │
        │ stable IDs           │
        │ trusted tenant bind  │
        │ retries / idempotency│
        │ versioned projection │
        └──────────────────────┘
                  ▲
                  │ billing + config
                  │
                  ▼
             ORBITO PLATFORM
 clients / plans / billing / invoices
 payments / paper / support / control
```

The client application must **not** become tightly coupled to the current Platform database schema. The bridge contract should stay stable even if the Platform internals are later refactored.

---

# 2. Sources Reviewed

This handoff is based on:

1. The current `orbito-main` Platform repository snapshot.
2. The nearly finished OrbitoShop client architecture and Phase 2/3 stabilization work.
3. The canonical handoff:
   - `ORBITOSHOP_PLATFORM_BILLING_USAGE_BRIDGE.md`
4. The canonical handoff:
   - `orbito-paper-metering-platform-handoff.md`
5. The code-review findings already collected for the client repo.

The Platform repository inspected contains a small Vite / vanilla-JavaScript frontend with these important files:

```text
src/
  billing.js
  events.js
  forms.js
  helpers.js
  main.js
  render.js
  state.js
  supabase.js

  pages/
    billing.js
    clients.js
    overview.js
    settings.js
    support.js

  modals/
    billing.js
    client.js
    index.js
    users.js
```

A complete Platform Supabase migration/schema history was **not present in the uploaded repository**, so the live Platform database schema, policies, functions, indexes, and constraints must be dumped and audited before implementation.

---

# 3. Current Platform Architecture

## 3.1 Platform Supabase client

The Platform frontend creates a Supabase client using:

```text
VITE_PLATFORM_URL
VITE_PLATFORM_ANON
```

and performs most Platform reads and writes directly from browser JavaScript.

This frontend currently reads tables such as:

- `platform_config`
- `clients`
- `support_tickets`
- `usage_logs`
- `billing_cycles`
- `pricing_rate_log`
- `payments`
- `client_credit`
- `platform_users`

This is workable as a prototype/internal control panel, but sensitive financial state transitions should eventually be moved behind trusted RPCs / Edge Functions / backend procedures.

---

## 3.2 Client registry

The `clients` table is already the logical Platform tenant/client registry.

Existing Platform code expects client-level fields covering concepts such as:

- client name
- industry
- plan
- status
- currency / currency symbol
- event rate
- inventory rate
- billing enablement flags
- grace period
- client Shop URL
- client Supabase URL
- client Supabase anon key

This table should remain the central Platform record representing a subscribed OrbitoShop installation.

Future additions may include or be related to:

```text
paper_resupply_enabled
bridge/source binding
pricing version
entitlement version
billing timezone
sync status metadata
```

The exact schema must be chosen after the live Platform DB is inspected.

---

# 4. What Should Be Reused

The following Platform concepts are already valuable and should be evolved rather than thrown away.

## 4.1 `clients`

**Keep.**

It already behaves as the tenant registry and subscription/account control record.

Future Platform modernization should strengthen rather than replace this concept.

Recommended responsibilities:

- client identity
- status
- plan
- commercial defaults
- module/feature entitlements
- billing timezone
- source/bridge identity binding
- Shop endpoint metadata
- paper-resupply entitlement

Do not put invoice history or raw usage directly into the client row.

---

## 4.2 `usage_logs`

**Keep conceptually, but upgrade.**

Current usage supports at least:

```text
BILL
INVENTORY
```

with fields conceptually similar to:

```text
client_id
module_type
token_count
rate_at_log
recorded_at
is_invoiced
billing_cycle_id
```

The table already represents the correct business concept: **SaaS usage events**.

The problem is that the current rows are too weak for a reliable distributed billing bridge.

Future usage events need stronger identity and audit metadata, for example:

```text
event_id
client_id / trusted source binding
source_stream_id
source_operation_id
usage_seq
metric_type
quantity
unit
occurred_at
recorded_at
schema_version
pricing_snapshot/version where required
billing_cycle_id
```

Do not blindly add these exact columns until the real Platform DB schema is inspected.

The important requirement is **stable event identity + idempotent ingestion + exact billing membership**.

---

## 4.3 `billing_cycles`

**Keep.**

It already models SaaS invoices / billing periods.

The current application uses it for:

- billing period start/end
- usage counts
- rates
- current charges
- carried balance
- total due
- remaining balance
- invoice date
- due date
- status
- payment status

This is already close to what the Shop Owner's future **Billing & Usage** screen needs.

Future additions may include:

```text
billing policy version
pricing version
billed-through usage boundary
settled-through usage boundary
invoice source cutoff
projection version
finalized_at
```

Again, use equivalent existing fields if the live schema already supports them.

---

## 4.4 `payments`

**Keep.**

Platform invoice payments belong on the Platform.

The Platform is authoritative for:

```text
Unpaid
Partial
Paid
```

OrbitoShop must never infer SaaS invoice payment status from its own POS customer-payment ledger.

This table should remain the authoritative payment history feeding invoice settlement and the outbound billing projection.

---

## 4.5 `client_credit`

**Keep or evolve.**

This currently represents outstanding/carry-forward balances.

The concept is useful, but it should later be handled transactionally with invoice generation and payment recording rather than browser-side multi-step calculations.

---

## 4.6 `pricing_rate_log`

**Keep.**

The existing concept of preserving historical pricing is correct.

Usage billing must not silently change retroactively when rates change.

Future billing should snapshot:

- rate/policy version
- rate used
- currency
- allowances/discount rules where applicable

This should be Platform-owned.

The Shop may display customer-safe estimated charges, but should not be authoritative for commercial pricing.

---

## 4.7 Existing Platform pages

The existing main navigation can largely survive:

```text
Overview
Clients
Billing
Support Tickets
Settings
```

The future work should preferentially replace the **engine behind these screens**, not rebuild every screen.

---

# 5. Current Platform Billing Flow

The existing billing engine computes usage in browser memory.

Conceptually:

```text
load usage_logs
      ↓
filter uninvoiced rows
      ↓
group BILL / INVENTORY
      ↓
multiply token_count × rate_at_log
      ↓
render totals in Billing UI
```

This is implemented through `computeClientBilling()`.

That is acceptable as a display calculation during the prototype stage, but final invoice generation should not depend on a browser having loaded a perfectly consistent snapshot.

---

# 6. Current Invoice Generation Risk

Current invoice generation is browser-driven and performs multiple separate database writes.

Conceptually:

```text
1. calculate unbilled usage in browser
2. insert billing_cycles row
3. clear old client_credit rows
4. mark usage_logs is_invoiced=true
5. attach billing_cycle_id
6. update client grace period
```

These operations are not visibly wrapped in one database transaction.

This creates several risks:

- partial failure
- duplicated invoices
- usage marked invoiced without being priced into the invoice
- invoice created while usage remains uninvoiced
- race conditions when new usage arrives during invoice generation
- retry ambiguity

### Example race

```text
12:00:00
Browser loads usage 101–160.

12:00:01
Usage event 161 arrives.

12:00:02
Invoice is calculated from 101–160.

12:00:03
Frontend updates all rows:
client_id = X AND is_invoiced = false

Result:
161 can be marked invoiced even though it was not included
in the invoice calculation.
```

This is one of the most important areas to fix during Platform modernization.

---

# 7. Future Invoice Generation

Invoice creation should become a **single trusted transaction**.

Target logical flow:

```text
Generate Invoice
      ↓
trusted RPC / backend procedure
      ↓
identify exact eligible usage
      ↓
lock / claim exact event membership
      ↓
apply Platform-owned pricing
      ↓
create invoice
      ↓
attach exact usage to invoice
      ↓
carry forward permitted outstanding balance
      ↓
snapshot pricing / cutoff / policy
      ↓
commit
```

No broad browser-side:

```text
WHERE is_invoiced = false
```

sweep after an independent calculation.

The exact implementation may use:

- PostgreSQL RPC
- Edge Function wrapping one SQL transaction
- another trusted backend layer

The business invariant matters more than the transport.

---

# 8. Current Payment Recording Risk

Platform payment handling is also browser-driven.

The current style is conceptually:

```text
insert payment
      ↓
reload Platform data
      ↓
sum invoice payments in browser
      ↓
update invoice payment_status
      ↓
update/create client credit
```

This should also become one atomic backend operation.

Target:

```text
record_platform_payment(
  invoice_id,
  amount,
  method,
  notes,
  request_id
)
```

Logical transaction:

```text
validate invoice
      ↓
insert payment
      ↓
recalculate invoice paid/outstanding
      ↓
update invoice state
      ↓
update carry-forward / account balance
      ↓
publish new billing projection version
      ↓
commit
```

Retries with the same request ID must not duplicate a payment.

---

# 9. Current Shop ↔ Platform Integration

## 9.1 Existing outbound usage integration

OrbitoShop currently creates a second Supabase client in browser code using Platform public configuration and directly inserts usage into Platform `usage_logs`.

Existing concepts include:

```text
VITE_PLATFORM_URL
VITE_PLATFORM_ANON
VITE_CLIENT_ID
logBillEvent()
logInventoryEvent()
```

This proves that a Shop→Platform integration already exists conceptually.

It is not sufficient as the long-term billing bridge.

---

## 9.2 Why it needs replacement/hardening

The existing browser-driven usage path has several weaknesses:

- client identity is browser-provided
- usage delivery can be blocked/suppressed by the client environment
- no durable local outbox
- no stable event ID
- no clear deduplication key
- no explicit retry acknowledgement
- no durable monotonic usage stream
- no guaranteed reconciliation
- current event rates are browser-provided legacy values
- usage writes may sit in user-facing transaction flows

The new bridge must eliminate browser assertions as the source of billing authority.

---

# 10. Common Platform Bridge

The future architecture should introduce **one common bidirectional bridge**.

Do not create:

```text
billing sync
paper sync
entitlement sync
resupply sync
payment sync
```

as five unrelated systems.

They should share:

- tenant/source identity
- transport authentication
- event envelopes
- versioning
- retry strategy
- observability
- error handling
- compatibility policy

---

## 10.1 Shop → Platform

Outbound categories include:

```text
BILL usage
INVENTORY usage
THERMAL usage
paper resupply requests
future billable service usage
```

Logical pipeline:

```text
successful Shop operation
      ↓
canonical local operation exists
      ↓
local immutable usage event
      ↓
durable outbox
      ↓
trusted bridge delivery
      ↓
Platform validates source/client
      ↓
idempotent ingestion
      ↓
acknowledgement
```

---

## 10.2 Platform → Shop

Inbound categories include:

```text
billing projection
invoice status
outstanding balance
paid amount
billing cutoffs
settlement cutoffs
current usage estimate
feature/config state where appropriate
paper request status mirror if needed
```

This state is a **projection/cache**, not a second accounting ledger.

---

# 11. Stable Bridge Contract

The OrbitoShop client should be allowed to finish and freeze without depending on Platform table names.

A conceptual outbound event:

```text
UsageEvent
{
  schema_version
  event_id
  source_stream_id
  source_operation_id
  metric_type
  quantity
  unit
  occurred_at
  recorded_at
}
```

A conceptual inbound projection:

```text
BillingProjection
{
  schema_version
  sync_version

  invoice_summary
  outstanding_total

  current_usage_summary
  estimated_current_charges

  billed_through
  settled_through

  platform_updated_at
}
```

These are **contracts**, not required database table layouts.

This separation is critical because Platform internals may change while hundreds of deployed Shop clients remain on stable releases.

---

# 12. Usage Boundaries

Historical usage must never be deleted simply because it was billed or paid.

Avoid:

```text
lifetime usage - amount paid = current due
```

Use explicit billing membership and boundaries.

Example:

```text
usage 101–160
    ↓
September invoice

usage 161+
    ↓
current unbilled usage
```

When the invoice is issued:

```text
billed_through = 160
```

When it is fully settled:

```text
settled_through = 160
```

The old usage remains stored forever according to retention policy.

---

# 13. Partial Payment Semantics

Partial invoice payment must not incorrectly mark a usage boundary fully settled.

Example:

```text
Invoice A
usage 101–160
total Rs. 5,000

paid Rs. 3,000

status = Partial
outstanding = Rs. 2,000
```

The Shop can show the authoritative partial state from Platform.

Do not treat usage 101–160 as fully settled until the applicable Platform settlement rule says it is.

---

# 14. Out-of-Order Settlement

If multiple invoices exist:

```text
Invoice A = unpaid
Invoice B = paid
```

a simple global `settled_through = B_end` may be invalid.

The Platform should preserve:

- invoice-level status
- explicit event membership/ranges
- contiguous settlement boundaries only when safe

The Shop UI should trust the Platform projection rather than reconstructing debt.

---

# 15. Owner Billing & Usage in OrbitoShop

The new Owner-only module should read from the Platform projection.

Suggested client section:

```text
Billing & Usage
```

Possible display:

```text
Current Usage
Bills Generated           342
Inventory Events            3

Outstanding Invoice
INV-SEP-2026
Rs. 2,000
UNPAID

Estimated Current Charges
Rs. 650

Estimated Total
Rs. 2,650

Last synced: 2 minutes ago

Paper Resupply
[ Request Resupply ]
```

Important semantics:

- **Outstanding Invoice** = actually issued and unpaid Platform invoice.
- **Estimated Current Charges** = usage after the billed boundary and not yet formally invoiced.
- Uninvoiced usage must not be labelled “Amount Due.”
- Missing/stale Platform data must not display as zero.
- Owner-only authorization must be enforced server-side, not merely by hiding a menu item.

---

# 16. Billing Projection Versioning

Platform→Shop state needs monotonic versioning.

Example:

```text
version 17 = UNPAID
version 18 = PAID
```

If network delay causes version 17 to arrive after 18:

```text
17 < 18
→ reject/ignore
```

This comparison must be enforced by backend/database logic, not only browser JavaScript.

Recommended conceptual field:

```text
sync_version
```

Equivalent existing Platform mechanisms may be reused.

---

# 17. Offline / Platform Outage Behavior

Platform downtime must not stop normal Shop operations.

Rule:

```text
Platform unavailable
≠
POS unavailable
```

Shop continues:

- checkout
- repairs
- Workshop
- inventory operations
- allowed printing
- local usage capture

Bridge events remain pending.

The Owner Billing & Usage screen may show:

```text
Last synced: 47 minutes ago
Billing information may be out of date.
```

A failed billing refresh must never imply:

```text
Outstanding = 0
```

---

# 18. Paper Resupply Service

Paper Resupply belongs inside Owner **Billing & Usage**.

Client experience should remain intentionally tiny.

If:

```text
paper_resupply_enabled = true
```

show:

```text
[ Request Resupply ]
```

If false:

```text
show nothing for Paper Resupply
```

Do not hide Billing & Usage itself.

---

# 19. Thermal Paper Metering

Thermal metering is independent of the Paper Resupply button.

It continues whether:

```text
paper_resupply_enabled = true
```

or:

```text
paper_resupply_enabled = false
```

The client should not see:

- estimated metres consumed
- roll-equivalent
- remaining rolls
- supply ledger
- anomaly flags
- delivery capacity
- internal paper audit

Those belong to Platform operations.

---

# 20. Current Printer Assumption

The current OrbitoShop print engine is designed around common **80 mm thermal printing**.

For the first implementation:

```text
paper_width_mm = 80
```

is the expected default.

Do not block Phase 4 by adding 58 mm support.

However, keep the metering model width-aware so another supported width can be added later without changing the conceptual data model.

---

# 21. Thermal Measurement

Every eligible thermal print should produce estimated paper-length metadata.

Eligible examples:

- retail receipt
- repair parent invoice
- child/sub-invoice
- repair summary
- approved reprint
- multiple copies

Conceptual measurement:

```text
estimated_mm =
  printable content height
  + feed/cut allowance
```

The event should include:

```text
document type
document ID
copies
estimated_mm
paper_width_mm
template version
measurement version
reprint metadata
```

Important limitation:

> This measures OrbitoShop software-side print intent/estimated printable length. It does not prove physical paper actually left the printer.

Browser print cancellation, jams, manually selected extra copies, or paper used by other applications cannot be perfectly observed.

---

# 22. Paper Supply Accounting on Platform

Platform should eventually own records conceptually similar to:

```text
paper_resupply_requests
paper_supplies
paper_request_history
```

Possible supply fields:

```text
delivery ID
client ID
request reference
roll count
usable length per roll
dispatch/delivery time
status
operator
```

Only confirmed delivered supply should add capacity.

---

# 23. Paper Consumption Model

Platform can calculate:

```text
estimated metres =
SUM(estimated_mm) / 1000
```

For known supplied rolls:

```text
supplied capacity =
SUM(roll_count × usable_roll_length_mm)
```

Then Platform can compare:

```text
estimated usage
vs
delivered capacity
```

for internal review.

This is an audit/operations estimate, not proof of theft or fraud.

Do not automatically reject customer requests purely from estimated consumption.

---

# 24. Paper Request Lifecycle

Minimum lifecycle:

```text
requested
fulfilled
rejected
cancelled
```

Optional later Platform logistics states:

```text
approved
dispatched
```

These should not be required for the initial feature.

One active request per client should be enforced atomically unless Platform staff intentionally override.

---

# 25. Existing Client Remote-View Connection

The Platform currently stores/uses client-specific Supabase information and opens client databases directly from Platform browser code.

It loads Shop data such as:

- `shop_config`
- recent `tickets`
- recent `sales`
- `employees`
- `udhar`

This powers Platform client-management/support visibility.

Do **not** confuse this mechanism with the new billing bridge.

Treat them separately:

```text
SUPPORT / REMOTE VIEW
Platform → Shop
existing read/control mechanism

BILLING BRIDGE
Shop backend ↔ Platform backend
trusted financial/usage integration
```

The support connection can remain initially while the billing bridge becomes authoritative.

---

# 26. Module Controls

The existing Platform Client Detail page already includes module toggles for concepts such as:

- Repair & Ticket Module
- Workshop / Technician
- Live Tracking
- Inventory Addon
- Employee Management
- Subscription Status

This is the natural Platform location for:

```text
Paper Resupply Service
```

The Platform should eventually become authoritative for that entitlement.

It should propagate the resulting client-safe configuration through the shared bridge or the existing hardened configuration mechanism, rather than trusting a client-side UI flag.

---

# 27. Platform UI Reuse

Do not rebuild the Platform UI for aesthetic reasons during the first cleanup.

Prefer:

```text
same page
same buttons
better backend
```

Example:

Current:

```text
Generate Invoice button
→ several frontend DB writes
```

Future:

```text
Generate Invoice button
→ one trusted RPC
```

Current:

```text
Record Payment
→ browser inserts and recalculates
```

Future:

```text
Record Payment
→ one idempotent payment transaction
```

Current:

```text
Billing screen computes from raw arrays
```

Future:

```text
Billing screen reads canonical server summaries
```

---

# 28. Platform Security Observations

The future Platform regression should include security cleanup, but it should not derail client delivery.

Important areas:

## 28.1 HTML escaping

The Platform frontend uses extensive template-literal rendering into HTML.

Values such as:

- client names
- support ticket content
- user names
- URLs
- other DB text

may be interpolated directly.

The same safe text-escaping strategy used in OrbitoShop should be applied here during Platform regression.

Support ticket text is particularly important because it may originate from external/client users.

---

## 28.2 Native browser dialogs

The Platform still uses browser-native:

```text
alert()
confirm()
```

in various administrative actions.

This can be normalized later to the shared central app-dialog UX after business logic is stabilized.

---

## 28.3 Browser-side financial writes

The larger priority is not cosmetic dialogs; it is moving critical financial transitions away from multi-step browser writes.

---

# 29. Live Platform Database Audit Required

Before changing Platform billing, obtain a schema-only dump of the deployed Platform Supabase project.

Audit at minimum:

```text
clients
usage_logs
billing_cycles
payments
client_credit
pricing_rate_log
platform_users
platform_config
support_tickets
```

Also inspect:

```text
RLS policies
grants
indexes
constraints
triggers
functions
Edge Functions
Auth mappings
```

Questions that cannot be answered from the frontend repository alone:

- Can anonymous users insert arbitrary `usage_logs`?
- Is `client_id` validated?
- Can clients write another tenant's usage?
- Are invoice writes restricted?
- Are payments restricted?
- Are Platform roles enforced in DB?
- Are there hidden RPCs already available?
- What foreign keys exist?
- What uniqueness/idempotency constraints exist?
- How are invoice numbers generated?
- Is currency fixed per client?
- Are historical rates immutable?
- Does the Platform support more than one outstanding invoice?
- Are billing periods/calendar timezones already encoded?

Do not redesign the database until these are known.

---

# 30. Client-Side Decisions That Must Stay Stable

Once OrbitoShop Phase 4 is finished, freeze these contracts.

## 30.1 Usage events are immutable

Never edit history merely because:

- an invoice was paid
- a customer was credited
- Platform changed a rate
- billing was reconciled

Corrections become separate records.

---

## 30.2 Stable event identity

Every outbound usage event needs a stable ID reused across retries.

A retry must not become new billable usage.

---

## 30.3 Platform owns SaaS money

Shop cannot decide:

- invoice is paid
- amount due
- pricing
- discounts
- allowances
- tax
- adjustments
- commercial credits

It displays Platform's authoritative projection.

---

## 30.4 Shop owns operational source events

Platform must not fabricate repair/POS/inventory operations.

It consumes canonical Shop usage events derived from them.

---

## 30.5 Paper metering is hidden

Customer only gets the resupply action and customer-safe billing information.

No internal paper audit dashboard in Shop.

---

## 30.6 No direct dependency on Platform table names

Shop code should depend on the bridge contract, not:

```text
billing_cycles
payments
usage_logs
```

directly.

That is what will allow Platform internals to evolve independently.

---

# 31. Legacy Billing Cutover

Moving from current direct `usage_logs` browser writes to the future bridge must avoid double billing.

Define a cutover point.

Conceptually:

```text
legacy rows
recorded before CUTOVER_TIMESTAMP

new bridge events
recorded after CUTOVER_TIMESTAMP
```

or another explicit boundary.

Do not send a new canonical event for an operation already billed through a legacy row unless reconciliation explicitly maps the two.

Recommended migration process:

1. freeze current billing period if possible,
2. snapshot old uninvoiced usage,
3. establish bridge source identity,
4. deploy idempotent ingestion,
5. enable new Shop outbox,
6. disable legacy browser logging,
7. reconcile counts,
8. only then generate the first new-style invoice.

---

# 32. Legacy Rates

Existing legacy rows contain:

```text
rate_at_log
```

Do not silently reinterpret them under future pricing logic.

Legacy billing can continue to respect those historical recorded rates.

New bridge billing should use Platform-controlled versioned pricing.

---

# 33. Multi-Client / Tenant Binding

A future trusted bridge must bind:

```text
Shop source
→ exactly one Platform client
```

server-side.

Do not authorize based on:

```text
VITE_CLIENT_ID
```

or any arbitrary browser-provided client ID.

Possible implementation options include:

- source-specific credentials
- signed bridge tokens
- Shop project identity mapping
- backend service registration
- a trusted platform-issued client/source identifier

Exact mechanism should be chosen after both Supabase deployments are inspected.

---

# 34. Observability

The bridge should provide Platform operators with visibility into:

```text
last Shop sync
last successful usage import
pending events
failed events
quarantined incompatible events
projection version
last projection delivered
measurement failures
paper request delivery state
```

This should be Platform-only.

The Shop Owner only needs a customer-safe freshness status.

---

# 35. Recommended Platform Modernization Phases

## P0 — Freeze OrbitoShop contract

Before Platform cleanup:

- finish client Phase 4
- complete Phase 4 smoke test
- document the bridge schema/version
- tag the stable Shop release

No Platform redesign should force repeated Shop rewrites afterward.

---

## P1 — Platform Forensic Baseline

### Goals

Understand the actual deployed state before changing anything.

### Tasks

- dump live Platform schema
- preserve SQL baseline
- tag Platform Git state
- map every Platform table
- audit RLS / grants
- audit Auth / platform-user mapping
- audit `usage_logs`
- audit invoice generation
- audit payment recording
- audit credit carry-forward
- map module toggles
- map client DB connectivity
- map support tickets
- verify all deployed environment variables

### Deliverable

```text
PLATFORM_FORENSIC_BASELINE.md
```

No broad refactor yet.

---

## P2 — Secure Usage Ingestion

### Goals

Replace prototype browser assertions with trustworthy events.

### Tasks

- introduce stable event IDs
- establish trusted Shop→client binding
- establish bridge schema version
- durable/idempotent ingestion
- preserve BILL semantics
- preserve INVENTORY semantics
- add THERMAL metric
- handle resupply requests
- implement retry acknowledgement
- create reconciliation tooling
- define legacy cutover
- disable direct legacy Shop→usage logging after successful migration

### Important

Do not yet redesign the entire Platform UI.

---

## P3 — Atomic Billing Core

### Goals

Make invoices mathematically and transactionally reliable.

### Tasks

- move invoice generation to trusted backend
- exact event membership
- eliminate race-prone broad `is_invoiced=false` sweeps
- snapshot pricing/policy
- explicit billing period
- carry-forward handling
- idempotent request ID
- protect against duplicate invoice generation
- finalize invoice atomically
- preserve existing invoice print UI

---

## P4 — Atomic Payment / Settlement Core

### Goals

Make Platform payment state authoritative and retry-safe.

### Tasks

- trusted payment RPC
- payment idempotency
- partial payment support
- invoice remaining balance
- Paid / Partial / Unpaid transitions
- credit / carry-forward reconciliation
- explicit corrections/reversals
- settlement boundary updates
- projection publication after state change

---

## P5 — Platform → Shop Billing Projection

### Goals

Make Owner Billing & Usage accurate without giving Shop authority.

### Tasks

- define projection table/entity
- publish outstanding invoices
- publish current usage estimate
- publish billed/settled boundaries
- publish currency
- publish sync version
- publish Platform timestamp
- apply version atomically in Shop
- reject stale revision
- Owner-only read
- stale data handling

---

## P6 — Paper Service

### Goals

Add Platform operations for paper supply.

### Tasks

- `paper_resupply_enabled`
- request queue
- request history
- record supply
- roll count / usable length
- fulfillment
- estimated consumption
- usage-vs-supply comparison
- optional anomaly flagging
- monthly statement support

No customer-facing paper inventory dashboard.

---

## P7 — Platform UI Upgrade

### Goals

Make the existing UI consume the hardened backend.

### Reuse

Keep:

```text
Overview
Clients
Billing
Support
Settings
```

Add to Client Detail:

```text
Paper Resupply Service
Paper Service summary
Sync health
Billing projection state
```

Add Platform-only operations for:

```text
fulfill request
record delivery
view paper usage
view bridge failures
reconcile usage
```

---

## P8 — Platform Regression / Cleanup

Only after business behavior is stable:

- HTML escaping
- centralized dialogs
- dead code
- repeated queries
- large render paths
- native alerts/confirms
- error handling
- stale listeners
- duplicate actions
- permission boundaries
- CORS review
- performance
- test coverage
- CI/linting if desired

Avoid large aesthetic/architectural refactors during financial-core migration unless they are required.

---

# 36. Platform Acceptance Criteria

## Usage ingestion

- same event delivered twice → billed once
- conflicting reuse of same event ID → rejected
- event from Client A cannot be attributed to Client B
- BILL semantics remain unchanged
- INVENTORY semantics remain unchanged
- thermal prints do not accidentally create BILL events
- bridge failure does not block Shop transaction completion

---

## Invoice generation

- exact intended usage becomes invoice membership
- usage arriving during invoice creation is not lost
- duplicate Generate click does not create duplicate invoice
- historical rate snapshot preserved
- carry-forward correct
- finalized invoice cannot silently change
- late usage handled by later billing/reconciliation

---

## Payments

- partial payment produces Partial
- exact/full payment produces Paid
- duplicate payment retry does not duplicate payment
- outstanding amount correct
- previous paid state cannot be overwritten by stale projection
- corrections are explicit

---

## Projection

- unpaid invoice appears in Shop
- Platform payment updates Shop
- old outstanding disappears after newer projection
- current post-cutoff usage remains
- missing Platform connection displays stale/unavailable, never zero
- Shop cannot edit projection
- non-Owner roles cannot access billing projection

---

## Paper

- eligible prints meter regardless of resupply flag
- resupply button visible only when enabled
- customer sees no hidden paper audit data
- duplicate request produces one active request
- fulfilled request updates Platform supply
- paper estimate does not affect existing BILL usage count
- reprint counts as new paper consumption event
- Platform can calculate estimated metres
- Platform can compare usage vs delivered roll capacity

---

# 37. What Must Not Be Broken During Platform Cleanup

Preserve OrbitoShop Phase 2/3 guarantees.

Do not modify Platform integration in a way that weakens:

- Shop RLS
- Shop Auth/session model
- financial RPCs
- repair family accounting
- advance semantics
- payment allocation
- Udhar
- refund handling
- inventory quantity protection
- delivery gating
- Support identity/audit

Platform modernization should be additive to those guarantees.

---

# 38. What Should Be Deferred

Do not let these delay the core Platform modernization:

- 58 mm printer support
- printer hardware detection
- physical printer monitoring
- automatic fraud accusation
- complex shipping workflow
- advanced plan-upgrade wizard
- multi-currency redesign unless required by existing customers
- complete UI redesign
- microservice decomposition
- framework rewrite
- unnecessary database renaming
- large-scale code-style cleanup before billing core is stable

---

# 39. Recommended First Action When Platform Work Begins

Before writing new Platform code:

```text
1. Export deployed Platform Supabase schema.
2. Save it under version control.
3. Audit usage_logs RLS and grants.
4. Audit clients identity mapping.
5. Audit billing_cycles and payments constraints.
6. Compare live schema with current frontend expectations.
7. Write a factual Platform forensic document.
8. Only then finalize bridge migrations.
```

The first coding task should **not** be Paper Service UI.

It should be:

> make the current billing/usage foundation trustworthy enough to support the bridge.

---

# 40. End-State Architecture

The intended stable product boundary is:

```text
ORBITOSHOP
────────────────────────────────
Operational source of truth

POS
Repairs
Workshop
Inventory
Employees
Printing

Produces:
- BILL usage
- INVENTORY usage
- THERMAL usage
- paper resupply requests

Consumes:
- billing projection
- feature/config projection


PLATFORM BRIDGE
────────────────────────────────
Integration contract

- trusted source identity
- stable event IDs
- schema versions
- idempotent ingestion
- retries
- acknowledgements
- cutoffs
- projection versioning


ORBITO PLATFORM
────────────────────────────────
SaaS control plane

Clients
Plans
Entitlements
Usage
Pricing
Invoices
Payments
Outstanding balances
Paper supplies
Resupply fulfillment
Support
Sync health
Commercial rules
Monthly statements
```

This separation should allow the Shop client to remain stable while the Platform evolves.

---

# 41. Practical Conclusion

The existing Platform repository should be treated as a **working first-generation control plane**, not disposable prototype code.

Most core business concepts already exist.

The modernization effort should focus on:

1. trustworthy event ingestion,
2. atomic invoice generation,
3. atomic payment handling,
4. versioned billing projection,
5. one Shop↔Platform bridge,
6. paper operations,
7. then code/security/performance cleanup.

The nearly finished OrbitoShop application is therefore **not creating a migration problem** for Platform.

It is actually creating a clear contract around which Platform can now be cleaned up safely.

The crucial rule is:

> Freeze the Shop↔Platform contract, not the Platform's internal tables.

If that rule is maintained, Orbito Platform can be significantly modernized without repeatedly changing every deployed OrbitoShop client.
