# Release parity, fleet evidence and service continuity — 2026-10-23

This is a source implementation/review checkpoint. Existing deployed Platform
bounded provisioning (migration 20261022235702, platform-provision v25) was confirmed
read-only and was not reinstalled. New SQL/functions and customer rollout are pending.

## One canonical release contract and gate

Shop scripts/backend-requirements.json describes eight requirement groups: core
runtime, usage outbox, billing projection, config journal, Support identity, owner
consent, owner bootstrap and durable Support submission. Each records purpose,
exact migration identities, required function packages, both installation methods
and verification. It includes critical database functions/tables/triggers/security,
runtime dependencies/configuration, storage scope and protocol/drain policy.

The immutable package embeds that inventory. Both executable installation plans
consume its migration order/core/deferred-function sets. Managed retains the optional
Support lifecycle after owner readiness; BYO installs the same Support package after
core installation. Both use all approved SQL, sources, dependencies and gateways.
Platform invocation fencing and Managed-only privileged Support handoff are explicit
narrow exceptions, not omitted shared customer capabilities.

Run from Platform: `npm run release:check` (or `node scripts/release-parity.mjs`).
From Shop: `npm run release:check`. The old tests/final-release-parity.mjs delegates
to this same gate. Default sibling paths may be set with --shop-root / --platform-root
on the Platform command or RETRASELL_PLATFORM_SOURCE for the Shop wrapper.

The gate requires a committed backend source ancestor, compares HEAD/recorded source
blobs to the package, checks every migration/file/function/dependency hash and order,
both selectors/catalogs, requirements coverage and actual installer-plan consumption.
Unpackaged migration/function directories or gateway sections fail. Old immutable
packages are rehashed and customer-visible manifests must match them. Deliberate
negative fixtures cover SQL/source drift, function/gateway/dependency omissions,
installer omission and stale manifests without changing approved files.

Historical artifacts are anchored to the accepted starting commit c9bb36e; legacy
v1 had revisions before this rule existed. Newly committed artifacts are anchored
to their first committed fingerprint. Neither baseline files nor old pins are
rewritten to satisfy the new gate.

Both repositories have a focused Backend release parity Actions workflow for relevant
feature pushes and development PRs. It checks out both existing feature refs and
needs no npm install or application suite. Private sibling access requires a
read-only RETRASELL_RELEASE_READ_TOKEN; otherwise GitHub's token is used. No secret
is embedded or created. Missing peer/evidence fails closed. This creates a check;
repository branch-protection settings were not changed. The local source promotion
utility also requires the gate. This is not merge or hosted release approval.

## Inventory evidence and policy

Platform-only forward SQL: 20261023012318_shop_backend_inventory_and_release_policy.sql.
The existing approved catalog gains explicit supported/fresh/successor/optional or
required policy and protocol compatibility. It never modifies old job pins. New
release availability alone never changes lifecycle, Bridge, billing or Support.

The client-detail Backend panel loads nothing until its buttons are used. Managers
can read retained scoped evidence; only a live canonical Master can start diagnostics,
rate-bounded per exact client. The new platform-backend-inventory function persists
only projected evidence through a session/invocation/target-fenced RPC. It performs
no Shop writes. Significant report changes are audited. Historical pins, last fully
verified release, checked capabilities, observation timestamp/confidence, missing or
conflicting components, upgrade policy and runtime health remain distinct. Evidence
older than one day is labelled unable-to-verify/unknown rather than current health.

Managed diagnostics use fixed read-only Management queries returning migration
identity/name/SHA only, function presence/gateway/revision inventory and the restricted
paired Bridge challenge. No general SQL endpoint or privileged credential reaches
the browser. Function EZBR hashes are retained as provider bundle evidence and are
NOT equated to the source-package fingerprint. Ledger provenance does not prove
unchanged live routine definitions. Current adapters therefore report partial
capability evidence and Unable to verify for full release identity; they do not
manufacture Up to date. Verified migration history can independently establish an
optional approved successor. Drift means observed conflict; unknown is not drift.

BYO uses the same credential-bound, nonsecret capability challenge without collecting
customer administrator credentials. Old supported Shops lacking the additive probe
remain operational and are labelled insufficient evidence. Owners can call the
restricted owner_backend_capabilities RPC; other employees are denied. The customer
can also run Shop scripts/inspect-backend.mjs with their own native CLI authorization
for projected migration/function evidence. That local report is not automatically
trusted or uploaded as a Platform attestation. Live BYO administration was unavailable
in this milestone. Gateway/source/current SQL behavior that cannot be proved stays
unknown. Healthy/outdated and unhealthy/current are independent tested classifications.

## Actual delivery contracts

| Flow / owner | Durable transaction / identity | Acknowledgment and recovery |
| --- | --- | --- |
| Shop usage/BILL/INVENTORY/THERMAL/Paper | Existing business transaction appends immutable bridge_events + bridge_outbox; UUID and source sequence | Existing leases/backoff; Platform event inbox plus usage posting commits atomically; only exact accepted/duplicate IDs ACK; lost ACK replays original event |
| Platform invoice/payment | Existing client/invoice locks, unique request ID, payload-conflict checks and projection publication in same SQL transaction | New authorized financial_outcome lookup before recovered browser retry; not_observed is not failed; original idempotent RPC remains authoritative |
| Platform billing → Shop | Existing complete versioned billing projection in Platform; Shop applies source-bound increasing revision atomically | Equal identical revision is unchanged, conflicting equal rejected, older ignored; next poll returns latest snapshot after outage |
| Platform module/config command | Existing config_jobs plus Shop config_requests original UUID/payload journal and entitlement generation | Unknown holds recovery; existing audited read/replay original command; a matching snapshot alone is not ACK; no new ID/close-to-hide workaround |
| Customer Support | NEW Shop support_submissions before network, actor/source/binding + sealed fields + original UUID, separate delivery audit | sending lease, uncertain/backoff or review, acknowledged only after Platform committed receipt and durable local finish; receiver unique source/request and body/actor conflict checks stay atomic |

Support pending/list/claim RPCs recheck the original live user, current role/session,
source/binding and access. Direct table access and browser receipt acknowledgment are
denied. Tokens/secrets are never stored in the queue. Replies distinguish persisted
at Shop from accepted by Platform; HTTP202 alone is not ticket acceptance. The browser
restores own pending submissions after tab loss without requiring browser storage.
Automatic background sending is deliberately absent: without a stored user JWT, retry
requires the original user to sign in and explicitly retry. New sessions are allowed
only after current canonical authorization. Expired/revoked actors cannot be replayed
by a service worker. Queueing grants no privileged Support consent; existing per-case
owner approval, revisions, abuse limits and receiver checks remain unchanged.

Attempts use a 90s lease, capped exponential backoff and eight-attempt review. A stale
lease cannot acknowledge a newer attempt. The actor may use
support_delivery_review(original_request, nonsecret_reason) after reviewing a rejected
or exhausted attempt; the reason is audited and delivery still requires live auth
and receiver acceptance. Never create a new request to conceal an uncertain one.
The bounded pending reader exposes at most 20 own records; no other user's payload.

If the Shop database/Edge cannot accept a request, no durable delivery guarantee is
claimed. POS commits, invoice/payment writes, new queue acceptance and authorization
need their authoritative database online. Support ticket history/consent needs live
services. This is at-least-once transport with idempotent effects, not global exactly
once, offline-first POS or universal uninterrupted service.

## Compatibility and rollout

Bridge/billing/config/ticket wire contracts remain v1. The final v6 is additive: old Support
handlers can continue with the expanded SQL, and the existing Platform ticket receiver
accepts the new sender's original v1 payload. Unsupported wire versions reject only
the affected operation, retaining pending data. Current supported releases are not
suspended. Future upgrade execution must drain/settle running or unknown installer
writes and unresolved config commands, preserve queues/journals/source identities,
use compatible old/new functions, and verify runtime before contraction. A committed
migration is not assumed reversible. No upgrade scheduler/maintenance restriction
was introduced.

Pending ordered rollout (review exact target and migration list first):
1. Platform: apply only the new inventory/policy migration; keep deployed continuation
   migration and protected Master/Vault intact. Deploy platform-backend-inventory
   with gateway JWT=true. The new selected registry/plan requires a separately coordinated
   platform-provision deployment before enabling fresh v6 installs or distributing
   the v6 customer installer; existing v25 and its pins are not reinstalled here.
2. Customer-authorized Shop upgrade: apply only the missing new Shop migration first;
   deploy platform-bridge and support-tickets from the exact new approved package,
   preserving gateway false/true respectively. Other function bytes/dependencies
   must match the package; no automatic customer upgrade/repin is performed.
3. Release compatible Platform/Shop frontends after their required APIs. Old-v4 Shop
   functionality remains supported while an optional upgrade is reviewed. New
   Support frontend tolerates absent pending RPC on an old supported installation.
4. Complete separate hosted acceptance, including effective Auth/Edge permissions,
   receiver outage/replay, owner/Manager pending privacy and provider diagnostics.

No hosted migration/function mutation, customer upgrade, reset, secret rotation,
production Cloudflare promotion or merge occurred in this implementation pass.
See the external release-parity-fleet-continuity-2026-10-23 report for actual results,
final immutable fingerprint, commits, CI/preview observations and remaining limits.

The first local v5 candidate remains immutable and uninstalled. Final legacy-receipt
review required another backend change, so the corrected v6 has a new fingerprint.
V5 is catalogued as superseded, unsupported for fresh use; v4 remains supported.
Identical migration histories can belong to different function packages: diagnostics
report that ambiguity instead of guessing a full release from a ledger alone.
