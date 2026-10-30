# Icon preferences candidate — 31 October 2026

Dedicated Settings > Icons shows all 36 approved V1.0.1 SVG previews. The owner may rename picker labels and select their availability in Catalog items, repair components, Inventory and device-brand forms. Actual item/component/brand names remain edited in their existing forms. Existing icon IDs, aliases, artwork and historical assignments remain stable; hidden assignments are retained during editing, and Generic fallback is always available. Quick Item creation uses a full-width searchable icon grid inside a responsive 640px dialog; item rows align icons/names/actions.

## Canonical Shop source and package

New forward migration: 20261030233527_icon_label_preferences.sql. Canonical source commit: 46aa53af323ac495e0fc5fcb1fd81de6663cf9d8. Generated only through Shop scripts/build-platform-release.mjs --support with the versioned output path as a positional argument. New immutable artifact: Platform supabase/releases/shop-release-support-v9.json; release fingerprint 60f0abe1ee5c5d1b7e2410a58acffa158a4514edb45c20f6f704745008c7d367, 41 migrations / 7 functions / 11 requirements. Existing v8's 40 SQL entries and seven function packages are exact prefixes/identical; an existing exact v8 target needs one migration and zero changed functions.

This is an UNAPPROVED candidate (supported=false, approved_for_new=false, review_status=candidate-local). Active release, approved v8, customer pins, BYO approved manifest and historical packages are unchanged. Do not install from this candidate branch through ordinary customer preflight: it correctly rejects the unapproved source. Healthy v8 remains healthy and uses bundled defaults; Icons saving is visibly disabled until its backend advertises icon_preferences:1. No localStorage-only substitute, remote icon service, raw SVG storage or extra runtime dependency.

## Established delivery routes

| Path | Required delivery after separate review/approval |
|---|---|
| Fresh Managed | Existing Platform release authority pins the exact immutable approved package; existing installationPlan/stage journal applies all 41 SQL migrations with source checksums, original bootstrap, pairing and runtime/JWT checks. |
| Fresh BYO | Existing twelve-stage customer-controlled setup consumes the same approved package and requirements, native CLI/project checks and original private journal. |
| Existing Managed | Existing assessment, Master approval and Controlled Backend Upgrade use exact source/project/binding, one forward migration, durable operation/plan and provider-write/unknown-outcome fences. No fresh bootstrap. |
| Existing BYO | Existing ten-stage guided customer upgrade uses separate Master clearance, exact source/target/project and original customer journal. No direct SQL or fresh installer. |

New SQL belongs only in Shop migrations and the generated immutable Platform artifact. No duplicate Shop migration is added to Platform's own migration directory. Activation must use the established release approval procedure; deployed Platform inventory/provision/upgrade readers must recognize the approved package before an authorized Shop upgrade. This source publication neither approves v9 nor applies SQL to any hosted project.

## Validation and limits

Actual Managed/BYO SQL envelopes pass local PostgreSQL fresh and seeded upgrade paths, including atomic failure/no ledger residue, replay preservation, exact capability, constraints, role/lifecycle denials and consented/revoked Support. Existing planners prove one-migration/zero-function delta in an in-memory approval simulation; actual unapproved policies reject execution. Both candidate parity gates verify committed backend/source hashes, full installer requirements, shared planners/models and all immutable historical packages. Browser evidence is actual application entry with synthetic data; no real customer transaction, hosted Auth, hosted upgrade or independent final acceptance is implied.

Owner visual acceptance and separately authorized candidate approval/hosted four-path verification remain outstanding. BYO frontend retry and BYO database upgrade remain on hold; no provider configuration change, merge, release promotion or hosted migration.
