> Historical additive-upgrade record below. The approved fresh source is support-v7; current customer instructions are the in-app Controlled Backend Upgrade guide and [Shop controlled upgrades](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/development/docs/CONTROLLED_BACKEND_UPGRADES.md). Preserve the dated v4/v6 source evidence and original requests; do not replay historical rollout steps.

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
