# Candidate installation and upgrade handoff — 30 October 2026

support-v8 is a local review candidate, NOT approved for installation or customer upgrades. Its fingerprint is af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4; backend source 5a9fca79ee24d6902cbdbcbfe5a0759454025e04; 40 migrations / 7 functions / 10 requirements. Active support-v7 remains c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada. Never change a fingerprint to make a command pass.

## Review this candidate safely

Action: use the paired review checkouts, Node 24 and the established checker:

    node scripts/check-release-parity.mjs --candidate support-v8

Run from Shop; Platform operators can run node scripts/release-parity.mjs --candidate support-v8 from Platform. Expected: PASS local candidate parity, candidate-local-not-promoted, 40 migrations, 7 functions, 10 requirements and the exact fingerprint above. If it fails: preserve the failing output and both revisions; reconcile the exact paired sources. Recovery: restore the reviewed source pairing without resetting local work or editing historical packages. This check contacts no provider and installs nothing.

## Approval and promotion prerequisites

Owner must accept registry IDs/digest and artwork/rights intake, independent code/security review, local acceptance evidence and proposed release capability mapping. Keep both PRs Draft until separately authorized otherwise. Promotion needs a separate exact-source review of both catalogs, active-shop-release.json, BYO manifest and release registry, then the established promotion process. This task does not change any active selector, hosted catalog or customer pin. Candidate source intentionally fails ordinary customer release-preflight; that is a STOP, not an installation failure to bypass.

## Current supported workflows

For already-approved v7 operations, use the existing reviewed approved source (Shop starting snapshot 784c2ce7ef3d584294b26ad3b48ce8cce253b2b7; its backend source pin remains 50b94931ecf743166136b2c562cbb6d2fbaebdc7). Preserve the original release checkout for an unresolved job. Do not point operators to a temporary feature branch. Customer tooling does not require private Platform source.

Managed fresh: Platform Client Detail guided provisioning pins an approved immutable package through platform_managed_release_pin. BYO fresh: Resume BYO Setup retains the established twelve-stage wizard and customer-controlled journal; see BYO_GUIDED_SETUP.md. Existing Managed: Controlled Backend Upgrade retains exact-client/project assessment, Master approval and bounded executor. Existing BYO: Controlled Backend Upgrade → Customer CLI instructions retains the ten-stage guide, private report, Master approval, separate clearance and original journal; see CONTROLLED_BACKEND_UPGRADES.md. Never use fresh onboarding, owner bootstrap or pairing to upgrade an existing Shop.

## After a separately approved v8 promotion

The existing workflows consume the approved catalogs; no parallel installer is introduced. The local v7→v8 plan rehearsal contains exactly migration:20261029173151 and zero changed Shop Edge Function packages. Older supported sources have different additive plans. Actual source, identity and plan must be assessed; never infer installation from an old receipt or use this example as approval.

Action: start from the correct client in Platform and copy its complete generated commands. Expected: the exact project, source, approved target, eligibility and missing steps are displayed before approval. If anything differs: STOP and reconcile source/provenance; no reset or manual SQL selection. Recovery: preserve the same request UUID, private clearance and journal; resume through the same guided stage. Unknown provider outcomes require authoritative reconciliation before another write. Repeated assessments use new report filenames; do not overwrite execution journals. An available upgrade must not suspend a healthy Shop or interrupt Bridge, billing or Support.

## Separate BYO account

Identity mapping only: Platform ukbhyerxshteyetwomqy; Managed Shop yqiefgcdvnfmdhuhitdq; BYO Shop ampwuqwokkbhkizcetsd. The BYO project is in a different Supabase account from Codex's connection. No hosted claim is made here.

Action: in the customer-controlled terminal, run node --version and supabase --version; use the existing guide to repair only missing/incompatible tools. Run supabase login with the account that owns the BYO project, then supabase projects list --output json. Expected: the EXACT supplied BYO project appears. If absent: STOP; check/switch the authorized customer account. Recovery: retain private files and exact binding; never substitute another accessible project, share PATs/passwords/service keys with Platform, or reinstall a working Shop. No commands in this handoff authorize a hosted mutation.

## Verification and recovery evidence

The native PostgreSQL harness uses actual Managed/BYO SQL envelopes, atomic history/source records and synthetic Auth. Four-path tests cover rollback/replay, constraints, canonical roles, valid/revoked Support consent, module/suspension denial, and historical text preservation. Pristine fresh Managed/BYO paths were separately checked without business fixtures before the additive step. External verification of provider deployment, hosted Auth, customer-owned account access and actual guided customer upgrades remains pending authorization/access. Physical printer evidence remains the earlier accepted deferral.
