# Final shared Shop backend: support-v4

Approved in source for new Managed and BYO installations; deployment and acceptance
remain owner-gated. Built only after all backend/security changes were committed
in Shop commit `089fd7870f9f0665e35674bf7b8db9fd190f1509`. The final Shop
metadata commit changes no packaged source. Any later packaged change requires a
new immutable version and SHA; never overwrite v4 or older artifacts.

**Package SHA-256:** `f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f`

37 migrations, 7 functions. Artifact: `supabase/releases/shop-release-support-v4.json`.
The fingerprint hashes the canonical JSON body excluding its sha256 field, using
the existing builder contract. Every normalized-LF migration and embedded source
file has its own SHA-256; function fingerprints include source, entrypoint and
gateway settings. This is the release fingerprint, not a claim that raw JSON file
bytes have the same hash.

## Migration differences

Accepted-v1 has 32 migrations; support-v2 has 34 and adds authenticated customer
Support. Support-v3 has 36: the 34 shared migration hashes are unchanged and adds
`20261020135016_fresh_initialization_guard` and
`20261020135251_paper_customer_communication`. Its platform-bridge differs from
v2; the other six functions/gateways matched. V4 preserves all 36 migration bytes
and adds `20261022155952_support_session_consent`, SHA-256 `39bb0ebb6da2289691623c247e43c2ca58fe95e990517356759fba0daf3c569c`.
All seven function fingerprints differ because the reviewed shared source is
embedded in each package. The artifact contains every exact migration/source hash.

## Exact function packages and gateway contract

| Function | verify_jwt | Source package SHA-256 |
|---|---|---|
| account-admin | true | `5de3ec25640842b6e0c3199d8c11aa696fbb84f8b46ce4d33851f9e7650c2c78` |
| login | true | `0780ab45754510c98421273539b9a28323421dc866246ddf10d878fe864593c7` |
| password-reset-request | true | `bd30100eed308b1c56224132a089a295e3e5ea7b97ae7ae1755023f20efc3c1e` |
| public-track | true | `830536e83c5678810773c0357d9c505e9bbaf3d8dd99a4344e59d68fede9005a` |
| verify-pin | true | `475afb3a59deb45684407cedb3fa779ca7a039e7e54e650cbcca007409ac6905` |
| platform-bridge | false | `2e11da247c5f7bbfe79c523e0c948fb3bd44324ba1975ec908f4decd6b8ae3a8` |
| support-tickets | true | `225168b5fe9cbde8498bc549f9cd0551c7a95d16639ec316dbe81bb8d9ed45c8` |

The builder includes all shared .ts sources and each function entrypoint; external
SDK URLs are pinned in those embedded sources. Existing runtime preflight and
bridge settings remain required, including project-local Supabase keys and private
CAPTCHA/bridge settings. They are never embedded in the artifact. No new secret is
introduced for consent. Static CAPTCHA validation does not prove a real challenge.

## Selection and readiness

Platform active pointer, registry, promotion catalog and forward SQL allowlist all
reference this exact id/hash. Shop BYO manifest and backend upgrade catalog match.
The registry still includes accepted-v1/v2/v3. Existing pins return their original
package; interrupted legacy jobs with prior stages remain accepted-v1. A missing
pinned package fails closed. Old artifacts and fingerprints remain unchanged.

Fresh Managed setup applies all 37 migrations and six core functions from v4.
The optional Support reconciler selects that same pinned release, verifies consent
capability/policy probes and installs support-tickets from it after owner readiness.
This completes the seven-function set without blocking normal POS on optional
enrollment. Pending optional enrollment is not full Support acceptance. Fresh BYO
applies the same 37 migrations and all seven function packages/gateways using
customer-local CLI authorization. Existing Shops require the dedicated additive
upgrade; no SQL-only parity or silent repinning is permitted.

Verification: `node tests/final-release-parity.mjs` compares every embedded byte
and migration checksum against final committed Shop backend Git blobs and checks
selectors, function/gateway sets and unchanged prior artifacts. Native final-catalog
pin checks passed separately. These are local proofs, not hosted deployment proof.

See [acceptance](Release-parity-acceptance.md), [upgrade](Existing-shop-upgrade.md),
[rollout](Release-rollout.md) and [issue register](Final-stabilization-issues.md).

## 2026-10-23 continuation

The historical v4 checkpoint above remains immutable. The current source contract,
mandatory automated gate, support-v6 release, read-only inventory and delivery
recovery are described in [Release inventory and continuity](RELEASE_INVENTORY_CONTINUITY.md).
Run `npm run release:check` against both reviewed checkouts before approval.
