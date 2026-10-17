# PR #4 hosted acceptance and controlled development-merge decision

2026-10-17, Asia/Karachi. Accepted runtime source:
`541c46d64e8489c3aacc0e44d87f7b81b1f3a7ab` (implementation unchanged from
independently reviewed27f6abd). This record supersedes the earlier same-day
source17-pending / d3fc517-deployed summaries. It does not erase their evidence.

**Decision: conditional GO for the owner-authorized development merge only.**
A06's configuration prerequisite is now verified enabled by direct read-only
dashboard inspection. No new vulnerability was confirmed in the supplied Work
reviews. Matching17 schema and corrected function bundles are already deployed;
the merge does not introduce a new runtime implementation relative to the accepted
manual artifact. Merge remains contingent on unchanged refs, GitHub protections,
matching staging build configuration and successful deployment verification.
Production remains **NO-GO**. No permission for real client/Shop/financial operations
or deferred destructive/security testing follows from this decision.

## Provenance and evidence index

| Source | What it establishes |
| --- | --- |
| Owner's final acceptance instruction,2026-10-17 | 27 owner-executed live UI/session checks on541c46d; no failures reported. Exact individual UI timestamps were not supplied. |
| `outputs/pr4-hosted-auth-2026-10-17/REPORT.md`, `RESULTS.json` | API01–API04 owner-executed authenticated browser calls; Work inspected redacted results and separately checked population. |
| Same directory: `CLIENT_PROJECTION_REPORT.md`, `CLIENT_PROJECTION_RESULTS.json` | CP01–CP03 owner-executed browser calls; Work recalculated exact field/role/offset/context results. |
| Same directory: `PROVIDER_REPORT.md`, `PROVIDER_RESULTS.json`, `PROVIDER_METADATA.json` | Owner17 provider requests reviewed by Work; seven independently Work-executed catalog inspections. Earlier blocked/metadata-only reports remain historical. |
| Same directory: browser/projection/provider read-only scripts and reconciliation scripts | Evidence collection/redaction/positive-control/allowlist logic; not executed again by this acceptance task. |
| `outputs/pr4-doc-review-541c46d/REPORT.md`, `RESULTS.json` | Independent acceptance of13-document reconciliation,120 stable cases and42 historical risks; two nonblocking wording notes addressed below/in role documentation. |
| `outputs/pr4-rereview-2026-10-17/` and `n3-27f6abd/` | F1/F2/F3/N1/N2/N3 independently verified local corrections, actual CLI atomicity/concurrency and residual rollout limitations. Not new hosted feature passes. |

`outputs` above is under the machine-local review root recorded in the
[permanent register](PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md). New Codex read-only
checks are separately recorded under
`C:\Users\ranaz\Desktop\Development\RetraSellReviewEvidence\2026-10-17-final-acceptance`:
`a06-dashboard-observation.json`, `deployed-source-comparison.json`, and sanitized
preflight/merge/deployment metadata where available. No credentials, private
identifiers, account values, raw session/browser storage or Auth hashes are included.

## Owner UI acceptance —27/27 reported PASS

These are owner reports, **not Work-executed browser tests**. Empty interfaces
cannot prove populated-data rendering or processing. New IDs below are namespaced
acceptance observations, not additions or replacements to the original120 cases.
In particular `UI-SESSION:S01` is unrelated to catalog `S01` (Shop Support).

| Namespace / IDs | Reported outcome | Boundary |
| --- | --- | --- |
| MASTER01–MASTER04 | Login, dashboard, Team employee listing, refresh continuity:4/4 PASS | Does not test Master credential changes, permanent deletion or diagnostic settings. |
| PM01–PM08 | Canonical-role login; operational dashboard/navigation; client list/detail restrictions; Add/Edit forms open; permitted Support navigation; invoice UI restrictions; Master/Team controls restricted; own Settings/refresh:8/8 PASS | No client create/edit submitted; no live Support grant or Shop operation. Owner reported no observations. |
| BP01–BP08 | Canonical-role login; financial dashboard; financial client presentation; invoice/print interface; financial record navigation; client/Support restrictions; Master/Team restriction; own Settings/refresh:8/8 PASS | No active clients or populated invoices. No populated invoice rendering, physical print, financial mutation or processing acceptance. |
| UI-SESSION:S01–S07 | Concurrent Manager/Billing sessions; each role isolated; Manager logout/back protection; Billing survives; Billing logout/back protection; clean Manager re-login:7/7 PASS | Not old-JWT replay after deactivation, inactivity expiry or concurrent native provider revocation testing. |

Owner deliberately declined client creation because legitimate Shop URL/project
configuration is required. No fake project URLs or test client records were made.
This skipped workflow remains unaccepted (C02–C05); opening/Cancel is not saving.

## Owner-executed authenticated API, independently evaluated by Work

All requests target staging `ukbhyerxshteyetwomqy`. Both roles passed canonical
Auth UUID/session/role and own-account positive controls; private identifiers were
redacted. Work independently confirmed `clients=1`, `platform_users=3` before and
after the first runs. Counts and browser results are not one atomic snapshot.

| Case | Actual observation | Verdict / scope |
| --- | --- | --- |
| API01 / Manager | Raw clients and platform_users GET select=id,limit1:HTTP200,zero rows despite populated tables | PASS for tested raw-row filtering, not an all-column/all-route audit |
| API02 / Manager | payments read dataset:HTTP403/42501 | PASS explicit denial |
| API03 / Billing | Same two minimal raw reads:HTTP200,zero rows with population control | PASS tested raw-row filtering |
| API04 / Billing | Support dataset:HTTP403/42501 | PASS explicit denial |
| CP01 / Manager | clients projection offset0:HTTP200,zero rows; only existing client Archived | PASS archived exclusion, not populated active-client projection |
| CP02 / Billing | clients projection offset0:HTTP200,one Archived row,exact14 permitted keys | PASS exact retained financial projection; no extra/missing keys |
| CP03 / both | offset1000:HTTP200,zero rows each,canonical context preserved | PASS tested pagination requests; not >1000-row completeness or concurrent snapshot proof |

API runs: Manager08:31:48.373 and Billing08:32:24.563 Asia/Karachi.
Projection runs: Manager08:37:14.138 and Billing08:37:34.495,2026-10-17.
CP03 has two role requests: three required CP cases, four projection requests.
Do not add duplicate controls/reruns to inflate totals. HTTP POST read RPCs here
are read-only; expected403 console entries are negative-test success, not UI defects.

The exact Billing CP02 fields were independently compared to migration14:

```text
id,name,plan,status,lifecycle_state,currency,currency_symbol,billing_policy,
accounting_review_required,event_rate,inventory_rate,bill_billable,
inventory_billable,grace_period_ends_at
```

No owner contacts,Shop/provider addresses,credentials,provisioning or protected
binding fields appeared. Only field names/counts, not client values, are retained.
Independent population:total1,Archived1,non-Archived0. Do not extrapolate this
archived-only fixture to operational saves, active-row projections or invoices.

## Hosted provider acceptance

Owner provider runs:08:48:24.984 Manager and08:49:15.203 Billing,2026-10-17,
with canonical identity/own-account controls; Work independently evaluated outputs.

| Surface | Observed result | Final classification / remaining obligation |
| --- | --- | --- |
| Storage | Independent inventory0 buckets/objects; anon/Manager/Billing bucket lists200,zero visible | **PARTIAL**:three empty-inventory observations; object/S3/signed/public URL behavior untested |
| Realtime | No published sensitive tables/schemas,all_tables=false; restrictive messages policies; both REST realtime profiles406/PGRST106 | **PARTIAL**:actual channel joins/events/public-private channel and old-token behavior untested |
| GraphQL | Anonymous/Manager/Billing endpoint200,disabled confirmed,no business data/query fields; pg_graphql absent | **PASS currently disabled**, not future enabled-engine row-authorization certification |
| DB API/RPC | Both roles denied platform_private/realtime/extensions profiles406/PGRST106; both denied Support destination review and service-only finish-result403/42501; Billing denied config-intent403/42501 | **PASS tested boundaries** only; not every schema/function/overload/route |
| Native Auth current password / A06 | Direct Codex read-only staging dashboard Email provider shows “Require current password when updating” checked,Save disabled | **CONFIGURATION VERIFIED ENABLED**; no password-change request executed |

Provider17 requests comprise14 scoped PASS outcomes (3 disabled-GraphQL,6 profile,
5 RPC) plus3 PARTIAL Storage observations. They are not17 fully certified provider
features. `exposedSchemaAllowlist` in the supplied output is an Invalid schema
error string, not a complete schema allowlist. Anonymous private-profile/object
probes, enabled GraphQL, actual channels and full exposure audit remain untested.

Independent Work catalog review:121 functions,29 application relations;96 inspected
application definers use empty search_path; application anon EXECUTE closed,private
relations deny browser reads,raw shared grants constrained by canonical Master RLS,
no application view/materialized-view or API-role CREATE exception found. Those
are catalog conclusions, not121 HTTP test passes. No newly confirmed vulnerability
was reported. Review originals retain initial unavailable transport attempts.

### A06 decision — enabled, not waived

At09:02 Asia/Karachi (record written04:02:20Z), Codex inspected
`https://supabase.com/dashboard/project/ukbhyerxshteyetwomqy/auth/providers?provider=Email`
using the existing authenticated dashboard session. The **Require current password
when updating** switch was1/checked;Save disabled. No switch,Save,account or
password mutation occurred. This resolves the precise missing hosted management
configuration prerequisite identified by Work and the owner's conditional merge
instruction. It is separate from **Secure password change** (recent-login/nonce),
which was unchecked, and from the Platform default-off Master verification policy.

[Official Supabase password-security documentation](https://supabase.com/docs/guides/auth/password-security#require-current-password-when-changing)
describes validation of current_password before password update when this setting
is enabled. No universal claim about all invitation/recovery/Admin API paths is
made. The original A06 missing/wrong/correct password HTTP procedure remains
unexecuted on hosted Auth; ledger status is CONFIG_VERIFIED_API_UNTESTED, not full
runtime PASS. Local native Auth evidence remains separate. If this setting is later
disabled or its scope changes, reopen the gate; do not infer it from frontend copy.

## Fresh read-only staging and deployment verification

Codex confirmed during this task:

- Exact source541c46d,clean worktree,PR Draft/open/unmerged,target development;
  no unexpected actor commits or target drift. Development0dbde676,main5df274a,
  deploymenta43db6a and existing fallback tag unchanged before this documentation.
- **17 genuine migrations**,exactly one20261016160517 history row. No migration run.
- Twelve functions ACTIVE. Corrected config12 JWTtrue,support5 JWTfalse,provision19
  JWTfalse. All **11 returned file entries** across these three bundles match
  reviewed working source after CRLF→LF normalization,including frozen artifact.
  **D1 source drift is resolved at v19**; this is source identity,not a provisioning
  journey PASS. Employee versions16/14/14/3/3/2/3/1 remain ACTIVE,JWTtrue.
- Permanent-deletion verification policy **false**; clients1/Archived1/operational0;
  outstanding sending/uncertain config jobs0;protected Support destinations0.
- Live operator-role definition checks Active status,cutoff and live session;
  session_live checks auth.sessions. Pending employees0 and password-setting/saved/
  review-required operations0. These are state/definition observations,not token replay.
- Manual deployment **56fa2285-14b1-4efc-9094-c3b1a5a0a648** successful at
  `https://56fa2285.orbito-v2.pages.dev`,canonical `https://orbito.ahwad.com`,
  source541c46d,ad_hoc,development branch. Production Pages label means staging.
- Cloudflare Git repo zaighaumrana/orbito,canonical branch development,auto-deploy
  enabled,build npm run build,output dist,root repository. Both Pages environments'
  VITE_PLATFORM_URL point to staging; public anon JWT claims have the staging ref
  and anon role (values not recorded). Required public variable names present.
  package build is Vite only,no repository GitHub Actions workflow or migration/
  Edge deployment command. No environment/Cloudflare setting changed.

The merge's runtime tree equals the already accepted541c46d implementation; only
documentation is added. A correctly configured Git build therefore must not
replace staging with old code or production backend. Verify actual deployed revision,
assets,origin/backend after merge; do not infer success from GitHub merge alone.

## Explicit remaining-gate disposition

This is an engineering scope decision under the owner's conditional authorization,
not a silent historical gate rename. Original MERGE labels,120 IDs,42 risks and
prior status columns remain in the CSV. No missing hosted journey becomes PASS.
The accepted manual artifact already runs the same implementation; Git merge adds
no new API/code permissions. Holds below remain mandatory before expanding use.

| Gate / risk | Merge disposition and concrete basis | Retained hold / limitation |
| --- | --- | --- |
| A06 | Configuration prerequisite satisfied by direct read,not waiver | Hosted wrong/missing/correct current-password HTTP behavior still unexecuted; future own-account test needs approval |
| R06/M07 | Selected raw-table/dataset/schema/RPC routes accepted with real employee controls and independent population; GraphQL currently disabled | Exhaustive routes/columns/overloads and future GraphQL enablement not accepted; before expanded API exposure/provider use |
| L03 stale JWT after reactivation | No new merge-introduced change; independently tested local provider/cutoff,matching deployed employee bundle and live SQL guards provide technical enforcement | Hosted old-token replay still deferred; do not claim it passed or extend lifecycle security certification without approved fixture testing |
| I13 interrupted first-password recovery | Pending cannot obtain normal operator role; bounded server operation/session/activation contract locally verified,deployed source unchanged; no pending/setup-review work now | Full hosted interrupted/reload/deadline recovery remains UNTESTED; no blind repeat/force activation; approve and execute fixture recovery before operationally relying on that failure path |
| S02/S05/S06 Support replay/scope/rebind | Migration17 protected destination approval is enforced;zero destinations and only Archived client currently deny issuance; local single-use/expiry/pairing tests retained | No Support use or destination approval until separately authorized Shop exchange/scope/replay acceptance; do not weaken fail-closed approval to test |
| U10 browser exposure | Scoped profile/RPC negatives and local destination correction reduce specific exposure; no new reported leak,matching source now deployed | Full browser storage/log/analytics audit remains UNTESTED; not blanket browser secrecy certification; required before Support capability use/broad release |
| P03 excluded Shop fixtures | Independent block retained; no current operational client or provisioning acceptance; merge is same deployed Platform code,not Shop release | Before provisioning/Shop compatibility claims,use approved fixtures/release identity; do not fetch/rebuild frozen Shop or relabel Codex-only prior passes as independent |
| Client/Shop/config/finance C02–C09/C11/P01/P04/P06–P08/B01–B04 | Documented before-feature-use holds; no active client,config in-flight work or new workflow authorization | Real legitimate fixture configuration and separate use/test approval required; no fake project/client,invoice/payment or real write to manufacture acceptance |
| Storage/Realtime | Empty storage/publication state plus tested profiles; no confirmed exposed-route defect | Actual objects/S3/signed URLs/channels/events before enabling/use; no test objects/channels created now |
| Production O05/O06/O07 and visual/accessibility/print | **NO-GO**; no production inspection or acceptance | Recoverable backup/Auth/Vault rehearsal,native sender/rates,physical print,final optical/assistive/browser and full integration acceptance retained |

These holds are scope limits,not new UI feature flags. They do not prevent a
future privileged operator from creating a client or approving a destination;
such actions require their own authorization and acceptance. If broad operational
use rather than the current staging merge is requested,resolve these obligations
first. Missing containment for an actual newly confirmed vulnerability would stop
the merge; none was established by the focused evidence reviewed here.

## Recovery precision and controlled merge procedure

Matching remote read-back is **observation only**. Recover through the existing
Shop journal using the **exact original request UUID and payload**; require the
journal acknowledgment for that original request before settling commercial intent.
If unavailable,keep the operation unresolved and stop. Do not certify completion
from matching flags alone,manually complete jobs or blindly resend with a new ID.
This incorporates the independent documentation review's first precision note.
The bounded17 RPC/status extension is now described in the role matrix as well.

Commit/push only documentation on the existing branch with native CF skip prefix;
verify skip and exact remote HEAD. Recheck GitHub checks/mergeability and A06/ref/
deployment prerequisites. Then mark the existing PR ready and use GitHub normal
merge commit into development,without skip marker in merge message,without bypass.
Fetch without tags,fast-forward local development. Verify automatic Pages commit,
successful build,canonical domain/assets/routing and staging public config; request
owner login if authenticated smoke is needed. Do not rerun migrations or functions.

Only after merge and intended deployment succeed,delete the merged feature branch
remotely and locally;preserve main/deployment/fallback tag and unrelated work.
If any prerequisite or deployment fails,stop at exact partial state without branch
cleanup or blind redeploy. Final merge SHA/provider status/branch inventory belong
in the verified completion report;this pre-merge document does not invent them.
