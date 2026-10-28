# RetraSell Platform PR #5: implementation and acceptance

## A. Executive summary and scope

This is the authoritative reconciliation for [Platform PR #5](https://github.com/zaighaumrana/orbito/pull/5), as of 2026-10-25 (Asia/Karachi). It records this PR's control-plane implementation, evidence and retained acceptance obligations; it introduces no runtime change or deployment.

Implementation snapshot: `feature/verified-customer-support-platform` at `e74ffd0da943e2f4964f0a5385bc7941fe140e60`, based on `development` (`23a157a5c2aa581eec6e0f02b97318c784296e79`). GitHub was OPEN, DRAFT and UNMERGED at reconciliation. Documentation commits follow this source snapshot and do not change the deployed implementation.

The PR began with independently verified customer Support intake/enrollment/admin and grew through durable enrollment, BYO/client setup, Paper communication, consent, bounded provisioning, on-demand resources, immutable release governance, evidence inventory and controlled upgrades. Later frontend/eligibility fixes preserve the original jobs and contracts.

Platform owns canonical operator authorization, client/pairing state, central tickets/credentials, orchestration, approvals, release selection and audit. Shop owns customer Auth/roles, local operations, the durable sender/owner consent and customer-admin CLI. See the [Shop PR #1 summary](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/PR1_IMPLEMENTATION_AND_ACCEPTANCE.md) and [Shop register](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/PR1_ACCEPTANCE_CASES.csv) for that side; its implementation is not duplicated here.

The [PR5 register](PR5_ACCEPTANCE_CASES.csv) preserves the original 46 manual Platform scenarios plus distinct supported protocol/security/recovery/observation cases. A LOCAL_PASS is scoped local evidence, READ_PASS is a read-only observation, OWNER_PASS is owner-only, PARTIAL means the complete oracle is not established, and DEFERRED/UNTESTED never mean pass. The original 0/46 tracker is historical; neither CSV row totals nor overlapping suite totals are a hosted completion percentage.

### Register counts and interpretation

| Latest recorded classification | Distinct cases |
| --- | --- |
| DEFERRED | 6 |
| LOCAL_PASS | 57 |
| PARTIAL | 12 |
| READ_PASS | 3 |
| UNTESTED | 1 |
| TOTAL | 79 |

These primary classifications sum to distinct stable case IDs, not to independent test runs. Hosted status is a separate dimension; a LOCAL_PASS never automatically closes its pending/deferred hosted oracle.

| Historical classification retained | Cases |
| --- | --- |
| HISTORICAL_FINDING_OR_GATE | 32 |
| HISTORICAL_LOCAL_PASS | 1 |
| PENDING_AT_ORIGINAL_CHECKLIST | 46 |

| Orthogonal hosted status (not added to total) | Cases |
| --- | --- |
| DEFERRED_INDEPENDENT_FRESH_MANAGED | 10 |
| DEFERRED_INDEPENDENT_FRESH_TARGETS | 1 |
| FULL_ATTESTATION_UNAVAILABLE | 1 |
| OWNER_DEFERRED | 6 |
| OWNER_DEFERRED_HOSTED_MEASUREMENT | 1 |
| OWNER_DEFERRED_PAPER_THERMAL_BILLING | 1 |
| PARTIAL_READ_ONLY | 1 |
| PER_CASE_HOSTED_NOT_RECORDED | 54 |
| READ_OBSERVED_COMPLETION | 2 |
| READ_OBSERVED_PRODUCTION | 1 |
| READ_ONLY_COMPLETED_JOB_SEPARATELY_RECORDED | 1 |

## B. Chronological implementation history

The order follows Git ancestry from this PR's verified development base. Grouped deployment-only commits remain explicit; author-date anomalies do not rewrite the implementation order. All 21 original source commits are represented once. No tests in this chronology were run again for documentation.

| Order | Date (Asia/Karachi/source date) | Source commit(s) | Capability/correction | Primary files/migrations | Documents | Recorded tests/evidence | Current outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-18 | [`b170a0c`](https://github.com/zaighaumrana/orbito/commit/b170a0c3d8884211863be7af69f1375ab4d3c033) | Verified intake/enrollment/admin; immutable requester/events, atomic dedupe/budgets and public wire v1. | supabase/migrations/20261018000612_verified_customer_support.sql; platform-support-tickets/enrollment; src/pages/support.js | [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md); [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | 309/310 initial Platform; 8/8 new handlers; 7/7 native Support; initial fixture/runner gaps retained. | Current receiver/admin contract; owner aggregate is not granular negative-test acceptance. |
| 2 | 2026-10-18 | [`1dcb51f`](https://github.com/zaighaumrana/orbito/commit/1dcb51f510cec7fdd4c17b79f9cdece3c6327155) | Shop standalone portability follow-up recorded without changing Platform runtime. | ENGINEERING_HISTORY.md | [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | Shop 100/101; accepted artifact-byte gate remained historical. | Portability follow-up preserved; no Platform runtime change. |
| 3 | 2026-10-19 | [`1ec27df`](https://github.com/zaighaumrana/orbito/commit/1ec27df7722c281900829a33e002ba611f464b7b) | Removed arbitrary JWT lifetime ceiling; real Auth/live actor preserved; shared read locking and stale errors corrected. | platform-support-tickets; 20261018000612 read RPC; tests | [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md) | 312/312 Platform; 10/10 handlers/native Support; bounded campaigns replace prior interrupted runs. | Confirmed local corrections integrated; no weakened Auth gate. |
| 4 | 2026-10-19 | [`2af20cf`](https://github.com/zaighaumrana/orbito/commit/2af20cfda151a71f395d2fff1299812ae1af9c45) | Optional automatic enrollment, version2 readiness, immutable job pins, stable Vault recovery and unknown dispatch fences. | 20261019000019_support_automation_release_fences.sql; _shared/support-automation.ts | [SUPPORT_AUTOMATION.md](SUPPORT_AUTOMATION.md) | 320/320; 13 native groups; v2 initially inactive 34/7; owner Client2 manual success scoped. | Current optional enrollment/pin/unknown-write rules. |
| 5 | 2026-10-20 | [`ba13837`](https://github.com/zaighaumrana/orbito/commit/ba1383701a970273f3c9f1d289fcf7515b4fb1d4) | Owner-approved source promotion of immutable Support-v2. | release registry/pointer and 34/7 artifact | [SUPPORT_AUTOMATION.md](SUPPORT_AUTOMATION.md) | Supersedes preceding inactive selector status; Git promotion alone is not customer installation proof. | Historical v2 promotion retained; v6 now fresh source. |
| 6 | 2026-10-20 | [`fc98b32`](https://github.com/zaighaumrana/orbito/commit/fc98b322d4d3d6d9ecab9d8346df0901af218564) | BYO local coordinator and Paper communication; exact-source/owner timestamp guards; v3 inactive36/7 candidate. | 20261020135248_paper_customer_communication.sql; src/byo-stages.js | [STABILIZATION_2026_10_20.md](STABILIZATION_2026_10_20.md) | 6 new+13 existing native groups; 52 focused cases. Client3 original trigger not conclusively known. | Source fixed; Client3 original trigger remains unproven. |
| 7 | 2026-10-21 | [`974d011`](https://github.com/zaighaumrana/orbito/commit/974d011b0501e5028d4fa6c7fc8766c798f7fa34) | Preserved/hardened owner CORS hotfix; detailed guide, private/public inputs and manual acceptance boundaries. | platform-support-enrollment;src/byo-stages.js | [BYO_HARDENING_2026-10-21.md](BYO_HARDENING_2026-10-21.md) | 324/324; 6 native groups. Client4 different-account success is owner-reported. | CORS/guide integrated; Client4 result remains owner-reported. |
| 8 | 2026-10-21 | [`84c5e97`](https://github.com/zaighaumrana/orbito/commit/84c5e970ae34f38ffa2ec3cc796890f6539995cf) | Durable 12-stage BYO and Add Client wizard; exact idempotent creation, revisions and current-session ownership. | 20261021165221_coordinated_setup_wizards.sql;wizard controller/views | [COORDINATED_SETUP_WIZARDS.md](COORDINATED_SETUP_WIZARDS.md) | Final committed 326/326 Platform, 122/122 Shop; 8 native+13 Support groups; actual browser/build/digest checks. | Durable original identity/wizards integrated; fresh-v6 hosted gate separate. |
| 9 | 2026-10-22 | [`4decbd5`](https://github.com/zaighaumrana/orbito/commit/4decbd54dce84f7a086d90963c1c9cf9925d7990) | Practical task/location/recovery guide; read-only Paper refresh retains draft and avoids automatic enrollment. | src/byo-stages.js;src/paper-supply.js | [COORDINATED_SETUP_WIZARDS.md](COORDINATED_SETUP_WIZARDS.md) | Focused copied-command/browser visual path; no new broad suite or backend. | Guide/refresh integrated; no customer write on refresh. |
| 10 | 2026-10-22 | [`3c346c9`](https://github.com/zaighaumrana/orbito/commit/3c346c965062c12fe739bc503c0fc58776eb9a24) | PAPER-UX-009 input/local-time messages, overlap state and exact original-delivery reconciliation. | src/forms.js;src/paper-delivery.js;src/operations.js | [STABILIZATION_2026_10_20.md](STABILIZATION_2026_10_20.md) | Focused delivery browser pass; second reported generic notice not conclusively attributed. | Frontend correction integrated; second-toast attribution remains uncertain. |
| 11 | 2026-10-22 | [`d708294`](https://github.com/zaighaumrana/orbito/commit/d7082948c68d8323f3faa9bc491b0d0aadb1a239) | New immutable v4 after completed Shop consent backend; all selectors/allowlists; owner case consent before Managed handoff. | 20261022155957_support_consent_and_release_catalog.sql; platform-support | [Release-parity.md](Release-parity.md); [Release-parity-acceptance.md](Release-parity-acceptance.md) | 37/7 v4; local existing-v2 preservation, consent, catalog and parity pass; hosted/closure gates then pending. | Historical v4 supported; consent gates retained; v6 is current fresh source. |
| 12 | 2026-10-22 | [`eb2f553`](https://github.com/zaighaumrana/orbito/commit/eb2f553ff3ad1513699dc478214767cb8c10821f) | Forward owner-approved empty-dev closure revokes effective anonymous table/column/sequence and legacy policy. | 20261022184736_close_empty_dev_anonymous_support.sql | [Final-stabilization-issues.md](Final-stabilization-issues.md) | Focused transactional local checks; later read-only inspection observed closed privileges. No populated replay allowed. | Effective closure later observed; populated replay/adoption still gated. |
| 13 | 2026-10-23 | [`6ec3669`](https://github.com/zaighaumrana/orbito/commit/6ec3669a2e5f2c3324619b010d83b19facf0a288) | All Support routes use authoritative loader/revision; resolve/status refresh scoped; observed Managed546 diagnosed. | src/support-controller.js;src/helpers.js | [MANAGED_PROVISIONING_TIMEOUT.md](MANAGED_PROVISIONING_TIMEOUT.md) | Resolution 15->3, status 17->5 fixture requests; actual old HTTP 546 / 150840 ms is historical, not an after metric. | Shared loader/scoped refresh integrated; old hosted HTTP 546 separately corrected by bounded orchestration. |
| 14 | 2026-10-22 author date; follows preceding source commit | [`a64582c`](https://github.com/zaighaumrana/orbito/commit/a64582c711ba6db5e878dd9efaad8c85893c765d) | Mandatory backend parity rule entered the branch; preserve ancestry order despite author-date ordering. | AGENTS.md | [RELEASE_INVENTORY_CONTINUITY.md](RELEASE_INVENTORY_CONTINUITY.md) | Policy requirement, not a standalone runtime test or deployment. | Current mandatory parity rule; author date does not reorder ancestry. |
| 15 | 2026-10-23 | [`c9bb36e`](https://github.com/zaighaumrana/orbito/commit/c9bb36eb7f1b75b556ac0894f6cd0353cf78f32f) | On-demand authorized resources and durable bounded Managed continuations with invocations, pauses and ten-minute review. | 20261022235702_route_resources_and_managed_continuations.sql; platform-provision | [ON_DEMAND_RESOURCES.md](ON_DEMAND_RESOURCES.md); [MANAGED_PROVISIONING_TIMEOUT.md](MANAGED_PROVISIONING_TIMEOUT.md) | 11 focused cases/native/browser/typecheck; controlled route 13->1 requests and 400817->5947 bytes. | Bounded/source-complete; fresh independent hosted provisioning remains pending. |
| 16 | 2026-10-23 | [`011cdff`](https://github.com/zaighaumrana/orbito/commit/011cdff8e0ffff154a3daf9a3f8f134551bb3f09) | Executable parity/requirements, restricted inventory, original financial receipt lookup; final immutable v6 registry. | 20261023012318_shop_backend_inventory_and_release_policy.sql; platform-backend-inventory | [RELEASE_INVENTORY_CONTINUITY.md](RELEASE_INVENTORY_CONTINUITY.md) | 9 source cases/7 negative mutations, 4 engine cases/native continuity; source fingerprint fixed only after Shop 95448d7. | Final v6 and restricted evidence current; full-source attestation remains unknown. |
| 17 | 2026-10-23 | [`1613dbf`](https://github.com/zaighaumrana/orbito/commit/1613dbf440c95508b7a4f42d2cf34bf89a82bffd) | Shared controlled upgrade journal/plan/approval/clearance/checkpoints, bounded execution and reviewed recovery. | 20261023141809_controlled_shop_upgrades.sql; platform-upgrade; backend-upgrade.js | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 5 focused+3 affected cases/native concurrency and v4->v6 SQL; final source parity/CI pass. Fresh targets remained pending. | Both original jobs later reviewed complete; native/local evidence is separately scoped. |
| 18 | 2026-10-24 | [`dd95744`](https://github.com/zaighaumrana/orbito/commit/dd95744dc0b9c41cb7db0ff3197ef78767657571) | Consistent Platform tokens and truthful upgrade/assessment view; unknown source stays unknown; no render-time provider work. | src/ui-primitives.js;src/upgrade-view.js;src/upgrade-assessment.js | [PLATFORM_UI_CONSISTENCY.md](PLATFORM_UI_CONSISTENCY.md) | 3 assessment+11 UI source cases, responsive browser checks; existing Managed review preserved. | Current truthful presentation; no provider call caused by rendering. |
| 19 | 2026-10-24 | [`0b59e62`](https://github.com/zaighaumrana/orbito/commit/0b59e621318bfb8c457e8bde78f19e9801e37e14) | Action gates/status and stale response ownership; real desktop/mobile sidebar close/reopen. | src/backend-upgrade.js;src/render.js;src/events.js | [PLATFORM_UI_CONSISTENCY.md](PLATFORM_UI_CONSISTENCY.md) | 5 browser groups+3 assessment+1 approval case; Managed job already completed/reviewed, not modified. | Current deployed frontend source; completed Managed job preserved. |
| 20 | 2026-10-24 | [`8d14751`](https://github.com/zaighaumrana/orbito/commit/8d1475170d5a2052526333d1833f7f72f04cb0f3) | Forward correction of both upgrade guards: Managed present; Active BYO unknown/present. | 20261024014319_byo_upgrade_unknown_infrastructure.sql | [BYO_CONTROLLED_UPGRADE_409.md](BYO_CONTROLLED_UPGRADE_409.md) | Focused old-failure, positive/negative and complete synthetic BYO unknown path; existing functions/data preserved. | Forward mode correction local proof retained; later BYO reviewed completion separate. |
| 21 | 2026-10-25 | [`e74ffd0`](https://github.com/zaighaumrana/orbito/commit/e74ffd0da943e2f4964f0a5385bc7941fe140e60) | Issuer reviewed as correct; Shop permanent publishable/legacy key compatibility needs only Platform mock fixture/history change. | tests/controlled-upgrade.test.mjs;ENGINEERING_HISTORY.md | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 1 affected case+5 Shop groups/parity pass; read-only originals both completed_reviewed, 3 checkpoints,source unverified. | Test/history only on Platform; permanent CLI fix belongs to Shop. |

## C. Technical implementation inventory

| Platform surface | Implementation and contract |
| --- | --- |
| Verified Support | `platform-support-tickets` selects an enabled credential's registered Shop, then validates real Shop Auth and live actor RPC. SQL enforces exact tenant/source/binding, current operation scope, actor freshness, dedupe, revision, budgets and audit rollback. `src/support-controller.js`/`src/pages/support.js` use authorized revision-bearing projections. |
| Enrollment | `platform-support-enrollment`, `src/support-setup.js`, `_shared/support-automation.ts`: disabled prepare, exact readiness/nonce capability proof, independent enable/rotation/revoke; stable managed UUID/Vault recovery and immutable original release pin. Customer BYO plaintext/admin authority stays customer-local. |
| Client/BYO setup | `src/wizard-controller.js`, `src/wizard-views.js`, `src/byo-stages.js`: durable reviewed stages and original creation UUID, revision/session/target fences. Manual acknowledgments cannot manufacture provider-verified infrastructure. |
| Paper | `src/paper-supply.js`, `src/paper-delivery.js`, `src/forms.js`: customer messages/dates and revisioned lifecycle; local-time/future validation, original delivery reconciliation and scoped read-only refresh. No thermal/metering/billing rule redesign. |
| Resources/financial | `src/helpers.js`, route pages and `20261022235702`: bounded authorized route data, complete explicit invoice reads, global summaries, generation fencing. Original financial receipt lookup from `20261023012318` precedes uncertain payment retry. Not-observed is not proof a write failed. |
| Managed provisioning | `_shared/managed-invocation.ts`, `_shared/managed-setup.ts`, `platform-provision`, `src/provisioning.js`: trusted current session/invocation, total 85-second handler budget, bounded work, durable health-preserving pauses, serial same-request continuation and delayed audited uncertainty review. |
| Release inventory | `scripts/release-parity.mjs`, `platform-backend-inventory`, `src/backend-inventory.js`: exact source/requirement/installer-plan gate and bounded explicit read-only diagnostics. Pin, ledger, current capability, confidence/age, successor and runtime health remain distinct; Manager cannot start provider work. |
| Controlled upgrade | `platform-upgrade`, `_shared/upgrade-contract.js`, `_shared/upgrade-engine.js`, `src/backend-upgrade.js`: original private job/plan digest, live Master approval/session, pending-operation fences, maintenance acknowledgment, ordered checkpoints and reviewed final state. Two writes per 75-second bounded invocation; no executor stealing or new UUID to hide uncertainty. |
| Presentation | Shared primitives, validated assessment and lazy upgrade view retain full technical values in Advanced Details. Approved actions disappear appropriately; duplicate/stale responses are fenced. Sidebar state now closes/reopens across desktop/mobile/routes without backend changes. |

PR-specific forward migrations (applied predecessors are never rewritten):

- `20261018000612_verified_customer_support.sql`: central verified tickets, credentials, immutable requester/events, quotas/revisions.
- `20261019000019_support_automation_release_fences.sql`: pinned automatic enrollment and dispatch recovery.
- `20261020135248_paper_customer_communication.sql`: Paper customer communication.
- `20261021165221_coordinated_setup_wizards.sql`: durable setup/client creation.
- `20261022155957_support_consent_and_release_catalog.sql`: separate consent-bound handoff and catalog.
- `20261022184736_close_empty_dev_anonymous_support.sql`: locked owner-approved empty-development closure.
- `20261022235702_route_resources_and_managed_continuations.sql`: authorized resources and trusted pause/invocation state.
- `20261023012318_shop_backend_inventory_and_release_policy.sql`: inventory/policy and original financial receipt lookup.
- `20261023141809_controlled_shop_upgrades.sql`: durable shared upgrade authority/checkpoints.
- `20261024014319_byo_upgrade_unknown_infrastructure.sql`: corrects both prepare/private fences without changing any client status.

Gateway flags are explicit and are not authority by themselves: `platform-support-tickets=false`, `platform-support-enrollment=true`, `platform-provision=false`, `platform-support=false`, `platform-backend-inventory=true`, `platform-upgrade=false`. The false-gateway handlers retain their own canonical operator/customer/source checks; no anonymous administrative upgrade path follows.
Browser configuration stays public-only (`VITE_PLATFORM_URL`, `VITE_PLATFORM_ANON`, `VITE_TURNSTILE_KEY`). Management authority, Vault material, bridge/Support credentials and grants never enter VITE/browser configuration or logs. Existing canonical Master UUID/session and protected Vault records remain authoritative; an email/username alias grants no role.

## D. Backend release and deployment order

The recorded Platform Supabase target is development project `ukbhyerxshteyetwomqy`, separate from both Shop projects. Cloudflare's production environment is a frontend pipeline classification; it is not a claim that the Supabase development environment or all release gates have been promoted.

Current approved **fresh source** is immutable **support-v6**, canonical SHA-256 `64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31`: **38 migrations, 7 functions, 8 requirement groups**. This is the canonical release-body fingerprint, not the raw JSON file SHA or a provider bundle digest.

The eight groups are core runtime, usage outbox, billing projection, configuration journal, Support identity, owner consent, owner bootstrap and durable Support submission. The Platform package/registry/catalog/active pointer and actual Managed plan must match the Shop manifest/catalog/customer plan. Exact SQL/file/order/dependency/gateway coverage is mandatory; matching counts alone are insufficient.

Release chronology: accepted-v1 remains frozen 32/6; Support-v1 staged 33/7; v2 added readiness at 34/7 and was owner-promoted; v3 was the 36/7 candidate; v4 added consent at 37/7 after Shop backend `089fd7870f9f0665e35674bf7b8db9fd190f1509`, fingerprint `f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f`. Durable delivery produced v5, but the final legacy-receipt correction `95448d75b7c78fbe5e7cf0e9a02f87e7d919650d` required NEW v6. V5 remains immutable, never installed and superseded (`7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd`). Older packages and original job pins are retained.

Any later change affecting packaged SQL/functions/shared dependencies requires another immutable version and fingerprint **after** the backend implementation is complete. CLI/frontend/docs changes outside that package do not authorize rewriting v6. Full source/function/gateway inventory belongs in the [Shop installation inventory](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/PR1_IMPLEMENTATION_AND_ACCEPTANCE.md#d-backend-release-and-deployment-order).

Rollout dependencies are separate from observed completion: Platform forward SQL must precede the matching trusted functions, then compatible frontend/customer tooling. For fresh Managed, the pinned package supplies all 38 SQL migrations/six core functions and the same seventh Support function through optional owner-ready enrollment. BYO's approved customer-local installer supplies the equivalent complete SQL/function/gateway/dependency set with its own administrative authority. Optional enrollment pending is not full Support readiness.

Existing Shops use explicit reviewed additive upgrades, never baseline replay or a silent provisioning repin. The observed v4→v6 plan contains **one missing migration (`20261023012311`) and two changed functions (`platform-bridge`, `support-tickets`)**. Shop SQL precedes changed function packages and compatible UI. The original v4 provisioning pin remains historical after an upgrade; it is not proof that current installed components are still v4.

Historical rollout observations: by Oct23 the owner/read-only record had Platform `20261022235702`, then `20261023012318`, provision v26 and inventory v1 active; retrieved v26 contained all 20 referenced files and v6. Early reports still had controlled-upgrade SQL/function rollout pending. Later original Managed and BYO jobs reached reviewed completion (F). A full owner CLI transcript/time for every deployment is unavailable; successful later state must not be backdated into those earlier reports.

Current BYO eligibility distinguishes **unknown provider visibility** from **an unknown operation outcome**: only Active paired BYO allows infrastructure unknown/present; Managed still needs present. Unreachable/destroyed/decommissioned/inactive targets and unresolved provisioning/configuration/provider outcomes remain blocked. Source evidence/compatibility/approval/clearance are still required.

No deployment, migration, customer upgrade, Vault change or release regeneration occurs in this documentation pass.

## E. Benchmarks, tests and evidence

These are recorded historical executions/measurements, not newly rerun tests. Native, mocked, owner-reported and read-only observations remain distinct; overlapping program totals cannot be added into a new unique acceptance total.

| Checkpoint | Actual recorded result | Scope / limit |
| --- | --- | --- |
| Oct18/19 Support | Platform 309/310 initially, then 312/312; new handlers8→10 and local native Support7→10; Shop frozen-source gate retained separately | Initial recovery/handoff fixtures and interrupted runners were not silently passed. Later bounded campaigns preserve their history. |
| Oct19 automation | Platform 320/320, 13 native Support groups, actual entry/Support browser flows, typechecks/provider bundles | Local/loopback; owner Client2 manual result is separate. |
| Oct21 committed wizard pair | Platform326/326, Shop 122/122; 8 native+13 Support groups, named browser/build/digest programs | Exact heads 84c5e97/dba4e09 in external 04_FINAL_TEST_RESULTS.md. Prior frozen-byte test was corrected to immutable integrity plus separate source parity. |
| Oct22 consent/parity | Two Platform/four Shop focused cases; native forward chains/consent/closure/pin/data-preservation, Edge typechecks and exact committed-source package hashes | Synthetic Vault/Auth SQL substitutes are not hosted provider acceptance. |
| Oct23 bounded resources |11 focused source/engine/frontend cases plus owned local PG17 fences and browser checks | Controlled provider fixture; fresh hosted provisioning remains separate. |
| Oct23 inventory/release |9 source cases, 7 deliberate drift/omission negatives, 4 bounded engine checks and native continuity | Final committed v6 and both actual installer plans; no automatic customer upgrade. |
| Oct23 controlled upgrades |5 focused+3 affected cases, native role/ACL/concurrency/clearance/recovery and actual local v4→v6 SQL | Two serial customer invocations under one UUID; mocks/local SQL are not a real customer upgrade. |
| Oct24/25 corrections |3 assessment, 11 UI source and5 action/sidebar browser groups; complete synthetic BYO unknown path; 5 key-compatibility groups+1 shared CLI case | Original live jobs preserved; no replay. |

| Measurement | Before | After | Evidence boundary |
| --- | ---: | ---: | --- |
| Resolve + page/count refresh |15 requests /77.18 ms|3 /31.12 ms|Actual modules; one-page fixture; 8 ms per mocked upstream call. |
| Master selected-client status |17 /62.40 ms|5 /30.88 ms|Same controlled comparison; Manager projection may paginate. |
| Route loader |13 /400817 bytes /52.85 ms|1 /5947 bytes /13.45 ms|120 clients, 600 entries/ledger, 8 ms mocked delay, common bootstrap excluded. No hosted-after latency/throughput claim. |
| Earlier hosted failure |HTTP 546 /150840 ms|No comparable hosted-after timing supplied|Observed old orchestration duration; checkpoint timestamps are not per-query timing samples. |

Read-only historical gateway samples included raw Support mean 197.74 ms/max 824 and session-status mean 227.51 ms/max 4800. They include origin/service orchestration, not isolated PostgreSQL time or an index diagnosis. Hosted HAR/page-readiness comparisons remain pending.
Build sizes are artifacts, not speed benchmarks: Oct23 main 496.23 kB/gzip136.09 plus lazy upgrade 9.69/gzip3.52; final Platform frontend main 500.39/gzip137.59 (500 kB advisory) and prior UI upgrade chunk 23.23/gzip7.92. No unrelated chunk refactor was performed.
Recorded parity CI: Platform39889772834 (v6), 39976207411 (controlled), 40047457976 (frontend), 40113150336 (eligibility), 40123988040 (clearance fixture); corresponding Shop runs are in its summary. This pass performs only document/CSV/link/commit/secret-shape/diff checks; new documentation commit identities/skip proof are external.
Evidence root (`E:` in CSV): `C:\Users\ranaz\Desktop\Development\Support ticket\implementation-evidence`. Named reports are local-only and deliberately not committed. Availability is validated per reference; when raw per-case output is absent, the committed history/contract is cited and the gap retained. The original consolidated owner checklist is preserved in conversation; it is not an executed test log.

### Evidence availability and gaps

All named external report/metadata references existed locally at validation. This does not guarantee a granular raw log/timestamp for every scenario; history-only records are labelled explicitly.

Additional recorded gaps: exact per-case hosted timestamps/builds and the seven owner category names/mapping are unavailable; old runner interruptions/raw reports are not replaced with fabricated passes. Exact original Master-confirmation incident and provider bundler-warning receipts are not fully reconstructed. Data/API observation and local/current-source facts remain separate.

## F. Hosted deployment and acceptance

Latest observed frontend production: **retrasellsaas**, production branch `development`, deployment `d09e0fbc-3135-4052-a292-933b7b9c8bd2`, source `0b59e621318bfb8c457e8bde78f19e9801e37e14`, [Platform](https://orbito.ahwad.com/). Its later branch commits 8d14751/e74ffd0 affect SQL or tests/history, not the frontend build.

| Original upgrade job | Destination | Read-only observed result |
| --- | --- | --- |
| `2428e25d-ab5e-4589-aa36-fb0ca3f9c5b5` |Managed `yqiefgcdvnfmdhuhitdq`|completed_reviewed; 3 passed provider-acknowledged checkpoints; source v4→target v6; full_source_verified=false; updated2026-10-24T00:35:29.830482Z. |
| `623e0750-ea80-4281-bbd8-40c8ece23db4` |BYO `ampwuqwokkbhkizcetsd`|completed_reviewed; 3 passed customer-reported checkpoints; same approved release transition; full_source_verified=false; updated2026-10-24T18:45:00.415265Z. |

The prior read-only selected before/after projection (clearance-compatibility evidence) confirms those facts and unchanged identities/digests/times. It does not independently execute the provider/customer writes or attest every installed byte. Early pending/no-BYO-job reports are dated observations superseded by this later state.
The owner states Platform PR #5 is approved. This is recorded owner review approval, not a GitHub merge, full-source attestation or proof all 46 manual scenarios were independently executed. Shop's reported 7/7 per environment is documented only as an owner aggregate in the sister register; it does not close unnamed Platform cases.
The current documentation commits must use `[CF-Pages-Skip]` in **both** repositories. Platform feature pushes are previews; the two Shop feature-linked projects use that branch as production. Actual exact-commit skip records and unchanged canonical production IDs are verified after push and retained in external documentation evidence. No settings are changed.

## G. Security, compatibility and limitations

- Verified Support uses exact registered target and real Auth/live actor scope. Across independent databases, the actor snapshot acceptance window is at most 15 seconds after locks (2 seconds future allowance), not a globally atomic logout deadline; verification/network time precedes that window. Trusted Shop issuer/central runtime compromise is outside the stolen-Support-key-only guarantee.
- The early JWT lifetime cap, stale async errors and exclusive read locking were corrected without removing signature/session/role/tenant/revision checks. Duplicate/audit/abuse invariants remain SQL-authoritative.
- Empty-development anonymous closure corrected table, column, sequence and legacy-policy permissions transactionally. Oct22's unapplied closure labels are historical; Oct23 read-only evidence observed anonymous closure on the later populated Platform. Never replay the empty-target migration, fake its ledger or infer universal installed-sender compatibility. Populated adoption stays locked, reviewed and source-specific.
- PAPER-UX-009's future-time and stale-notice path was corrected. The exact origin of the second reported generic toast was not conclusively identified. Client3's original initialization trigger and the initial bundler warning's exact original log also remain evidence gaps.
- Both upgrade guards now allow only eligible Active BYO unknown/present and Managed present. No client infrastructure field was changed to bypass a guard. Approval, clearance, claim, checkpoints and final review retain every original pending/identity/session fence.
- Exact Master confirmation must equal `UPGRADE <project_ref> <target_sha256>` and the stored plan digest, with explicit source-limitation review and any maintenance acknowledgment. Current SQL/native fixtures support canonical approval and empty-condition/wrong-digest refusal. The owner names this as an earlier validation finding; a standalone original incident/root-cause/fix receipt was not located. This record does not invent one or claim a new hosted wrong-text test.
- Modern publishable versus legacy JWT clearance compatibility was fixed in the **Shop CLI**, not the Platform issuer. Project-bound read-only key acceptance precedes clearance authority; wrong/privileged/malformed credentials and uncertain response remain fail-closed. This does not change the existing browser public-anon export validator.
- Final reviewed completion retains full_source_verified=false. Ledger provenance, function revision/EZBR digest, checked capabilities or operator acknowledgment are not full installed-source attestation. BYO reports stay customer-reported; no fresh independent v6 installation is inferred from an existing upgrade.
- Owner-deferred additional staff/password/real Turnstile checks, Paper/thermal/billing hosted checks and final browser privileged-credential exposure inspection remain deferred. Representative hosted network/readiness measurements, independent fresh Managed/BYO targets and retained provider/revocation/before-use gates have no new complete evidence. Earlier Client4/PR4 results are scoped history.
- Wider Shop UI/UX stabilization, performance and dual-branding modernization are a separate future milestone. Platform's current UI consistency and the narrow Shop Support fix do not complete it. Existing PR4 holds are not blanket-waived by this PR or its documentation.

## H. Documentation directory

**30 existing local source documents indexed**, plus the two new authoritative artifacts in this repository. The sister set has its own inventory; shared dependencies are linked below rather than duplicating its documentation set.

| Existing source document | Purpose/conclusions used | Phase | Authority/status at this checkpoint | Incorporated sections |
| --- | --- | --- | --- | --- |
| [../ENGINEERING_HISTORY.md](../ENGINEERING_HISTORY.md) | Implementation chronology, failures, validation and rollout decisions | All | Primary dated source | B–G |
| [../AGENTS.md](../AGENTS.md) | Cost, migration immutability, evidence and parity rules | Governance | Current working rules; older branch labels are historical | A,I |
| [../NEW_CLIENT_ONBOARDING_V2.md](../NEW_CLIENT_ONBOARDING_V2.md) | Manual owner and six-step baseline | Inherited onboarding | Current invariants; dated procedures need current wizard guide | C,D |
| [../BYO_SUPABASE_ONBOARDING.md](../BYO_SUPABASE_ONBOARDING.md) | Cross-account ownership and credential boundaries | Inherited BYO | Supplementary baseline | C,D |
| [../LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md](../LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md) | Retired privilege maps and cleanup boundaries | Inherited security | Historical/supplementary; never routine reset instructions | G |
| [SUPPORT_SESSION_HANDOFF.md](SUPPORT_SESSION_HANDOFF.md) | One-time Master entry and Shop session exchange | Inherited handoff | Current mechanism; owner consent adds later prerequisites | C,G |
| [MANAGED_SUPPORT_ACCESS.md](MANAGED_SUPPORT_ACCESS.md) | Legacy support-key configuration and repair history | Before PR5 | Historical compatibility; password forwarding is superseded | C,G |
| [BRIDGE_CALL_CREDENTIAL.md](BRIDGE_CALL_CREDENTIAL.md) | Separate call/source credentials | Bridge baseline | Supplementary contract | C,D |
| [CLIENT_PROVISIONING.md](CLIENT_PROVISIONING.md) | Original provisioning/cutover behavior | Baseline | Historical procedure; V2/wizard/continuation docs take precedence | B,D |
| [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md) | Exact verified intake, Auth, privacy and protocol bounds | P1/P2 | Current wire/security contract with dated extensions | C,G |
| [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | Initial failures, local/native/browser scope and remaining gates | P1/P2 | Historical executed-test ledger | B,E,G |
| [CUSTOMER_SUPPORT_DEPLOYMENT.md](CUSTOMER_SUPPORT_DEPLOYMENT.md) | Additive initial Support SQL/functions and enrollment | P1 | Historical rollout; do not replay on completed Shops | D,H |
| [SUPPORT_AUTOMATION.md](SUPPORT_AUTOMATION.md) | Optional enrollment, readiness and immutable pin recovery | P3 | Current mechanisms; inactive-v2 rollout wording is historical | C,D |
| [STABILIZATION_2026_10_20.md](STABILIZATION_2026_10_20.md) | BYO/Paper corrections and Client3 uncertainty | P4 | Historical diagnosis, not a proven hosted root cause | B,G |
| [BYO_HARDENING_2026-10-21.md](BYO_HARDENING_2026-10-21.md) | CORS, guide, public/private input and reported Client4 success | P5 | Historical; v3 selector statements superseded by v6 | B,C,G |
| [COORDINATED_SETUP_WIZARDS.md](COORDINATED_SETUP_WIZARDS.md) | Durable client/BYO progress, revisions and creation identity | P6 | Current contract; dated rollout state is historical | C,D |
| [Release-parity.md](Release-parity.md) | V4 package proof and migration/function changes | P9 | Historical immutable-v4 checkpoint; v6 is current fresh source | B,D |
| [Release-parity-acceptance.md](Release-parity-acceptance.md) | Exact local parity/consent/native/typecheck scope | P9 | Historical results; later deployment observations supersede pending labels | E,G |
| [Existing-shop-upgrade.md](Existing-shop-upgrade.md) | Historical additive adoption requirements | P9/P14 | Historical procedure; use controlled upgrades for execution | D,G |
| [Release-rollout.md](Release-rollout.md) | SQL/function/frontend dependency order | P9 | Historical rollout order; no automatic deployment authority | D |
| [Final-stabilization-issues.md](Final-stabilization-issues.md) | S-01/02/03, P-01/02, consent and closure dispositions | P9 | Historical issue register; later closure/upgrade evidence supersedes pending states | B,G |
| [ON_DEMAND_RESOURCES.md](ON_DEMAND_RESOURCES.md) | Resource scopes, stale-response fences and measured fixture | P12 | Current architecture; benchmark is synthetic, not hosted-after proof | C,E |
| [MANAGED_PROVISIONING_TIMEOUT.md](MANAGED_PROVISIONING_TIMEOUT.md) | HTTP 546 diagnosis, budget and trusted pause design | P11/P12 | Current recovery design; older open/pending state is historical | B,C,E |
| [RELEASE_INVENTORY_CONTINUITY.md](RELEASE_INVENTORY_CONTINUITY.md) | Requirements, source parity, inventory confidence and receipt recovery | P13 | Current contracts; dated v25/no-upgrade state is historical | C,D,G |
| [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | Master review, bounded Managed execution and BYO clearance contract | P14 | Current operator workflow; rollout observations below supersede old pending text | C,D,G |
| [PLATFORM_UI_CONSISTENCY.md](PLATFORM_UI_CONSISTENCY.md) | Tokens, technical details and truthful assessment presentation | P15 | Current frontend conventions | B,C |
| [BYO_CONTROLLED_UPGRADE_409.md](BYO_CONTROLLED_UPGRADE_409.md) | Both guard corrections and exact owner-only migration verification | P17 | Current narrow correction/runbook; no redeployment in this task | B,C,G |
| [PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md](PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md) | 120-case model, evidence levels and retained gates | PR4 | Historical reference model, not PR5 acceptance | A,E,G |
| [PR4_ACCEPTANCE_CASES.csv](PR4_ACCEPTANCE_CASES.csv) | Stable ID/schema/history/provenance model | PR4 | Historical register; not copied or recounted as PR5 cases | A,E |
| [PR4_HOSTED_ACCEPTANCE_2026-10-17.md](PR4_HOSTED_ACCEPTANCE_2026-10-17.md) | Conditional development merge, provider limits and inherited holds | PR4 | Historical baseline; no blanket PR5 production approval | A,G |

### Sister repository responsibility and contract links

- [PR1_IMPLEMENTATION_AND_ACCEPTANCE.md](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/PR1_IMPLEMENTATION_AND_ACCEPTANCE.md)
- [PR1_ACCEPTANCE_CASES.csv](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/PR1_ACCEPTANCE_CASES.csv)
- [BACKEND_DIAGNOSTICS_AND_DELIVERY.md](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/BACKEND_DIAGNOSTICS_AND_DELIVERY.md)
- [CONTROLLED_BACKEND_UPGRADES.md](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/CONTROLLED_BACKEND_UPGRADES.md)
- [BYO_GUIDED_SETUP.md](https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/ff57b628fb91421a4f803477dfdf520bd111ef2a/docs/BYO_GUIDED_SETUP.md)

Historical documents are preserved unchanged. This summary reconciles their dated findings; an older developmentv2 label, inactive candidate, unapplied closure or pending upgrade sentence must not override the newer scoped observations above. Current operational procedures still require exact target/history/authority inspection before any separately authorized action.

### CSV schema and use

The UTF-8 RFC4180 register has 27 nonempty text columns: `case_id`, `journey`, `implementation_phase`, `title`, `priority`, `preconditions`, `procedure`, `expected_pass_condition`, `source_files`, `related_commits`, `documents`, `test_environment`, `evidence_location`, `evidence_date`, `historical_status`, `historical_finding`, `latest_verified_status`, `latest_evidence`, `provenance`, `execution_distinction`, `hosted_status`, `remaining_limitations`, `risk_if_untested`, `future_verification_procedure`, `acceptance_disposition`, `sister_reference`, `evidence_availability`. IDs are namespaced to this PR; original checklist cases keep their sequence. Source paths are repository-relative; documents are relative to docs/; E: is the external evidence root. Related commits resolve to real ancestors. Case evidence dates describe prior executions/observations, not this task's validation time.

Keep historical finding/status, latest recorded result, hosted status, provenance, execution distinction and final disposition together. Future verification text is a plan requiring separate authorization, not an action taken here. Aggregate owner acceptance and overlapping local suites must not inflate the CSV's distinct-case total.

## I. Final PR disposition

Implemented: the Platform control-plane contracts and corrections inventoried above. Observed: named deployed frontend/backend checkpoints and the two reviewed original upgrades. Owner-reported: Platform review approval and separate Shop aggregate acceptance. Deferred/unproven: the explicitly registered hosted/security/fresh/performance obligations and full-source attestation.

Both existing PRs remain OPEN, DRAFT, UNMERGED, targeting `development`; no branch restructuring, merge, application change or production action is authorized by this checkpoint. Only the two requested files in this repository are added; historical documents/histories remain unchanged.

For final owner disposition, read the status and hosted/provenance/limitation columns together. A documented local pass is not a universal hosted pass, and an unmapped owner aggregate is not a failure. Use the existing scoped future procedures only under separate authorization, preserve original identities/pins/audits, and do not rerun the completed customer upgrades.

Final documentation SHAs, inventory/count validation, link/commit checks and actual skip results are in `E:pr5-pr1-documentation-2026-10-25/REPORT.md` and `CURRENT.md`. The implementation snapshot above stays stable; a documentation commit must not be presented as a deployed application revision.
