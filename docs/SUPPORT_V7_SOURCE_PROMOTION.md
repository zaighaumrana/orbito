# support-v7 source promotion — 27 October 2026

The owner authorizes coordinated source promotion on Platform PR #6 and Shop PR #3,
their existing feature branches, one push per branch and automatic Pages builds.
New commits deliberately omit the earlier skip marker and end in an empty build
trigger. Both PRs stay Draft/Open. Hosted Supabase deployment and Shop upgrades
are separate owner operations; nothing in this change executes them.

## Exact release

- support-v7: c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada
- Backend source: 50b94931ecf743166136b2c562cbb6d2fbaebdc7
- 39 migrations, seven unchanged function packages/JWT settings, nine requirements.
- Single fresh-approved release in Platform/Shop catalogs and Managed/BYO selectors.
- V6 stays supported, no longer fresh-approved, successor v7; v5 stays unsupported.
  Other historical support/compatibility decisions and all immutable artifacts stay
  unchanged. Successor metadata advertises the latest target; exact compatibility,
  authorization and provenance gates still decide actual upgrade eligibility.
- No auto-upgrade: original customer pins, jobs, plans, checkpoints and audit stay put.

Forward migration `20261027152811_promote_support_v7.sql` locks only the private
release catalog, checks exact historical/v7 fingerprints and support policy, then
registers/promotes v7 transactionally. Conflicting fingerprints or unexpected
fresh-approved releases stop rather than being silently replaced. Reapplying the
same policy is idempotent. The migration writes no customer records.

Shop's classifier now matches the PR6 Platform implementation exactly: independent
SQL/Edge drift, optional historical bounded-read capability, version-aware v7
requirements and evidence detail. It gains no provider credentials/admin access.
The ordinary parity gate remains unchanged. CI removes the obsolete candidate-only
invocation and pins committed paired source; it runs the normal approved gate.

## Focused validation

Approved workspace parity PASS (39/7/nine requirements); immutable canonical hash,
historical first-commit fingerprints, committed backend bytes, executable Managed/
BYO installation plans and full paired classifier/planner/executor parity PASS.
Fifteen upgrade/assessment/clearance tests, six selected release-selection tests and
five existing PR6 reporting/capability tests PASS. Changed supporting syntax/runtime
imports PASS. Seven PowerShell guide blocks parse; upgrade flags match actual parser.
Initial failures were stale pre-promotion fixture assumptions and a mock that jumped
two ledger entries after one write; fixtures now model exact per-migration read-back.
No production gate was weakened.

One isolated network-none/no-port PostgreSQL17 fixture passes catalog/source parity,
historical policy/pin/job/audit preservation, idempotency and conflicting-fingerprint
denial. Only its created container was removed. No hosted database was accessed.
No browser, benchmark, load test or full historical suite was run.

Evidence: M2 archive `evidence/20261027T153516Z-M2-support-v7-promotion` contains the
implementation report, changed files, concise test outcomes and exact publication
identities/provider results. This source approval does not establish independent
M2 audit, hosted acceptance or resolution of the unrelated Reports timeout.
F22's bounded owner-approved deferral and all live Support checks remain unchanged.

## Manual owner deployment — not executed

Use the final reviewed Platform checkout. First inspect the exact project and
migration history. The two PR6 forward migrations relative to development are:

1. `20261026220335_backend_release_reporting_verification.sql` (if still unapplied).
2. `20261027152811_promote_support_v7.sql` (new release policy).

These commands are for the owner after checking the expected migration list.
The current native CLI accepts explicit `--project-ref`; `--skip-vault` prevents
unrelated config Vault synchronization. Stop if dry-run lists unexpected changes.

```powershell
Set-Location 'C:\Users\ranaz\Desktop\Development\orbito'
supabase migration list --project-ref ukbhyerxshteyetwomqy
supabase db push --project-ref ukbhyerxshteyetwomqy --dry-run --skip-vault
# Only after confirming the exact target and pending migrations:
supabase db push --project-ref ukbhyerxshteyetwomqy --skip-vault
supabase functions deploy platform-provision --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
supabase functions deploy platform-upgrade --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
supabase functions deploy platform-backend-inventory --project-ref ukbhyerxshteyetwomqy --use-api
```

The three functions consume the release registry/catalog directly or transitively.
Provision/upgrade keep their configured disabled JWT gateway with existing internal
authorization; inventory keeps its enabled gateway. No new secrets or config changes
are required. Do not deploy all Platform functions or any Shop functions manually
for this promotion. After hosted activation, authorize each exact Managed/BYO Shop
upgrade through its existing controlled procedure. Verified v6→v7 plans contain one
SQL step (20261025233743), zero changed Edge packages; unexpected steps require review.
See Shop `docs/CONTROLLED_BACKEND_UPGRADES.md` for the customer sequence/recovery.

Full Managed installed-release verification remains pending where provider source
files are omitted or a complete canonical SQL/security baseline is unavailable.
The [PR6 reporting correction](PR6_RELEASE_REPORTING_FIX.md) explains these precise
limits. Source promotion neither manufactures missing verification nor changes BYO's
customer-reported trust. Automatic Pages frontend builds do not activate Supabase v7.
