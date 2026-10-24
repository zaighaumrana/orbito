> Historical checkpoint / procedure. Current approved fresh source is **support-v6**, not a claim about any existing customer pin or live installed bytes. Use [current controlled-upgrade and rollout guidance](CONTROLLED_BACKEND_UPGRADES.md) before any operation. Earlier v4/v25 statements below describe their dated checkpoint.

# Bounded Managed provisioning — 2026-10-23

The preceding implementation exhausted one Edge invocation at HTTP 546 / 150840ms.
Migration/function checkpoints saved progress but did not yield. Owner setup later
completed through administrator-assisted recovery. This implementation supersedes
the earlier plan; hosted rollout and fresh acceptance remain pending.

## Execution and ownership

CLI-generated Platform migration
`20261022235702_route_resources_and_managed_continuations.sql` adds `paused` and a
private RLS-protected invocation record. The canonical live Master claims the
original request under client/job locks. Only its current token and still-live
Master session may advance stages, pairing or the release pin. Legacy Managed
begin and unfenced stage/onboarding entry points fail closed, including v1 helpers.
Existing non-Managed semantics and immutable job pins remain.

`InvocationBudget` starts at handler entry: 85 seconds total, at most five leaf
units, at least 30 seconds remaining before another unit, and an eight-second
checkpoint reserve. Fetches, bodies and internal client RPCs share the remaining
budget; individual requests are capped at 20 seconds. A slow individual unit may
still fail conservatively. Owner bootstrap and final preflight start in separate
invocations. There are no detached workers or self-invocation loops.

Normal flow is `running → paused → running → complete`. A pause is allowed only
between acknowledged units with no uncertain provider write. It preserves healthy
connection state and never runs the failure step. Completion requires its verified
final stage. The browser awaits each paused response before continuing with the
same UUID/params/pin. It stops on navigation, changed session/view, errors, missing
secret or unexpected request identity. Reload offers Continue/Retry for the recorded
job. No automatic network retry occurs.

## Uncertainty and exceptional recovery

Each leaf operation persists its dispatch identity before work. Its uncertainty
clears atomically with the passed checksum after acknowledgment. Lost acknowledgments
cannot silently become a normal pause or a different operation.

- Migration commit/reply loss: recover the original request through the existing
  interruption gate if still running. The server reads remote version/name/statements,
  verifies the pinned SHA and full ordered prefix, and skips SQL already installed.
  Missing/conflicting provenance stops without replay.
- Function/secret/configuration/owner uncertainty stops automatic continuation.
  An administrator must verify the operation is terminal and inspect the original
  target, exact deployed source/gateway, secret installation or owner reservation.
  Function inventory alone cannot prove deployed bytes. Do not audit credentials.
- After at least ten minutes from the last job update, a live Master may call
  `platform_managed_confirm(p_request,p_stage,p_reference,p_reason,p_completed)`.
  Use the original stage and nonsecret authoritative provider evidence reference.
  `true` means verified complete; `false` means verified NOT applied and safe to
  retry. This is audited as operator-reported, not machine-verified. Never use it
  just because the UI showed an error. The delay applies even to retry jobs.
- Existing `platform_provision_reconcile` retains its original delay/audit. Closing
  an unresolved provider fence is denied. Time passage never automatically steals
  ownership. A stale token cannot checkpoint after a new invocation takes ownership.

Turnstile plaintext stays in the current submit closure, is removed from the form
and goes directly to the Shop secret API. It never enters job params, browser
storage or logs. If the browser closes before that stage passes, Continue requests
the original secret again. The existing stage fingerprint rejects a different
secret for that request. Already-passed stages need no secret re-entry.

## Managed / BYO traceability

| Requirement | Managed | BYO / rationale |
| --- | --- | --- |
| Schema, consent, security and shared dependencies | Pinned support-v4 SQL/source | Same v4 manifest/customer CLI package; no Shop backend changes |
| Function bytes and gateways | Six core functions; optional Support from same pin after owner readiness | Seven exact packages/gateways; existing readiness checks |
| Checkpoints and conservative recovery | Platform token, dispatch fence, bounded Edge calls | Existing customer-local sequential installer journals and provider reconciliation; no Platform Edge execution limit |
| Turnstile and pairing secrets | Submit memory then protected Shop secret API | Customer-controlled local secret installation; no new persistence |
| Owner, binding and runtime | Canonical bootstrap/preflight now separately bounded | Existing reserved owner/binding/runtime checks, unchanged |
| Existing installs and upgrades | No automatic upgrade or repinning | Existing additive upgrader; healthy Shops remain operational |

This migration is Platform control-plane only, not a missing Shop requirement.
Do not install it into Shops or regenerate support-v4. Its canonical fingerprint
remains `f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f`.
The parity check compares all embedded bytes to committed Shop source and selectors.
Older immutable releases and original job pins remain unchanged.

## Rollout and verification boundary

Local source tests, real PG17 ownership/race checks and a local browser fixture
validate the implementation. Engine provider transport is mocked; no fresh hosted
installation or live provider recovery is claimed.

Inspect Platform migration history and original jobs; ensure no Managed invocation
is active. Apply the new forward migration to Platform, deploy only
`platform-provision`, then release the frontend against those compatible APIs. The
brief SQL-to-Edge interval fails closed for old Managed callers. Never run an old
Managed worker during cutover, reset customers or repin requests. Preserve Vault.

No hosted SQL/Edge changes occurred in this pass. The automatic feature preview
can build, but its APIs need this coordinated rollout before functional acceptance.
Production promotion remains separately authorized. Complete one fresh Managed
acceptance and explicit uncertain-provider recovery before claiming the previous
hosted timeout resolved. BYO administration is unavailable; local parity is not a
new remote BYO installation. See [resources](ON_DEMAND_RESOURCES.md) and
[release parity](Release-parity.md).
