# Support-v8 source approval and activation handoff — 30 October 2026

Owner-authorized hosted acceptance rollout; independent final release acceptance is pending. The original NOT READY audit and pending frontend delta review remain historical evidence. Both PRs stay Draft/Open to development.

Approved source: support-v8; SHA-256 af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4; Shop backend source 5a9fca79ee24d6902cbdbcbfe5a0759454025e04; 40 Shop migrations / 7 functions / 10 requirements. Shop is authoritative. build-platform-release.mjs packages complete SQL, function files, explicit JWT settings, requirements and checksums into the immutable Platform artifact; never edit its SQL separately or copy Shop migrations into Platform migrations.

Platform control-plane migration 20261030141736_promote_support_v8.sql ONLY changes approved_shop_releases metadata. It checks historical hashes/support/protocol policy, rejects unknown active/v8 conflicts, selects v8 alone for fresh installations and preserves optional supported v7. Transactional lock and final full-catalog invariants roll back conflicts. It does not apply Shop SQL or change installed pins, approvals, jobs, journals or audits.

The existing Shop migration 20261029173151_pos_catalog_icons_and_device_brands.sql is already inside the immutable 40-migration v8 package. The Platform approval migration does not make this 41. All historical packages remain immutable; v7 c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada remains supported with an optional v8 successor. Unresolved operations retain their original checkout, request and journal.

| Existing path | Release consumption |
|---|---|
| Fresh Managed | Platform authority pins the exact package; the existing stage-journal installer applies the complete plan to the isolated new Shop, retaining source checksums, runtime/JWT checks, pairing and owner bootstrap. |
| Fresh BYO | Resume BYO Setup retains twelve guided stages and the original private customer journal. Approved source preflight and native customer CLI account/project checks feed the same installationPlan requirements; no private Platform checkout is required. |
| Existing Managed | Controlled Backend Upgrade retains assessment, Master approval, original operation/plan, bounded dispatch fences and unknown-outcome reconciliation. A verified v7 source plans one migration and zero changed functions. |
| Existing BYO | Platform-generated Customer CLI instructions retain ten stages, exact source/target/project, separate Master clearance and original private journal. The customer upgrade tool applies only approved missing components. Never use fresh installation or owner bootstrap on an installed Shop. |

Ordinary source checks (no provider writes):

    # Platform
    node scripts/release-parity.mjs
    # Shop
    node scripts/check-release-parity.mjs
    node scripts/release-preflight.mjs --expected-sha af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4

Expected: exact approved v8, 40 migrations / 7 functions / 10 requirements; incompatible source, catalog, project or history stops. Earlier --candidate-only instructions are superseded for the approved source. Source checks do not establish hosted activation.

Hosted Platform ukbhyerxshteyetwomqy still freshly approves v7. Read-only inventory/dry run identifies only 20261030141736_promote_support_v8.sql as pending. No SQL was applied. Before any v8 provisioning or upgrade assessment, the owner must separately coordinate that approval migration with redeploying platform-backend-inventory (verify_jwt=true), platform-upgrade and platform-provision (both verify_jwt=false). Their handlers retain canonical authority checks.

Next gated stages: verify live exact catalog and bundle selection; recheck the intended Pages projects retrasellshop (Managed yqiefgcdvnfmdhuhitdq), retrabyo (BYO ampwuqwokkbhkizcetsd, different account) and retrasellsaas (Platform ukbhyerxshteyetwomqy), production branch feature/pos-operator-overhaul, npm run build / dist and public environment targets; owner-coordinated frontend triggers; then separately approved controlled Shop upgrades and hosted acceptance. Third Shop Pages project orbitoshopv2-v1 is excluded. No build trigger, hosted activation, deployment, upgrade, reset, financial transaction or merge is performed by this source publication.

Detailed architecture-before-implementation, immutable file hashes, SQL rollback evidence, ordinary parity, provider mappings/rollback IDs and publication SHAs are in the external pos overhaul/support-v8-approval-correction-2026-10-30 evidence. The previous SUPPORT-V8-PROMOTION-BLOCKED-2026-10-30.md remains unchanged.
