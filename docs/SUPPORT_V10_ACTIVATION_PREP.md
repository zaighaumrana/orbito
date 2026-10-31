# Support-v10: inventory retirement and shared custom entry

31 October 2026. Source publication and upgrade preparation only. Existing feature PRs remain Draft/Open and unmerged. No hosted SQL, customer upgrade, frontend/Edge deployment or provider change is performed by this work.

The owner-approved Custom item bar spans the workspace above Catalog and Inventory, retaining the original draft, Cart and sale handler. Inventory with the new capability uses Manage stock: Add, Remove or Set exact quantity, followed by a reason and inventory-purpose PIN approval. Retire permanently removes remaining sellable stock and hides the SKU from active Inventory/POS. Retired history is read-only. Retirement retains the inventory row, sale/payment/return references and immutable movement history; it is not physical deletion. Historical returns remain available without restocking the retired SKU. Existing item creation is unchanged.

## Immutable release and source

V9 is already published and frozen; this addition is additive support-v10. V9's original package and migrations remain byte-for-byte unchanged.

- V10 fingerprint: `26885074b7035280985f5f33c42b395541fccbffe3fde94ed589969fd913b305`.
- V10 raw artifact SHA256: `f84c1c0b0eb32801e519a86712bce056220080782bdb546ddfb7623d9b49264e`.
- Committed backend source: `f78c5342fbc568a45feccdf5947fb49c774e474f`.
- Complete release: 42 Shop migrations / 7 functions / 12 requirements. Only verify-pin's function package changes, retaining JWT verification true.
- New Shop SQL: `20261031003158_inventory_permanent_retirement.sql`, SHA256 `b2cef935f2f5d9e04fd52236117a6cb4052c4c36c4c5cea4831b6afdb4385654`.
- New Platform approval metadata: `20261031010011_promote_support_v10.sql`, SHA256 `b31cb44b300a16f6cab259aff7fa64e0d411ec1bc790ee027572a78069b0381c`.
- Preserved v9 fingerprint: `60f0abe1ee5c5d1b7e2410a58acffa158a4514edb45c20f6f704745008c7d367`; raw SHA256 `e6b534245effbc47918758f4d686413a53610d87b05090a31ec8792a8c5eaac8`.

## Requirement and delivery parity

Inventory-retirement maps the new Shop migration and verify-pin bundle into both installers and capability inventory. The canonical stock RPC binds a one-time inventory PIN to actor, request and intent; request/item locks and expected quantity protect concurrent edits. Unknown outcomes retain the original UUID/payload. Immutable private operation history records even zero-stock retirement. Direct browser DELETE is revoked, direct quantity/retirement writes and retired-row edits/reactivation/restock/deletion are denied. Canonical role, active account, Inventory module, Shop lifecycle and Support consent remain authoritative. Existing cooldown, PIN expiry and other PIN purposes remain unchanged. Older releases remain healthy and use their original UI without querying new columns/RPCs.

| Route | Delivery and authority | Verification |
|---|---|---|
| Fresh Managed | Existing pinned approved release and provisioning stages install 42 SQL migrations plus seven function bundles. | Actual Managed SQL envelope, complete plan and capability tests. |
| Fresh BYO | Existing customer-owned 12-stage setup consumes the same approved source/plan, with customer authorization. | Actual BYO SQL envelope, customer source preflight and complete plan tests. |
| Existing Managed | Existing Controlled Backend Upgrade uses the original plan/job, PIN package step and journals; no terminal Shop db push. | V9 to v10: one SQL plus verify-pin. V8 to v10: v9 icon SQL plus retirement SQL plus verify-pin. Exact plan, source fences, rollback/replay and continuity tests. |
| Existing BYO | Existing customer-owned 10-stage upgrade and separate Platform clearance; retain original customer journal. | Same exact deltas and capability verification; no automatic customer upgrade. Existing BYO Client 1 is excluded. |

## Activation order and remaining work

Read-only Platform inventory during preparation remains 30 applied migrations with hosted v8 as fresh target. Both the previously published v9 approval (`20261031001127_promote_support_v9.sql`, SHA256 `853ac3c9fbf0db1b3b55aa59c6e15ee22c107d2e956476562588a27592bef088`) and the new v10 approval are pending, in that order. This is an intentional metadata chain. Stop on any other pending file or unexpected catalog state; do not include all/seed/roles. Platform migration contains no duplicated Shop operational SQL. Both source catalogs, active pointer and customer manifest select v10; immutable historical releases and existing customer pins/jobs/journals are preserved.

After separate owner authorization, activate only that Platform metadata chain, then redeploy exactly platform-backend-inventory (JWT true), platform-upgrade and platform-provision (JWT false). Preparation versions are 6 / 5 / 30 respectively; recheck before deployment. No environment/secret change is needed. Shop verify-pin is delivered by the existing fresh/upgrade plan, never a manual shortcut.

**Coordinate deployment of the new Shop frontend before applying v10 to an existing Shop.** These publication commits contain Cloudflare skip markers, so the new bar and PIN UI are not live. The old frontend cannot supply the new inventory PIN; after v10 SQL it fails closed for stock adjustments/deletion. Do not start the customer upgrade until the separately authorized frontend rollout is confirmed. No empty build-trigger commit is included here.

Then inspect live Platform Client 2, Managed project `yqiefgcdvnfmdhuhitdq`, original binding, source release, existing job/unknown outcomes and exact plan before approving. Save and resume the same request/job through final review. Do not run Shop db push or upgrade-backend --mode managed. Keep BYO Client 1 `ampwuqwokkbhkizcetsd`, frontend, clearance and journal untouched.

## Validation and evidence limits

Eleven focused unit checks, 21 existing actual-entry browser groups, six stock/bar/departure browser groups and the normal frontend build pass. Four native PostgreSQL paths run actual Managed/BYO SQL envelopes for fresh and v9 upgrade. They cover PIN/role/consent/module/lifecycle/private ACL denial, irreversible retirement, exact replay, concurrent requests, stale quantities, atomic rollback, and preservation of original sale/payment snapshots and historical refunds. Twenty-four focused Platform promotion/planner/fleet tests pass. Ordinary paired release gates and exact customer preflight verify the complete immutable source. These are local/synthetic checks, not hosted Auth, a real Shop upgrade or independent final release certification.

Final source SHAs, provider skips, CI and read-only dry-run plus staged owner commands are in `C:\Users\ranaz\Desktop\Development\pos overhaul\inventory-retirement-2026-10-31`, with the adjacent `INVENTORY-RETIREMENT-SOURCE-PROMOTION-2026-10-31.md`. Earlier consolidated/v9 reports and independent acceptance gates remain historical and unchanged. Hosted activation, coordinated frontend rollout, real controlled Shop upgrade and independent acceptance remain pending.
