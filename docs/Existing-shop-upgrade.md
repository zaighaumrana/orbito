> Historical checkpoint / procedure. Current approved fresh source is **support-v6**, not a claim about any existing customer pin or live installed bytes. Use [current controlled-upgrade and rollout guidance](CONTROLLED_BACKEND_UPGRADES.md) before any operation. Earlier v4/v25 statements below describe their dated checkpoint.

# Existing Shop additive upgrade

The executable procedure is maintained with the customer-side tool:
[Shop upgrade procedure](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/feature/verified-customer-support-shop/docs/Existing-shop-upgrade.md).

Use `scripts/upgrade-backend.mjs` in the reviewed Shop checkout. BYO uses the
customer's own native CLI; Managed requires a trusted operator terminal with live
canonical Master authorization and Management authorization, rechecked before
provider calls. Start with `--review`; remote writes require `--apply` and an exact
project/fingerprint typed confirmation. Preserve original setup and enrollment
journals. The upgrade has its own immutable source/target/UUID journal.

Both modes validate actual exact migration provenance, owner reservation,
completed onboarding and source/client binding; apply only missing SQL and all
required function packages; preserve approved JWT settings, unrelated functions,
Auth, secrets and business history. SQL-only upgrades cannot claim parity. Unknown
function writes require authoritative source/gateway review and explicit recorded
attestation; no blind replay or silent repinning. Incomplete, suspended, mismatched
or unrecognized historical states stop for a separately reviewed repair. Existing
custom Data API hooks require composition review before the migration can proceed.

No hosted upgrade has been executed by this implementation milestone.
