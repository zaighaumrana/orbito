# PR #4 acceptance and deferred-testing register

## Later hosted acceptance and conditional merge decision —2026-10-17

The [final hosted acceptance record](PR4_HOSTED_ACCEPTANCE_2026-10-17.md) supersedes
the deployment/merge-gate status of the earlier same-day reconciliation below.
Owner reports27 UI/session passes;owner-executed API01–API04 and CP01–CP03 were
independently evaluated by Work. Provider17 requests give14 scoped PASS outcomes
plus3 partial empty-Storage observations. These categories overlap;do not sum them
as full hosted feature passes. No fake client/project or financial mutation occurred.

Codex directly read the staging dashboard: **Require current password when updating
is enabled**,Save disabled;no setting/password/account change. A06's missing
configuration prerequisite is resolved,while its hosted negative-password HTTP
procedure remains unexecuted. Staging now records **all17 migrations**. Corrected
config12/support5/provision19 are ACTIVE and all11 returned file entries match541c46d;
D1 deployment/source drift is resolved,not a provisioning acceptance PASS. Deletion
policy remains **false**. Canonical Pages is manual541c46d deployment56fa2285,
not the earlierd3fc517. Both Pages build environments target staging;public anon
claims confirm the staging ref/role without retaining key values.

The owner conditionally authorizes the normal GitHub merge into development after
checks. See the hosted record's explicit gate decisions/technical boundaries and
before-use holds;this is not a blanket waiver or production GO. Do not delete the
feature branch until merge **and** intended automatic deployment are verified.
The existing fallback tag remains Git-only and untouched.

| Latest classification after this evidence | Cases |
| --- | ---: |
| OWNER_PASS |21|
| READ_PASS |7|
| LOCAL_PASS |45|
| DEFERRED |25|
| UNTESTED |12|
| CORRECTED_LOCAL |3|
| BLOCKED |1|
| CODE_GATE_CLOSED |1|
| PARTIAL_HOSTED |4|
| CONFIG_VERIFIED_API_UNTESTED |1|
| **Total distinct stable IDs** |**120**|

Original17 fields,historical statuses,all42 risk rows and previous current results
remain preserved. The CSV adds pre_hosted_latest_status/pre_hosted_actual_evidence
and scoped hosted observations. R06/M07/M08/M09 are **partial**,not converted to
full passes;A06 is configuration evidence,not executed password mutation tests.
R10 offset1000 with one record does not establish large-data completeness.

Matching remote read-back is observation only. Recover an uncertain config operation
through the existing Shop journal with the **exact original request UUID and payload**;
require acknowledgment of that original request before settling intent. If unavailable,
keep the operation unresolved and stop. This clarifies the historical rollout steps
below;never manually mark completion or use a new UUID to repeat an uncertain write.

## Earlier same-day documentation reconciliation —historical checkpoint


Current reconciliation: **2026-10-17, Asia/Karachi**, reviewed source
`27f6abde0274ac6c989664d0b363504b93128d10`. This documentation checkpoint
adds no runtime validation or deployment. PR #4 remains Draft, open and unmerged,
`feature/platform-team-lifecycle-v2` → `development`.

**Documentation finalization is approved. Development merge is not approved.
Production remains NO-GO.** Scoped employee staging acceptance is retained;
it is not acceptance of the entire Platform or of the later undeployed corrections.
This register supersedes current-status assertions in the historical reports
linked below, without erasing their original dates, failures or local inventories.

## Evidence sources and interpretation

The permanent, searchable [120-case ledger](PR4_ACCEPTANCE_CASES.csv) incorporates
the original `TEST_CATALOG.csv` fields, stable IDs, expected results, roles,
preconditions, steps, source components, evidence filenames, owner and priority.
It appends historical/latest status, environment, date/SHA, provenance, actual
evidence, resolved source SHAs, remaining hosted requirement, future procedure,
risk and gate disposition. The 42 original future-risk rows are joined by case ID
(`risk_register_member=YES`), retaining their exact acceptance steps and historical
gate. This CSV is documentation, not an executable test or a new test-result file.
Private identity/operation UUIDs from external evidence are omitted from these new
documentation copies; the original evidence remains unchanged.

External evidence root on the review machine:
`C:\Users\ranaz\.codex\.chatgpt-projects\g-p-6abee20745988191a04626ded1c991c2\outputs`.
These evidence files are not committed dependencies and may be unavailable in a
fresh clone. The incorporated ledger and summaries below preserve their meaning;
request the original review package for raw reproduction artifacts.

| Evidence reference | Reviewed source / date | Scope |
| --- | --- | --- |
| `pr4-forensic-2026-10-16/REPORT.md`, `HISTORY.md`, `DOCUMENTATION_AUDIT.md` | d3fc517 / 2026-10-16 | Original 11 commits, 124 net paths, D01–D40; historical F1/F2/F3 failures |
| Same directory: `TEST_CATALOG.md`, `.csv`, `EVIDENCE_AND_ACCEPTANCE.md`, `FUTURE_RISK_REGISTER.md`, `.csv`, `SECURITY_REVIEW.md`, `VALIDATION.md` | d3fc517 / 2026-10-16 | 120 cases, 42 risk rows, owner versus independent reads/local execution |
| `pr4-rereview-2026-10-17/REPORT.md` | b832dec / 2026-10-17 | F1/F2/F3 corrected locally; new N1/N2 found; no hosted correction acceptance |
| `pr4-rereview-2026-10-17/n1n2-7b7de23/REPORT.md` | 7b7de23 / 2026-10-17 | N1 local module/probe/browser PASS; N2 SQL probes PASS; actual CLI exposed N3 |
| `pr4-rereview-2026-10-17/n3-27f6abd/REPORT.md`, `RESULTS.json` | 27f6abd / 2026-10-17 | Final actual CLI, PG17, concurrency/rollback verification; documentation approval only |

Owner reports establish only the stated manual journeys. Independent staging
reads establish named state, not how the UI/mail journey occurred. Independent
local tests establish their fixture invariants, not hosted transport behavior.
Codex-reported historical totals in [engineering history](../ENGINEERING_HISTORY.md)
and [UI review](PLATFORM_UI_BRANDING_REVIEW.md) remain author reports where Work
did not independently repeat them. A Cloudflare build/check is not application CI.
No production Supabase or separate Shop access was part of these reviews.

## Stable scenario totals

| Classification | Historical 2026-10-16 | Latest reconciled |
| --- | ---: | ---: |
| OWNER_PASS | 21 | 21 |
| READ_PASS | 9 | 9 |
| LOCAL_PASS | 45 | 45 |
| DEFERRED | 27 | 27 |
| UNTESTED | 13 | 13 |
| FAIL | 3 | 0 |
| BLOCKED | 2 | 1 |
| CORRECTED_LOCAL | 0 | 3 |
| CODE_GATE_CLOSED | 0 | 1 |
| **Total distinct IDs** | **120** | **120** |

The original failures **L11/F1, S04/F2, C11/F3** remain FAIL in the historical
column and CORRECTED_LOCAL in the latest column. **O04** is CODE_GATE_CLOSED for
the independently verified source corrections; it is not permission to merge.
**P03** remains independently BLOCKED by two excluded Shop checksum fixtures.
No deferred/untested case has been promoted to a hosted pass. The 75 historical
owner/read/local passes were never 75 independently executed hosted tests.

IDs retained: A01–A14 (14), I01–I14 (14), L01–L12 (12), R01–R12 (12),
C01–C12 (12), P01–P10 (10), B01–B10 (10), S01–S08 (8), M01–M10 (10),
U01–U10 (10), O01–O08 (8). Each occurs once in the CSV; findings N1–N3 are
separate finding identities, not additional scenario IDs.

## Scoped employee staging acceptance

Owner-reported by the original 2026-10-16 forensic checkpoint; exact per-journey
execution dates/build SHAs were not supplied. Do not assign the later 27f6abd
source SHA to those hosted journeys.

| Owner manual acceptance | Stable cases / boundary |
| --- | --- |
| Master sign-in, original refresh, independent sessions, continuity diagnostic | A01–A04; does not certify hosted timebox/inactivity/current-password settings |
| Controlled-mailbox invitation, first password, Pending → Active | I01/I02; actual inbox observation belongs to owner |
| Expired/previously used links rejected; resend retains identity | A13/I03/I04; exact provider TTL/revoked-versus-used reason not inferred |
| Failed invitation recovery | I08; no new Auth account deletion performed by the review |
| Role changes; Manager/Billing Team and restricted deep links denied | R01/R02/R03/R05; full hosted direct API matrix remains deferred |
| Deactivate logs out; Reactivate restores existing identity/password/role | L01/L02; final design sends no reactivation email and creates no account; old JWT replay remains L03 |
| Team/Settings, responsive presentation, generic login errors | U03/A10; Add Client C01 is display/Cancel only, not a backend save |
| Disposable employee permanent deletion with password/CAPTCHA; same-email fresh onboarding | L06/L10; do not repeat destructive tests |

Independent **2026-10-16 state reads**, separately: old Auth UUID absent; new
distinct UUID present with Active mapping; immutable retirement archive and
operation retained with `Auth absence verified`; canonical Master intact.
Audit **306**, `staging_legacy_orphan_cleanup`, records cleanup of **two legacy
inactive orphan Platform records**, whose recorded rows were absent while the
successor remained. This does not imply two new Auth deletions by the reviewer.
The Master-bound permanent-deletion policy was last verified **enabled = false**.
No diagnostic or documentation task enables it. These reads corroborate outcomes,
not every UI/email step; no private employee name, email or UUID is needed here.

## Fourteen source commits and supersession

All 14 ordered single-parent commits were verified against Git. Before this
documentation commit the cumulative diff was **131 paths, +9077/−1159**, 14 ahead
and zero behind development. Earlier 39/61/62/63-file local sets are not the full
PR manifest. The original 11-commit snapshot was 124 net paths.

| # | Full SHA | Introduced / later disposition |
| --- | --- | --- |
| 1 | a0dae0fc90332f9fc4a498823c1851c00c3f17b6 | Lifecycle state machine, native setup router, archive/operations, migration 13. Initial custom mail/recovery-reactivation design replaced by #2. |
| 2 | be43f28b3a2cea0b1d73b2b9611a96818bed810d | Native Supabase mail only; retained-password ban/unban reactivation; live sessions/current-password proof, provider-ban ownership, default-off deletion approval; removed rejected custom email hook/recovery architecture. Provisioner two-line fix remains D1 undeployed. |
| 3 | 65429dba0e19aea6467f1347222e044f5e7549bc | Real-session service-only five-argument Support issuance; client/session continuation ownership, private-state restoration. Provisional subject impersonation superseded by final service boundary. |
| 4 | 6ea96cbc6cddda1b07b37646dba7e3456e45d52f | Login attempt generations, successor protection; read-only Shop loading independent of modal identity. #5 adds actual DOM draft retention. |
| 5 | bfc24ca50d4f5d18b329f0c601473c0f9ee208df | Migration 14: Master raw-row ceiling, narrow employee projections and bounded writes; retained client drafts. Supersedes shared employee raw reads. |
| 6 | 7acc88b4fef50e0403a62003156bc8b68e30dca6 | Canonical role changes survive dataset failures; safe Manager entitlement dispatch and accurate uncertainty. |
| 7 | 89098594780349dc3ddeda9871d95aa2e6a84102 | Edit Client dispatches default plan entitlements only on actual plan change; same-plan customization preserved. |
| 8 | 357775fd563eb1df8abc74326de61ec9d2ce0f25 | Hosted supautils exact policy-grant compatibility in then-unapplied 13/14/preflights; restrictive policies preserved. |
| 9 | 71136819abbf36ef4fc36b69702c14a471582792 | Migration 15 retirement/new-identity re-onboarding, safe deletion, invitation renewal. Old tombstone editing gap later F1/#12. |
| 10 | 015e82ed7f6b55943a595b0b778bb463b5646456 | 63-file eleven-point UI/branding/security set, migration 16, Team clearance/diagnostics, invoice print/font and CLI16 follow-ups. Local manifests now committed evidence. |
| 11 | d3fc517aabb2b5d09ea939aa56830287b5d89bba | Seven-file login/Add Client presentation and generic credential failure copy; canonical staging ad hoc artifact. |
| 12 | b832dec56b14592e44149462f127904c9c5225eb | Migration 17 F1 successor unchanged-email edit, F2 protected destination, F3 durable generation/serialization/completion; matching frontend/config/support changes. Later #13 fixes N1/N2. |
| 13 | 7b7de2335da3ec264583dc4c23c508948f665ae8 | N1 payload-aware sharing plus authoritative commercial pending/generation proof; N2 upfront locks and deferred legacy-writer fence. Actual CLI review discovers top-level lock N3. |
| 14 | 27f6abde0274ac6c989664d0b363504b93128d10 | N3 moves locks into initial DO preflight, retaining CLI-owned transaction through genuine history insertion; final independent fault/concurrency PASS. |

The following documentation commit is additive evidence reconciliation, not a
fifteenth implementation change. Its exact SHA is recorded by Git/PR after commit,
not guessed inside its own pre-commit document.

## Findings register and independent correction evidence

| Finding | Original discovery | Correction | Latest independent scope / residual |
| --- | --- | --- | --- |
| F1 / L11 | d3fc517: retired-email tombstone rejects unchanged-email edit of a valid successor | b832dec, migration 17 | 27f6abd PG17 retirement/new identity/activation/edit, collisions and authorization denials PASS. Hosted successor-edit acceptance still missing. |
| F2 / S04 | d3fc517: Manager-editable public Shop URL receives Master capability | b832dec protected explicitly Master-approved support destination/revision | 27f6abd PG17 approval, public-URL isolation, role denial, pairing/reapproval, single-use/expiry PASS. Demonstrated capability-recipient trust failure, **not actual Shop takeover**. Hosted exchange/session scope deferred. |
| F3 / C11 | d3fc517: older config completion follows newer plan save | b832dec durable intent generations, serialized commercial mutation and verified completion | 27f6abd PG17 plan/addon ordering, stale/duplicate/uncertain, two editors, same-plan preservation and Billing restrictions PASS. Existing remote mismatch not automatically repaired by default pending=false; hosted reconciliation deferred. |
| N1 | b832dec rereview: sharing an unrelated in-flight config operation can report false commercial success | 7b7de23 payload-aware coalescing and authoritative generation/pending check | Independent 7b7de23 module/extra ordering probe/native client browser PASS; source unchanged at 27f6abd, carried forward, not rerun. Hosted uncertainty/recovery separate. |
| N2 | b832dec rereview: legacy reservation can race preflight/DDL | 7b7de23 locks and deferred legacy fencing, final CLI-compatible placement in 27f6abd | Final actual CLI two schedules, four extra PG probes PASS. DDL/finisher can deadlock and abort either transaction safely; operational freeze/drain/serialized attempts mandatory. |
| N3 | 7b7de23 actual CLI: top-level LOCK cannot execute in CLI pipeline protocol | 27f6abd initial DO acquires client-before-job locks | Actual pinned CLI 2.120.0 nine fault scenarios PASS, locks held through genuine history insert. SQL-only outer transaction tests are not substituted for this result. |

Final independent review (2026-10-17) used PostgreSQL 17.6 / Supabase image
17.6.1.155, real GoTrue 2.197.0 Auth schema (82 migrations), CLI 2.120.0
SHA-256 `1cbedd6e494581a1c1d90113660113a06798d9967d19c857127b66b8a428e836`.
Fixtures included synthetic policy/Shop substrates where explicitly stated.

| Final evidence | Actual scope and result |
| --- | --- |
| `cli17.log`, `cli-evidence/migration17-results.json` | Nine scenarios PASS (10 Node tests including parent): fresh/populated success+duplicate, genuine history INSERT failure+retry, backend termination+retry, early ALTER termination, lost post-commit acknowledgment, concurrent CLI [0,1]. Exactly one real migration17 history row after success. |
| `cli-lock-lifetime.log`, `cli-lock-evidence/lock-lifetime.json` | Two schedules PASS (3 Node tests incl parent): locks after initial DO and at genuine history INSERT on same backend/transaction; queued genuine old body rejected at COMMIT, no unversioned job persists; pre-lock writer commits first and migration rejects outstanding work atomically, then genuine completion/retry succeeds. |
| `cli-first-alter.log`, `cli-first-alter-evidence/first-alter.json` | Literal first RLS ALTER interruption 1/1 PASS. Matrix early gate was later destination_revision ALTER; do not conflate the two. |
| `n2-independent.log` | Four independent PG probes PASS, including deferred/SET CONSTRAINTS fence and DDL/finisher deadlock rollback/retry. |
| `pg17-security.log` | Eight focused groups PASS: F1/F2/F3, populated preservation/late rollback, legacy-writer fences and frozen journal on minimal SQL substrate. Not full Shop acceptance. |

Lost acknowledgment deliberately produces CLI failure **after commit**: inspect
authoritative history and schema before retry; do not infer rollback from exit code.
Concurrent loser legitimately fails predecessor guard; both-success is not promised.
Initial Docker-unavailable attempts remain historical BLOCKED attempts superseded
by successful owned-fixture runs; they were not silently counted as passes.
Do not add parent Node counts to leaf-scenario counts or sum overlapping reruns.

Reproduction commands (historical evidence only; not run by this docs task):

```text
node --test --test-name-pattern="migration 17 actual CLI" tests/production-bootstrap-cli.test.mjs
node ../cli-lock-lifetime.test.mjs
node ../cli-first-alter.test.mjs
node tests/run-platform-team-local.mjs --pr4-security-only
node ../n2-runner-head.mjs --pr4-security-only
```

External scripts/tools live in the cited review package; CLI path and evidence
directory variables were explicitly set there. Broader source/Auth/email/gateway/
browser/Deno/build campaigns were **not rerun in final N3 review**. Original Work
validation at d3fc517: 287/289 mixed source cases passed; two excluded Shop fixtures
failed/unavailable (P03), clean standalone subset 255 PASS (overlapping, not added);
24 distinct SQL groups eventually passed across commands, with an initial unexplained
session failure retained; native Auth eight groups; browser six UI + six Team
theme/viewport groups + seven client groups and ten invoice scenarios; Deno 12
entrypoints and synthetic Vite build PASS. Those are historical independent results,
not a clean single whole-suite run at 27f6abd. Older Codex totals remain separately
attributed in the source reports. Native hosted email/CAPTCHA were not simulated
as provider acceptance; physical printing was intercepted, not certified.

## Deferred areas, permissions and safe acceptance

All eight areas below were intentionally deferred to finish employee lifecycle.
The CSV retains every exact scenario procedure, pass oracle, source/commit,
remediation owner, symptom and priority, including all 42 original risk rows.
This table adds current rollout requirements. No owner authorization is implied.
Use dedicated approved disposable clients/accounts/Shop targets, never real users
or money, and never an old destructive test as a routine health check.

| Area / cases | Exists and local evidence | Missing hosted check, observable risk and exact next procedure | Permission / gate / priority |
| --- | --- | --- | --- |
| 1. Manager client create/edit C02–C05 | Bounded save RPC, projections, UI draft/role guards locally covered | Approved Manager creates one fixture, reloads authoritative projection; edits name/industry/URL, reloads; reject invalid fields; inject save rejection and read failure without duplicate retry. Risk: presentation works but save fails/defaults drift. | Staging owner + Manager fixture; before use/production; P1. Merge only by separate risk/hold decision. |
| 2. Provision/Shop P01/P04/P06–P08/O08 | Protected target/binding/source, durable stages, frozen artifact and local negative tests | Resolve D1 first. Approved isolated Shop: verify exact project, provision→verify→owner reservation→bridge activation; interrupt stage acknowledgment, resume same UUID/payload; verify BYO/legacy contracts separately. Risk: partial/wrong-target installation, duplicate setup or unsupported shipped contract. | Explicit infrastructure/Shop authorization; no Shop access granted here. Before use; legacy/BYO compatibility before release; P1. |
| 3. Changed-plan C07/C08/C11 | F3/N1 versioned intent, serialized save, generation/pending proof locally PASS | Matching17/config/frontend first; Master and Manager Basic→Pro→Pro Plus/downgrade, verify actual flags and plan; two operators, delayed old completion, uncertain acknowledgment, same-request reconciliation. Risk: label/Shop mismatch or false completion. | Master/Manager fixture + approved Shop; before use/production P1. |
| 4. Same-plan C06 | Automatic defaults dispatched only on actual plan change, both-role local guard | Record customized Shop flags; name/industry/URL-only saves as Master/Manager; assert zero config dispatch and unchanged read-back. Risk: resetting intentional modules. | Approved fixture; before use P1. Modal Cancel is not this test. |
| 5. Finance B01–B04/C09 | Transaction/RLS/currency/retention checks and bounded Billing flow locally covered | Synthetic ledger: concurrent/repeated invoices at cutoff, BILL/INVENTORY charges, THERMAL noncharge, payment/credit/overpay races, future rate changes, inventory addon plus authorized Shop reconciliation. Compare ledger balances/immutable history and both systems. | Billing + Master fixture, no real payments; before financial use/production P1. |
| 6. Support S01/S02/S05/S06 | F2 protected approval, single use/expiry/lifecycle/session checks locally covered | Master independently verifies/approves intended origin; issue/exchange at approved isolated Shop; check scoped role/audit, expiry/replay/concurrent consume, wrong binding/source/client, archive/BYO denial and Master revoke/rebind versus ordinary logout. Risk: wrong recipient or overbroad session. | Master + separately approved Shop; before use P1. Historical MERGE risk S02 needs evidence or explicit isolation/risk decision. |
| 7. Provider A07/L03/R06/M07–M09/U10 | Real local SQL/PostgREST/roles; hosted metadata restrictive, no public buckets/app publication | Approved Master/Manager/Billing/Pending/Inactive/old JWTs: raw tables/columns/RPCs, exposed GraphQL/custom schemas; Storage/S3 reads/writes; Realtime tokens/channels; inspect browser storage/log/analytics without copying secrets. Compare native refresh after cutoff/reactivation. Risk: alternate-route exposure. | Read-only negatives first; separately approved owned objects if writes needed. Historical MERGE gates R06/M07/L03/U10 require acceptance or reviewed containment before broad staging use; unused transports can be explicitly deferred to release. P1. |
| 8. Production O05 and associated A06/O06/O07/U06/U08/U09/B10 | No production validation; staging is not substitute | Separately approve identity/environment/config review, native sender eligibility/rates/redirects, current-password policy, recoverable backup/rehearsal incl Auth/Vault, official visual sign-off, accessibility/other browsers/physical print; then execute agreed production catalog with controlled fixtures. | Production excluded now; production gate P1/P2 per ledger, owner release authorization required. |

Additional UNTESTED IDs: **A06, A14, I13, R10, P10, B10, S06, U06, U08,
U09, U10, O06, O07** (13). Their concrete procedures/risks are retained in the CSV:
current-password enforcement, real offline CAPTCHA, interrupted first-password
deadline recovery, pagination under changes, offline Archive retention, physical
print, full Master revoke/rebind consume, final artwork optical approval,
assistive technology/zoom, browser routing, exposure audit, restore portability,
native mail eligibility. A06/I13 and direct API historical MERGE designations are
not silently waived by documentation approval. Owner/independent reviewer must
explicitly settle required pre-merge evidence or documented containment; this
register itself grants neither a waiver nor permission to exercise them.

The original O04 code gate is closed locally; P03 independent compatibility block
remains. Temporary staging backup waived encryption/restore rehearsal; archive
readability is not recoverability. Vault/JWT encryption portability and Auth restore
must be proven in an authorized isolated rehearsal. Original historical smoke
tests 1–32 predate this PR and cannot replace these newer hosted gates.

## Git, frontend, database and Edge state are independent

| Surface | Last verified state and provenance |
| --- | --- |
| Git source | 27f6abd, 14 commits before docs; Draft PR #4; development 0dbde676ca57ed1599a295e221d274ef080cac41. Reverified for documentation checkpoint. |
| Protected Git refs | main 5df274ae9e8c187cc39e2013185cdf205e776fb1; deployment a43db6a2b5fc51f8f9039f156c6edcd6dbfeb519. Not deployment evidence. |
| Existing fallback | Annotated `development-pre-pr4-2026-10-16` target 0dbde676ca57ed1599a295e221d274ef080cac41; object c953044b6a1dc424f7601f64717e3a4c8c449248. Git-only fallback, cannot reverse Auth deletion, schema, audit 306 or Pages artifact. Never create/move/delete/push tags here. |
| Canonical staging frontend | Cloudflare `retrasellsaas`, ad_hoc d3fc517aabb2b5d09ea939aa56830287b5d89bba, deployment 0f925713-6b44-4b7a-b069-3fc598336152 (independent 2026-10-17 read). Not latest feature source. |
| Cloudflare automation | Git repo zaighaumrana/orbito; development canonical branch, production auto-deploy enabled; npm run build → dist, repository root. Provider “production” environment here means canonical staging Pages site, not production Supabase. Later b832/7b7/27f6 exact entries skipped. Verify each future SHA; prefix is not proof until provider says skipped. Do not infer absent hooks/Access from this snapshot. |
| Staging database | ukbhyerxshteyetwomqy: 16 genuine migrations through 20261015003232, 17 absent (independent 2026-10-17 read). No hosted SQL in this docs task. |
| Production | mincersddxuaqojczcih uninspected/off-limits; no inference from staging. |

### Twelve deployed function inventory

Read 2026-10-16; final 2026-10-17 review refreshed D1. Normalized returned
bundle equality refers to **d3fc517**, not indiscriminately to latest feature HEAD.
The eight employee sources are unchanged through 27f6abd, so their equality
evidence carries forward. Config/support have newer undeployed corrections.

| Function | Version | Gateway JWT | Source relationship |
| --- | ---: | --- | --- |
| create-platform-user | 16 | true | Employee source matches d3fc517; unchanged through 27f6abd |
| update-platform-user | 14 | true | Same |
| delete-platform-user | 14 | true | Same; deletion policy last verified false |
| deactivate-platform-user | 3 | true | Same |
| reactivate-platform-user | 3 | true | Same |
| resend-platform-invitation | 2 | true | Same |
| platform-password-setup | 3 | true | Same |
| clear-failed-platform-invitation | 1 | true | Same |
| platform-bridge | 8 | false | Matched d3fc517; source unchanged |
| platform-config | 11 | true | Matched d3fc517; **not** latest correction bundle |
| platform-support | 4 | false | Matched d3fc517; five-argument issuance deployed, protected17 destination contract still future |
| platform-provision | 18 | false | D1 two entrypoint differences persist; seven shared files/frozen artifact matched original read |

Mixed source/scheduler/support transports explain intentional false gateway flags;
handler-side canonical/server authentication remains mandatory. Never use a blanket
`--no-verify-jwt`, prune inventory or redeploy all slugs from an old command list.

The documentation push uses the native commit-prefix mechanism described in
[Cloudflare's GitHub integration documentation](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message).
The live project settings and prior exact skipped entries were rechecked for this
documentation task. After push, verify the new SHA's actual `is_skipped=true`
entry and unchanged canonical artifact; do not trigger another deployment to test it.

**D1 remains open**: v18 has the old arrow-form `fail` helper instead of the
reviewed function declaration, and compares recorded binding to the optional
`target.client_binding` fallback rather than actual `cfg.client_binding` against
the protected recorded binding. The latter can be a no-op; later `assertBound`
still guards activate/rotate/verify. Potential stage/resume/binding inconsistency
requires separately authorized source reconciliation and provisioning acceptance;
this is not proof of a hosted exploit or blanket provisioning failure.

### Full current migration order

Source order is the following 17 files under `supabase/migrations/`. Staging
has 1–16; fresh production must independently verify emptiness/prerequisites and
derive its own complete pending plan. Applied files are immutable. Do not replay
old 12→13→14 runbooks or manually insert migration-history rows.

| # | Version / filename suffix | Staging recorded |
| --- | --- | --- |
| 1 | 20260925153201_platform_remote_baseline.sql | Yes |
| 2 | 20260925191052_platform_control_plane.sql | Yes |
| 3 | 20260926234425_client_provisioning.sql | Yes |
| 4 | 20260928062701_platform_bridge_call_secret.sql | Yes |
| 5 | 20260929090000_onboarding_v2.sql | Yes |
| 6 | 20261001090000_manual_owner_activation.sql | Yes |
| 7 | 20261001100000_onboarding_v2_client_write_grants.sql | Yes |
| 8 | 20261001120000_onboarding_stabilization.sql | Yes |
| 9 | 20261003120000_platform_overhaul_v1.sql | Yes |
| 10 | 20261003174809_managed_support_access.sql | Yes |
| 11 | 20261003230535_support_session_handoff.sql | Yes |
| 12 | 20261008191709_production_bootstrap_hardening.sql | Yes |
| 13 | 20261010233446_platform_team_lifecycle_v2.sql | Yes |
| 14 | 20261012231226_platform_role_read_isolation.sql | Yes |
| 15 | 20261013214541_platform_team_retirement_reonboarding.sql | Yes |
| 16 | 20261015003232_platform_team_invitation_review.sql | Yes |
| 17 | 20261016160517_pr4_security_corrections.sql | **No** |

Managed policy authority in 13/14 is verified inherited owner authority **OR**
loaded, registered `supautils.policy_grants` with exact caller/table allowlist.
`CREATE POLICY` runs as original caller and fails on denial. Do not demand
USAGE/SET membership as the sole route, change managed ownership, grant internal
roles or bypass RLS. Ordinary PostgreSQL is not proof of hosted supautils behavior.
The matching preflights are predecessor checks, not current post-16 validators.
The [role field/RPC matrix](PLATFORM_ROLE_READ_ISOLATION.md) supersedes historical
Manager/Billing shared raw reads; private provisioning data stays server-side.

## Future controlled rollout — planning only

1. Obtain separate owner approval for exact target/components, risk acceptance,
   maintenance and recoverable backup. Verify fresh backup/checksums/coverage and
   documented restore limitations; Git fallback is insufficient.
2. Enforce configuration/commercial write freeze across operators, scheduled and
   direct callers. Preserve scheduler configuration; pause/drain only with explicit
   approval. Prove no relevant in-flight work. A browser-only pause is insufficient.
3. Inspect outstanding sending/uncertain jobs and delayed remote writes. Resolve
   with original operation identity/intent and verified remote read-back; never
   mark complete or blindly resend just to pass migration preflight. If drain or
   outcome cannot be established, stop.
4. Serialize CLI migration attempts. Reverify reviewed source, staging identity,
   genuine16 history and dry-run expecting **only 20261016160517**. No credential
   values in commands/logs. Plan difference requires new review/approval.
5. Apply17 with pinned supported CLI2.120.0, which owns SQL/history transaction.
   No manual history entry or arbitrary SQL runner substitution. Standalone SQL
   requires an outer transaction; do not edit migration to add BEGIN/COMMIT.
6. Inspect history and schema after every outcome: exactly17 genuine rows/one17,
   correct generation wrappers/fence/ACLs/protected destinations, retained rows,
   roles/RLS/archive/audit/finance. For ambiguous exit/lost acknowledgment inspect
   first, then decide exact retry. On uncertain failure contain writes and stop;
   deadlock abort is rollback, not permission for blind repeated deployment.
7. Reconcile approved Edge bundles, including matching config/support 17 contracts
   and separately scoped D1 provisioner correction; compare actual deployed source
   and intended per-function JWT flags. Eight deployed employee bundles do not
   mean every latest nonemployee bundle is deployed.
8. Master independently verifies intended Shop origin against protected identity/
   pairing, then explicitly approves protected Support destination via reviewed
   authority. Manager public Shop URL is never capability-recipient approval.
   Existing pre-17 grants lack destination revision and are invalidated. No automatic
   trust/import of legacy public URLs.
9. Deploy matching frontend/backend only after separate deployment authorization.
   Old config handler +17 and new config handler +old schema are unsafe mixed states;
   keep affected writes frozen until the matching combination is verified.
10. Execute approved hosted acceptance from the ledger before enabling affected
    workflows. Check preexisting Shop flags independently: migration default
    pending=false does not certify historical synchronization. Restore only approved
    original scheduler settings after validation; then explicitly release freeze.

No step here authorizes a hosted operation. No merge, deletion-policy enablement,
production rollout, Shop artifact rebuild or automatic compatibility repair is
approved by documentation finalization.

## Documentation audit disposition D01–D40

This matrix resolves documentation discrepancies against **final 27f6abd evidence**,
not against the older audit's proposed d3fc517 wording. In particular17 now exists
in source and is pending on staging; F1/F2/F3 are locally corrected. Technical
deferrals/D1 remain open even when their documentation group is complete.

| Group | Current correction / permanent location |
| --- | --- |
| D01 | Readiness dated supersession: committed source, 131 cumulative paths versus local 61/62/63 |
| D02 | Scoped owner acceptance and independent state separated from original no-hosted audit |
| D03 | Git development/protected refs distinguished from ad hoc Pages artifact |
| D04 | 16 history rows, 12 functions/eight employees; D1 retained |
| D05 | Historical12/13/14 plan superseded; source 17/staging 16 table |
| D06 | Auto-deploy enabled versus exact SHA skips; no assumed hook/Access facts |
| D07 | C06 intentional hosted same-plan deferral retained, F3 locally corrected |
| D08 | Lifecycle current pointer supersedes uncommitted/CLI16-unverified supplement |
| D09 | Migration13 never-applied claim explicitly historical; now recorded |
| D10 | Migration15 orphan/mapping work superseded by owner acceptance and audit 306 read |
| D11 | Historical destructive rollout not a repeatable health check; deletion off |
| D12 | Eight employee endpoints and already-applied13–16 supersede old six-handler plan |
| D13 | Earlier correction results retain source/date/provenance and later findings |
| D14 | UI63-file local checkpoint attributed to015e82e; seven-file polish d3fc517 |
| D15 | Print/CLI16 evidence historical; local printing not hosted physical acceptance |
| D16 | Employee deployments accepted at scoped source; newer config/support rollout separate |
| D17 | Historical63-file table preserved, not full PR manifest |
| D18 | Staging cutover v10/8/8/seven inventory historical; current12 table |
| D19 | Old three-endpoint/12-only commands not current instructions; no replay |
| D20 | Predecessor preflights not post-16 validators;17 pending |
| D21 | Owner OR exact loaded supautils policy allowlist; no internal role grants |
| D22 | Scoped employee acceptance distinguished from whole-staging/production gates |
| D23 | Bootstrap old seven allowlist superseded by12, no removal authorized |
| D24 | Full17 source order, staging 1–16 immutable; old12 table historical |
| D25 | No unconditional fourteen-version push; derive target plan and approval |
| D26 | Old seven-slug deploy obsolete; per-component authorized plan only |
| D27 | Fourteen-source/twelve-staging/SET-only narrative superseded |
| D28 | Source16 local checkpoint superseded by independently recorded16 plus source 17 |
| D29 | Historicala43/uncommitted bootstrap report preserved under current pointer |
| D30 | Bootstrap review fourteen-chain/twelve-staging future rollout historical |
| D31 | Role14 recorded; local API evidence versus missing hosted raw matrix |
| D32 | Old13/14 release plan not replayable; effective field/RPC matrix retained |
| D33 | Five-argument support v4 present; new protected17 contract future;90-second/logout rules retained |
| D34 | README current PR4 pointer above historical October4 status |
| D35 | AGENTS current branch/target corrected; all safeguards retained |
| D36 | History current prefatory pointer supersedes developmentv2-era assertion |
| D37 | 711/015/d3fc enclosing attribution preserves every original local inventory/failure |
| D38 | Precommit entries not self-referential future SHAs; current source explicitly27f6abd |
| D39 | Existing Draft PR4 body replaced by coherent14-commit scope plus documentation checkpoint; completion verified after push |
| D40 | Historical shared-read prose subordinate to migration14 field/RPC ceiling |

D01–D38/D40 are repository-documentation reconciliation; D39 additionally requires
the live PR-body update/verification reported with this checkpoint. No claim of
completed D39 should be made if GitHub editing fails. Documentation completion is
not technical closure of the deferred catalog.

Related specifications reviewed for disposition: `MODULE_ENTITLEMENTS.md`,
`NEW_CLIENT_ONBOARDING_V2.md`, `PLATFORM_OVERHAUL_V1.md`, onboarding reviews,
historical `docs/CLIENT_PROVISIONING.md`, `docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md`,
`docs/SCHEDULER_AUTH_FIX.md`, `docs/MANAGED_SUPPORT_ACCESS.md`,
`docs/PLATFORM_AUTH_DIALOG_REVIEW.md`, credential-cleanup/bridge-call documents
and old bridge/handoff reports. Preserve accounting, BILL/INVENTORY/THERMAL,
entitlements and legacy compatibility contracts; do not replay old setup commands
or infer new hosted acceptance. Password forwarding/custom mail hook remain
superseded; frontend confirmation alone is not server step-up. Current role
ceilings and protected Support destination override older broad descriptions.

## Documentation-review handoff

Independently check the 120 stable IDs/two status columns, 42 joined risk rows,
all 14 SHAs, D01–D40, owner/read/local attribution and superseding notes. Verify
source 17 versus staging 16, d3fc517 ad hoc frontend versus unmerged Git base,
12-function inventory and D1, default-off deletion, and future freeze/drain/matching
rollout requirements. Check that only documentation changed and PR remains Draft.
This is a documentation accuracy review, not permission for another runtime
campaign, deployment or destructive test. Merge and production require separate
owner decisions and retained acceptance gates.
