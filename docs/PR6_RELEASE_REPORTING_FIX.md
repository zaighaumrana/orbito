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
