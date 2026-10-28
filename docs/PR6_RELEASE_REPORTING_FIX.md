# PR #6 — backend release reporting and read-only component verification

27 October 2026, Asia/Karachi. Platform-only correction on
feature/shop-modernization-m2-release, based on
65952b5b825a0915d71ce00a31bcbdcbc4a9f191. The owner's implementation request
supersedes the attached investigation's proposal-only scope. No hosted investigation
or broader performance/audit milestone was undertaken.

## Changed files

| File | Purpose |
|---|---|
| supabase/migrations/20261026220335_backend_release_reporting_verification.sql | Forward-only replacement of public.platform_backend_inventory_status(integer). |
| supabase/functions/platform-backend-inventory/handler.ts | Collect independently obtained Managed source/catalog evidence and preserve optional v7 capability. |
| supabase/functions/_shared/backend-source-verification.ts | Bounded decoded multipart source comparison and scoped live SQL/security comparison. |
| supabase/functions/_shared/backend-inventory.ts | Preserve component drift and comparison detail; do not require the v7-only capability from v6. |
| src/backend-inventory.js | Display recorded upgrades, independent current verification, limitations, timestamped runtime and fresh-approved target separately. |
| tests/backend-release-reporting.test.mjs | Five focused JavaScript regression groups, including real collector and frontend response paths. |
| tests/backend-release-reporting-native.mjs | One small PostgreSQL reporting fixture and actual RPC-to-frontend check. |
| ENGINEERING_HISTORY.md | Decisions, authority, validation and limitations. |
| docs/PR6_RELEASE_REPORTING_FIX.md | This implementation record. |

No new Edge Function was added. The existing platform-backend-inventory function
would require a separately authorized deployment. No Shop source, immutable release,
catalog approval, installation selector, Support/Bridge contract or provider
setting changed.

## Reporting contract

The existing status RPC now returns recorded_upgrade and latest_upgrade_operation,
in addition to its existing response fields. Both match the current client, project,
pairing mode, source and binding. A completion also requires a recognized immutable
target fingerprint, matching plan identities, a recorded plan hash, terminal
complete/completed_reviewed state, no unknown step, every approved checkpoint passed
with its exact hash, and the mode-appropriate saved verification.

A receipt's completion/review timestamp is the terminal record's updated_at, not
an invented provider execution timestamp. Its origin/strength comes from the
recorded mode and allowed verification evidence. BYO is always customer-reported;
a receipt never populates verified_release or last_verified. A historical target
need not remain approved for fresh installations.

The original historical Managed v4 pin and all jobs/audit records remain untouched.
A later paused/failed/uncertain operation is projected separately. Saved inventory
from another pairing mode is not reused; BYO does not inherit a historical Managed
full-verification field.

## Managed verification: what actually works

The collector checks the provider project and database client/source/binding before
trusting provider installation evidence. Exact migration tuples select a comparison
candidate; choosing that candidate does not assert an installed release. SQL-only
v5/v6 ambiguity is retained.

Read-only SELECTs retrieve declared runtime routine bodies/settings, execution
permissions, required private-table RLS/SELECT privileges, and policy definitions.
The implementation compares the eight v6 declared routines and five private
security objects against the immutable source/contract and detects changed
routine/permission/RLS/policy evidence. An absent or unsupported expected definition
remains missing evidence.

Each deployed function is requested from the documented body endpoint with
Accept: multipart/form-data, using the provider's decoded source format.
Files are compared by independently retrieved content and canonical manifest path,
with CRLF normalization. Entry-point metadata, every packaged file and the JWT
gateway must agree before that individual package-source SHA is accepted.
Provider EZBR hashes remain a separate field and never substitute for source hashes.
Omitted files are not filled from the expected package. Changed returned source
is reported as drift, and missing/unreadable evidence remains pending.

The diagnostic is bounded by its existing overall deadline, a 40-second provider
budget, 4 MiB per function and 100 files. Source/SQL bodies and credentials are not
returned in saved reports: only comparison outcomes, object/file names and existing
nonsecret package identities.

## Full Managed verification is still not established

Two distinct limitations prevent a truthful full-release assertion:

1. The provider can omit unused packaged shared files from decoded downloads.
   Their names remain in source_files.missing; a bundle hash cannot prove their
   original immutable package bytes. Unsupported binary downloads/HTTP denial,
   malformed metadata and budget exhaustion are also explicit pending evidence.
2. Existing immutable releases do not contain an independently canonicalized,
   complete database catalog baseline for every SQL object/policy/ACL expression.
   The new comparisons establish the declared runtime/private-security scope,
   not equality of the entire live database to a clean approved installation.

Accordingly this collector deliberately retains database_source_match=false and
reports scoped comparisons as partial. Even all seven individual function matches
cannot manufacture full installed-release verification. Completing the missing
canonical baseline/provider evidence would be separately scoped work; this task
does not expand into a new installer, reference-environment system or release change.

BYO still uses restricted runtime/capability observations and separately classified
customer-provided upgrade receipts. No Managed provider access is attempted for BYO.

## v6 / v7 capability handling

bounded-operational-reads is retained when boolean. It is required by v7's declared
requirements, and absent/false optional evidence does not invalidate historical v6.
No release was promoted and no capability was added to the universal v6 probe
requirements.

## Validation

- node --test tests/backend-release-reporting.test.mjs — 5/5 PASS.
  Managed v6 source components, bundle/source separation, missing source, BYO trust,
  mismatched identity, v6/v7 capability handling, SQL/ACL/RLS/policy/Edge drift and
  actual frontend loader/render behavior.
- PR6_EVIDENCE=<evidence folder> node tests/backend-release-reporting-native.mjs —
  one small PG17 fixture, seven groups PASS. Managed/BYO v6 dates/strength, v4 pin,
  exact identity and plan rejection, incomplete/unknown/hash-mismatched checkpoints,
  later failed operation, stale-mode evidence protection, historical target,
  RPC ACL, audit preservation, executable catalog SELECT and actual RPC-to-frontend
  consumption. Synthetic canonical-role helpers, not hosted Auth.
- Node runtime TypeScript imports and changed-JS syntax pass; staged diff is checked.
  No browser automation, broad suite, benchmark or large synthetic scenario ran.

Evidence is retained under the existing archive:
Milestone-2-Performance/evidence/20261026T222004Z-PR6-release-reporting-fix.
focused-tests-final.log and sql-verified/sql-reporting-contract.json are current.
Earlier startup, quoting and fixture failures remain recorded. The owned isolated
network-none/no-port container was removed after each run; no other container
was selected. Tests created no hosted database state.

## Publication boundary

The owner authorizes committing and pushing this correction to existing Platform
PR #6 only, without another approval step or new enforcement. Retain the established
[CF-Pages-Skip] convention; no deployment settings are changed. Exact pushed SHA
and provider skip observation are recorded in the external evidence and PR update.

No hosted migration, Edge deployment, merge, support-v7 promotion or Shop change
is authorized or performed. Existing independent-audit/milestone acceptance gates
are not claimed complete by these targeted tests.

## Sequential upgrade navigation correction — 27 October 2026

Completed/cancelled plans previously occupied the active presentation and blocked
next preparation; review also preferred their original source SHA. The frontend
now separates previous, next-preparation and current-active views. Load upgrade
status retains the historical receipt and exposes Prepare next upgrade. View
previous upgrade restores its source/target, date, checkpoints and verification
limits; after a new review, Return to current upgrade restores the active workflow.

Separate preparation clears old form/approval/request state, requires explicit
supported source selection, and creates a new request only on review submission.
Unfinished/uncertain/verification-required jobs block competing preparation. Lost
submissions retain their exact request/projected payload through status recovery.
Managed live source review and fresh BYO evidence/clearance rules remain unchanged.
A previous receipt is not independent installed-source proof.

Changed: src/backend-upgrade.js, src/upgrade-view.js, src/upgrade-assessment.js,
tests/upgrade-navigation.test.mjs, this document and ENGINEERING_HISTORY.md.
Four small fixture groups PASS: Managed/BYO navigation, unfinished fences, exact
request retries and departed client/role responses. Changed JS syntax, local import
resolution and assessment module import PASS. No browser, Docker, database,
performance or broad regression checks were run. No large evidence archive added.

Owner authorizes one normal commit/push to Draft PR6 and its automatic Pages build,
superseding the prior skip convention for this correction. No extra trigger commit,
Shop change, backend migration/function/catalog change, hosted Supabase operation
or actual Shop upgrade is part of this task. Final Git/Pages results are recorded
in the PR and task completion report.

## Guided BYO customer instructions — 28 October 2026

Customer CLI instructions now contains the complete ten-stage in-app procedure,
with copyable client-specific PowerShell, expectations and recovery. It remains
available in historical/current/approved BYO views. Identity/binding checks block
unknown context; an evidenced source selection refreshes its command immediately.
Only an exact approved request exposes apply. No credentials or clearance contents
enter the guide. The existing upgrade and original-request recovery engine remains
unchanged; the browser never claims a local command passed.

Shop adds customer-available immutable-source preflight without private Platform
access, while retaining the unchanged internal paired release gate and friendlier
stale-workspace diagnostics. Native PATH/Scoop discovery and prerequisite messages
are aligned. The obsolete verified-customer-support-shop link is replaced by an
optional M2-branch reference. Exact implementation files/results/source references
and owner acceptance are in the small M2 BYO-guide evidence folder. Local focused
checks pass; no SQL, Supabase function/provider operation or customer upgrade ran.
Normal commits/pushes and automatic Pages builds are owner-authorized; PRs stay Draft.

## Original-wizard-based BYO upgrade repair — 28 October 2026

Reworked the ten-stage inline guide using the original twelve-stage fresh wizard’s
objectives, work location, prerequisites, ordered tasks, explained commands, success/
failure checks, When to continue and concrete recovery. The fresh wizard itself is
unchanged. Local stage selection/Back/Next is navigation only, with no new persisted
progress or backend acknowledgment. Missing prerequisites keep commands blocked.

Every operational copy block independently restores known client/project/source/
target and local folder/journal context in its own PowerShell scope. Inventory and
assessment check native exit status, generated report existence and actual report
contract/identity/binding/plan before a final PASS; failures throw STOP. Old completed
receipt source cannot leak into a new guide assessment. Optional local path fields
remove prompts and are retained only in client-scoped ephemeral draft state. The
user-profile private default and original-folder/custom-journal recovery are explicit;
reports have unique names and assessment never creates/replaces an execution journal.

Stage 3 provides guarded clean-M2 fetch/--ff-only recovery for missing scripts,
stopping on dirty/wrong/divergent source. Customer stages no longer show private
Platform parity instructions. Command headers/copy buttons now align consistently,
clipboard values remain complete and selectable, and scoped inline accessible copy
feedback replaces overlapping floating green labels throughout this guide.

The Shop change only improves input diagnostics; no upgrade engine, release/package,
SQL/Edge, approval or provider-write fence changes. The owner’s separate trial
checkout/private files are untouched. Focused local checks and exact files/commits
are recorded in the single M2 correction report. Normal existing-branch pushes and
automatic Pages builds are authorized; no empty trigger or hosted Supabase change.

## BYO stages 2 and 5 correction — 28 October 2026

Stage 2 probes native Git/Node 24+/Supabase versions before installation. Working
tools print SKIPPED; Scoop itself is unnecessary when all tools work. Missing
commands first check Scoop's installed-package list, stopping for PATH repair if
already installed. Supabase reuses a bucket whose source is the official HTTPS
repository (including an alternate registered name); an unverified conflicting
bucket stops for review. Only missing packages/buckets are installed; none are
removed. Final native `supabase --version` must pass.

Stage 5 checks existing project access before offering login. Windows PowerShell
5.1 assigns `ConvertFrom-Json` directly, then filters with an explicit exact-ID
script block; no outer array wrapper. Command/login failure, malformed JSON and
an absent exact project have distinct STOP results. Account recovery is explicit
`supabase logout`, `supabase login`, then the whole check; local token overrides
must be reconciled privately. No project substitution or backend bypass.

Two focused Windows PowerShell 5.1 fixture groups and the existing generated-client
command group pass; tools/provider/installer calls are substitutes. Syntax checks
pass. No real installs, Supabase operations, Shop/package/upgrade-engine changes,
browser suites, performance tests or broad regressions. Normal PR #6 branch push
and automatic Pages deployment are authorized; the PR remains Draft/Open.

## Assessment discovery and clearance placement — 28 October 2026

Stage 8 searches only `upgrade-assessment-*.json` in the configured private folder.
It rejects malformed/mismatched reports, validates the actual assessment/plan and
observation evidence, checks available collection/expiry timestamps, and compares
planned steps with the approved request when present. One valid report is selected;
multiple reports require a numbered choice after displaying nonsecret metadata.
Reports without a collection timestamp require the existing concept of explicit
customer freshness acknowledgment; file modification time is only a display aid.
The selected report is reread/validated before Notepad opens. No report is modified.
The customer assessment and server-approved plan have different evidence origins;
their whole-plan hashes are not falsely equated.

Stage 9 explains browser download locations and the distinction between assessment,
private clearance and original execution journal. Its approved-request-only block
accepts the actual downloaded full path, rejects directories/links, checks exact
request/Platform/project/client/binding/source/target and computes the clearance's
actual plan hash through the existing Shop `upgrade-contract.mjs` digest. It copies
without overwrite, preserving identical existing contents and the original download.
Stage 10 validates clearance before asking about the journal; missing-file recovery
only prepares the clearance and stops, requiring a separate explicit installation
invocation. Existing journal/request/plan and executor guards remain authoritative.

Local preparation checks loaded `customer_expires_at` and a file expiry if present.
The current emitted clearance has no expiry field, and its token has no read-only
status endpoint: the existing customer-claim changes state to running. Preparation
therefore performs no live claim or authorization check and explicitly leaves
current token authenticity/revocation/expiry to the unchanged CLI/server at explicit
installation. A misplaced file alone requires no new request, approval or journal.

Focused Windows PowerShell 5.1 fixtures cover single/multiple/mismatched assessment
discovery, clearance copy/reuse/missing/wrong request or fingerprint/conflict/directory,
and original-journal preservation; no actual executor/provider calls. An unavailable
Get-FileHash in the isolated session was replaced with built-in .NET SHA-256; its
affected check then passed. The view fixture's broad text assertion was narrowed
to the actual guide element after adding a download instruction outside that element.
Generated client commands, actual upgrade-view fixture
and changed-file syntax checks pass. No Shop/backend/release changes or hosted writes.

## Final M2 pre-merge dependency handoff — 28 October 2026

Owner reports all 7/7 live functional checks accepted on disposable Managed and BYO
Shops and both controlled support-v7 upgrades complete/recorded. This is owner
acceptance, not a new independent provider/source or performance certification.
Completed transaction presentation now labels the historical source → target and
uses contiguous read-only sections, separate from Release Compliance/current health.

Customer source links and guarded recovery use development or an explicitly reviewed
immutable revision; no private Platform checkout is required by customer preflight.
Historical reports/branch labels remain dated evidence; cross-repository audit links
use verified immutable merged snapshots. Both root AGENTS now require development-
based work and pre-merge branch-dependency hygiene without a permanent feature branch.

Paired CI remains pinned to compatible immutable peers: Platform checks Shop
`de98de2788e02601445e632e9337d52e8095d9c5`; Shop checks Platform
`932c63c0091f175a704954f0817572a07f2156fe`. These are CI snapshots, not package source
pins. PRs to development cover open feature work; pushes to development cover each
merge. Pins work while both PRs are open, after either merges, after both merge and
after feature retirement. CI private read access is not a customer prerequisite.

After separate push and merge approvals, merge Shop PR #3 first, then Platform PR #6,
using merge commits (not squash/rebase) so Shop backend source commit
`50b94931ecf743166136b2c562cbb6d2fbaebdc7` remains an ancestor for customer provenance.
Before Shop merges, development lacks M2 tooling: retain an already reviewed checkout
or explicitly reviewed immutable tooling revision; do not run recovery to switch or
reset feature checkouts. After both merges, validate the actual paired development
heads with the same gate. No peer pin/package/source SHA needs retargeting solely
because a branch tip changed. Do not delete any local/remote branches.

Owner authorization Gate 1 is approved for normal cleanup commits and pushes.
Keep both PRs Draft/Open, verify exact heads and normal CI/Pages outcomes, then
stop for separate merge authorization. Publication results are recorded in the
existing milestone final cleanup report. No SQL, Edge, package/catalog/selector, hosted record or
journal changes. Exact file list and focused outcomes are in the milestone's single
FINAL-CLEANUP-REPORT-2026-10-28.md; old timing evidence is preserved.