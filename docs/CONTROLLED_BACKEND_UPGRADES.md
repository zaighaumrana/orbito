> Current handoff — 28 October 2026: use Controlled Backend Upgrade in Platform and the [customer upgrade procedure](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/development/docs/CONTROLLED_BACKEND_UPGRADES.md). Approved fresh source is support-v7 (39 migrations, 7 functions, 9 requirements), fingerprint c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada. Source and tooling come from reviewed development or an approved immutable revision. The dated v6 rollout/deployment record below is historical; do not replay it as a new rollout.

# Controlled backend upgrades — current operational guidance, 2026-10-23

Current approved **fresh-install source**: support-v6, 38 migrations / 7 functions,
SHA-256 `64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31`.
V4 was approved at its historical checkpoint and remains supported. V5 was never
installed and is superseded. A provisioning pin, a customer report, a migration
ledger and an independently verified live release are distinct facts. None grants
automatic upgrade consent. Keep historical packages and original job pins unchanged.

## Installed baseline and new rollout boundary

Read-only verification confirms Platform migration20261023012318, platform-provision
v26 (gateway=false), platform-backend-inventory v1 (gateway=true). Do not reinstall
them. The new controlled-upgrade SQL/Edge/UI in this pass is LOCAL until a separately
authorized rollout. No existing customer upgrade or independent fresh installation
was performed. The owner explicitly kept fresh hosted acceptance pending.

Required new order: inspect and settle existing operations; apply ONLY
20261023141809_controlled_shop_upgrades.sql to Platform; deploy ONLY platform-upgrade
with verify_jwt=false; then compatible Platform frontend/customer tooling. This
function verifies live Master Auth for operator calls and a restricted expiring
clearance for BYO calls. The gateway setting is not anonymous upgrade authority.
No new Shop migration or packaged function is introduced by this control-plane pass;
v6 remains immutable. Source parity is `npm run release:check` in both checkouts.

## Managed: review → approve → serial execution

In the exact client detail, load saved backend evidence and run read-only diagnostics.
Load upgrade status before creating anything. Choose the actual approved source;
historical pins alone are insufficient. Prepare read-only plan: server checks the
exact paired Active/present Managed destination, current Master, approved catalogs,
source ledger hashes/order, all required function/gateway metadata, owner readiness,
owner/bootstrap lease, configuration receipts and protocol compatibility.

The v4→v6 plan applies only the missing durable Support migration and changed
platform-bridge/support-tickets packages. It does not redeploy unchanged packages,
rotate credentials, recreate owners, reset records or rewrite historical pins.
Missing/conflicting source or gateway metadata stops for explicit repair/adoption.
Current provider evidence cannot prove all current SQL/function bytes. Record the
actual nonsecret provider/source review reference before approving that limitation.
This is an operator decision, not independent source attestation.

Approval binds request UUID, client/project/source/binding, immutable source/target
hashes, exact plan digest, original Master and live session, compatibility and
maintenance/notification conditions. Type the exact target confirmation. Optional
upgrade availability never changes a healthy customer's access. Only approved
compatible protocol1/additive plans are executable; breaking upgrades need another
reviewed procedure. Runtime state is not inferred from version age.

Compatible plans require no imposed outage. If the operator requires maintenance,
provide an intended local window (converted to UTC), actual customer acknowledgment
and its nonsecret notification reference. Notification delivery is operator-reported
and audited separately. No email/SMS transport is invented or invoked. Execution
checks the window before each command; expiration stops further work conservatively.

The browser serially awaits each bounded invocation, using the original request.
At most two provider writes occur per invocation with a75-second overall deadline
and20-second individual request cap. Safe pause occurs between acknowledged units.
Refresh loads the original job; Continue uses its original pin/plan. Departed
views/sessions stop frontend continuation. Approval never authorizes a new target.

## Shared durable state and pending-operation fences

Platform private RLS shop_upgrade_jobs stores plan, approval, invocation, unknown
step, exact checkpoints and projected verification. Only scoped RPCs can mutate it;
browser/anonymous/service roles have no direct table access. Approval/reconciliation
are live canonical Master operations. Active/unknown provisioning (including a
completed job with a remaining unknown invocation), owner/bootstrap actions and
sending/uncertain configuration jobs block upgrade preparation and every execution
command. Shop owner leases and invalid config receipts are checked before writes.

Client row locks serialize both directions: a new provisioning/config reservation
cannot enter while an upgrade is pending; target/lifecycle changes are refused.
One active upgrade per client and a single invocation prevent overlapping Managed
or customer executors. BYO needs the same Platform clearance: a private local lock
alone cannot establish that unrelated Platform operations have been reconciled.
Shop config receipts are atomic applied results, not pending commands; unresolved
delivery is authoritative in Platform config_jobs. Usage/billing/Support continue
under compatible protocol1 and retain their existing outboxes/identities.

States: review → approved → running → paused → running → verification_required.
A dispatch is durable BEFORE the provider call; a lost ACK leaves the exact step
unknown, never passed. A running executor is never automatically stolen. No new
UUID or elapsed-time guess erases uncertainty. After at least ten minutes, Master
must inspect actual provider/ledger/source/gateway outcome and record its reference,
reason and applied/not-applied decision. This fences the previous invocation and
resumes the SAME job. A new live Master session can review that original interrupted
job; stale session/invocation tokens cannot checkpoint it.

Final checks require the exact target migration ledger, all required function/gateway
metadata, stable owner/binding and actual SQL runtime preflight. These are component
and readiness evidence, not a full browser/Auth/transport acceptance. Full deployed
source remains unresolved: verification_required cannot automatically become Up to
date or full-source complete. Explicit Master source/component review can close it
as completed_reviewed; the audit and verification retain full_source_verified=false.
No installed-state claim is written into the original provisioning pin or inventory
last_verified field. Failure recovery is forward-safe; committed SQL is not rolled
back on paper. Idle review cancellation does not undo installed steps.

## BYO ownership and evidence

The customer first runs the read-only assessment from the reviewed Shop checkout.
Master imports that projected assessment into the exact BYO client's plan. It is
labelled customer-reported, not provider-attested. Approval uses the same blockers,
catalog, compatibility and digest. Customer downloads a private clearance file:
request/plan/public Platform key plus a256-bit capability, hashed server-side,
expiring in two hours. It authorizes only this BYO record and fixed checkpoint
commands, never Shop administrative SQL, another client, or a Managed job.

Customer separately approves installation in their authenticated native Supabase
CLI, retains a private original journal outside both repos, and executes the exact
approved package. Before every provider write the tool checks Platform clearance
and Shop owner/binding. Platform unavailable means no upgrade; it does not suspend
the Shop. Lost claim/ACK, expired clearance/session or process interruption requires
the original job's status/reconciliation, not a replacement journal. No customer
PAT, service key or DB password reaches Platform/browser. Customer checkpoint
reports never become independently verified installed source. See the Shop
CONTROLLED_BACKEND_UPGRADES.md for exact commands.

## Platform anonymous Support closure: target-specific compatibility

20261022184736_close_empty_dev_anonymous_support.sql is **Platform-only**, not a
Shop release migration. It was applied to ukbhyerxshteyetwomqy while empty. Current
read-only ACL inspection confirms table/column/sequence anonymous intake is closed.
It intentionally aborts on any client/ticket/job/pin. Do not edit or replay it on a
populated target, truncate records, or weaken its emptiness guard. Old accepted
legacy tickets remain preserved; installed sender compatibility must be reviewed.

Run the read-only preflight with an exact customer-authorized native CLI:

```powershell
node scripts/support-closure-preflight.mjs --project-ref EXACT_PLATFORM_REF --cli C:/Path/supabase.exe
```

A populated target with that historical version pending is BLOCKED for ordinary
db push. Review every installed sender, retained legacy event/ticket provenance,
in-flight jobs and the original protected target identity. Under separate owner
approval generate a NEW forward migration using the CLI and adapt the staged
close_populated_support_after_target_review.sql template. It requires explicit
transaction-local target/reference/sender approval and the reviewed ticket count,
locks the precondition and preserves the full revocation/final guard. Do not run the
template as an upgrade step or automatically repair a ledger. An owner-approved
adoption baseline/history mapping is required BEFORE subsequent migration replay;
record the exception and actual executed SQL rather than pretending the old empty
procedure ran. Current already-closed Platform needs no adoption or additional
closure deployment. No closure SQL belongs in a Shop installer.

## Acceptance and deployment gates

Local tests prove contracts, real SQL ownership/ACLs, one additive v4→v6 SQL transition,
and simulated provider/CLI/UI behavior. They do not prove a hosted upgrade. Independent
fresh Managed/BYO projects are pending by owner choice; BYO administrator access is
unavailable. Full hosted performance and separate Platform/Shop browser checklists
remain the owner's joint acceptance. Existing baseline service can be inspected
read-only; never reset it to manufacture fresh acceptance.

Before merge/production: approve scoped new Platform rollout; run hosted upgrade
acceptance on an explicitly authorized destination; obtain independent fresh
destinations/customer CLI; verify source/gateway/runtime/consent/outage recovery;
complete both browser trackers and real hosted request/bytes/readiness measurements;
review all blockers, CI/parity and exact release; then obtain separate merge and
production approval. Keep PR5/PR1 Draft/Open against development until then.
