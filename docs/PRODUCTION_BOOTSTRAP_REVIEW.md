# Production bootstrap implementation report

2026-10-09, Asia/Karachi. Local implementation only; awaiting owner review.

## Git and scope

Development was clean/current at `a43db6a2b5fc51f8f9039f156c6edcd6dbfeb519`.
Local and remote development/deployment heads matched; deployment ancestry was
verified. Created `feature/production-bootstrap-hardening` from development.
HEAD remains `a43db6a`; changes are uncommitted. No push, PR, merge, deployment,
hosted Supabase connection/link, Shop change or legal/publication change occurred.
All eleven historical migrations and the committed managed Shop artifact are
unchanged. The earlier pasted bugs were already integrated and were not redone.

## All source files created or edited

Paths are relative to `C:\Users\ranaz\Desktop\Development\orbito`.

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261008191709_production_bootstrap_hardening.sql` | New forward migration: private verified UUID authority, staging approval/cutover, audited postgres-only initialization/rebinding, password restrictions |
| `supabase/bootstrap/preflight.sql` | New PG17/roles/Auth/crypto/Vault/publication checks |
| `supabase/bootstrap/fresh-preflight.sql` | New emptiness/history/collision checks and rollback-only event-trigger permission probe |
| `supabase/bootstrap/approve-staging-master.sql` | New audited approval of independently verified existing master UUID |
| `supabase/bootstrap/validate.sql` | New post-bootstrap binding/config/ACL/email-policy checks and database identity proof |
| `tests/production-bootstrap.test.mjs` | New task-container-only actual PG17 fresh/upgrade/security/concurrency/regression driver |
| `tests/production-bootstrap-cli.test.mjs` | New self-owned local PG17 actual CLI history-rejection/interruption/retry harness, pipeline-flush control and six-group rerun |
| `tests/local-bootstrap.sql` | Synthetic Auth fixture verification/disabled-account fields; explicitly remains a stub |
| `tests/control-plane.sql` | Confirmed fixture and real UUID binding |
| `tests/currencies-boundaries.sql` | Explicit confirmed Auth columns and binding |
| `tests/manual-owner-activation.sql` | Confirmed fixture and binding before provisioning assertions |
| `tests/onboarding-v2.sql` | Confirmed fixture and binding before onboarding assertions |
| `tests/onboarding-stabilization.sql` | Confirmed identities/binding before actual role/RLS checks |
| `tests/platform-overhaul.sql` | Explicit binding instead of placeholder-email assumption |
| `tests/platform-master-upgrade-before.sql` | Confirmed existing synthetic master before snapshot |
| `tests/platform-master-upgrade.sql` | Assert preserved Auth/alias/master UUID, allowing intentional authority-function replacement |
| `tests/run-onboarding-local.mjs` | Legacy harness prepares fixture approval before new migration; syntax checked, cross-repository execution excluded |
| `tests/support-access.sql` | Remove operator_role override; actual confirmed binding/manager row |
| `tests/support-handoff.sql` | Remove operator_role override; actual confirmed binding/manager row |
| `docs/PRODUCTION_BOOTSTRAP.md` | Complete production/staging/recovery runbook |
| `docs/PRODUCTION_BOOTSTRAP_REVIEW.md` | This review report |
| `ENGINEERING_HISTORY.md` | Dated security/migration entry |

The downloaded CLI and temporary CLI test configuration/copies are under ignored
`node_modules/.bootstrap-tools`, outside release source. Deliberate failure
injection altered only temporary copies. Dedicated Docker resources belong to
this task; existing Docker workloads were not modified.
Normal completed runs remove their label-verified containers, networks and owned
temporary workspaces. One tool-interrupted runner left a fixture; its exact
labels and lack of live test processes were verified before removal. Docker
Desktop and existing workloads remain available.

This continuation changes seven of the 22 source files listed above: the draft
migration, validate.sql, both production-bootstrap test drivers, both production
bootstrap documents and ENGINEERING_HISTORY.md. The other fifteen prior changes
are preserved byte-for-byte against the task-start fingerprints.

## Authority and staging continuity

Only migration **20261008191709** is new (CLI-generated UTC version; local date
October 9). It compares the requesting Auth UUID with one private binding. Caller
and bound administrator must remain confirmed, non-anonymous, enabled and not
deleted; config id=1 and binding must exist. Email, alias, browser metadata and
platform_users cannot assign master. Active manager/billing roles retain their
existing scopes after binding. Disabling the bound administrator closes ordinary
operator access until trusted recovery.

Only trusted postgres executes the SECURITY INVOKER initializer/binder. API roles,
including service_role, have no bootstrap execution or binding/approval table
privileges. Same-target retries do not duplicate audit. Rebinding requires the
exact current UUID, increments revision and audits previous/new UUID, database
role and reason. Advisory locking serializes configuration/binding; a foreign
key restricts deletion of the bound Auth account. No browser assignment or new
secret is introduced. Private identity is not a public API schema.

Checked-in RLS/RPCs use canonical authority. The four audited Edge functions
verify Auth and use canonical role checks on user paths; support checks the
matching master UUID again; existing scheduler/source-credential paths retain
their restricted server responsibilities. Existing broad trusted service-role
operational permissions were not redesigned.

Staging requires trusted approval of its independently verified current master
UUID before applying the migration. Approval and migration both verify the old
authority recognizes that confirmed enabled Auth user. Independent operator
identity review remains mandatory even if old authority uses historical email
logic. Cutover binds that same UUID and consumes approval in one transaction.
No real administrator UUID was guessed/retrieved, and no Auth user is replaced.
Auth/customer/alias/history remain; unused plaintext config password is
intentionally cleared and constrained to NULL. Fresh installs stay unbound and
unconfigured until the operator creates/verifies Auth and initializes/binds.

## Validation outcomes

### Corrected migration/history atomicity

Removed only the new draft migration's top-level BEGIN/COMMIT. Reviewed the exact
native TypeScript execution path in CLI 2.120.0: default transactional files
without authored transaction controls are sent as one extended-protocol batch
with the CLI's own parameterized history INSERT and one final Sync. The previous
explicit controls selected sequential execution and committed SQL before that
INSERT. No history records are inserted or repaired by the harness/operator.

The exact new file has no transaction=false directive, concurrent index/reindex,
VACUUM, ALTER SYSTEM, CLUSTER, role-reset boundary or autonomous external commit.
Its DDL, ACL, data and DO/function work stays in the unflushed batch. The regression
also inspects the statements parsed by the actual CLI inside the history trigger.
Historical files remain immutable; their explicit commits and file-by-file
execution still mean the complete chain is not globally atomic.

The reproducible harness rejects arbitrary targets and creates a uniquely labeled
loopback-only PG17 fixture. For fresh and approved staging databases, its BEFORE
INSERT trigger first proves the complete new SQL, grant restrictions, and staging
binding/password scrub/approval consumption executed inside the pending transaction,
then deliberately rejects the genuine CLI history INSERT. The command fails;
public/private schema and ACL plus config/Auth/audit/history snapshots are
unchanged, new objects are absent and the version remains absent. Staging's
previously committed approval and old authority path remain valid. Removing
the fault permits a clean CLI retry, exactly one genuine new history row, twelve
total versions and a no-op second retry. Fixtures use fictional UUIDs only.

Both scenarios also terminate the actual CLI backend while it waits inside the
post-SQL history INSERT; the same rollback and retry assertions pass. A temporary
VACUUM copy deliberately forces the CLI to flush: earlier schema survives failed
history insertion, proving why such statements are forbidden in the real file.
The temporary copy and fixture are destroyed; no repository migration is changed
by injection. Catalog/data snapshots exclude sequence counters and server logs;
audit identity sequences can have gaps after rollback.

| Check | Result | Evidence/limit |
| --- | --- | --- |
| Fresh full chain | PASS | All twelve original SQL files on real PG17/crypto/Vault, empty records, fail closed, then verified UUID initialization |
| Staging-style upgrade | PASS | Eleven-file baseline plus existing synthetic UUID authority; approval required, Auth/client/alias snapshot preserved, same UUID after email change |
| Takeover/privileges/retries | PASS | Placeholder email, forged master row, ordinary/unauthenticated privileged RPCs, missing config, unconfirmed/anonymous/banned users, API assignment/reassignment, retries/conflicting rebinding |
| Concurrent binding | PASS | Two actual overlapping DB sessions; one winner and one immutable binding audit |
| Missing prerequisites | PASS | Missing real extensions/publication/Auth column/role or wrong service privilege and trigger collision reject |
| Existing Platform SQL | PASS | Onboarding, manual activation, stabilization/RLS, control plane/currency, lifecycle/recovery, support issue/consume/replay through actual binding |
| Actual CLI fresh/history | PASS | CLI 2.120.0, separate loopback-only PG17 database, twelve genuine applied versions, no seed/role imports |
| Actual CLI staging/history | PASS | Unapproved failure preserves eleven versions/old authority; approved cutover applies new version; validation/no-op retry pass |
| Actual CLI rollback/recovery | PASS | Injected temporary baseline failure rolls back objects/history; corrected copies complete all twelve genuine history rows |
| New-version history INSERT failure | PASS | Actual pinned CLI; fresh and approved staging complete SQL then reject history, full catalog/data rollback, approval/old authority intact, clean genuine retry |
| New-version connection interruption | PASS | Actual CLI backend terminated during post-SQL history INSERT in both scenarios; rollback and exactly-one-history retry |
| Pipeline-flush negative control | PASS | Temporary VACUUM copy demonstrably commits earlier SQL before rejected history; actual migration has no flush statement |
| Expanded DB privilege/security denials | PASS | Actual ACL/ownership corruption, soft-deleted callers/master, disabled master and managers, bound Auth deletion FK, API bootstrap/TRUNCATE, old support grant after rebind |
| Existing frontend/Edge regressions | PASS | 49 identity/support/scheduler checks; mocked Auth/Management boundaries, not hosted proof |
| Syntax/diff/immutable checks | PASS | Legacy harness syntax, whitespace, unchanged historical migrations and Shop artifact |
| Hosted Auth/Management/CAPTCHA/functions/scheduler/browser | SKIP | Explicit no-hosted scope; pending separately authorized validation |
| Whole cross-repository harness/frontend build | SKIP | Shop workflow outside task; no frontend production-source change; relevant Platform SQL executed independently |
| Commit-ack loss/provider failover/power loss/pooler | SKIP | Not reproduced locally; a lost acknowledgment after final Sync may report failure although both SQL and history committed |

Six database groups passed with no unresolved FAIL or SKIP; affected groups were
rerun after fixture edits. All 49 existing selected regressions passed with zero
FAIL/SKIP. Initial setup errors (network/readiness/ownership/extension restoration)
were corrected before these results. An added test incorrectly assumed a forged
master row could be inserted; the existing role constraint rejected it. Corrected
the test to expect denial and reran successfully. Expected injected SQL errors
are negative-test success, not hidden operational failures.

The five focused CLI scenarios and all six expanded database groups passed.
Initial harness failures were corrected: Auth history is 82 total (seven image
baseline versions plus 75 GoTrue additions), bridge TCP readiness must wait for
the final server, and a nested Node runner must clear inherited NODE_TEST_ context
to produce and verify its own six-group TAP report. The earlier combined run had
five PASS and one harness-report FAIL; the corrected six-group rerun passed with
six PASS, zero FAIL and zero SKIP. These setup/report failures are not omitted
from the evidence. A final combined run of the corrected checked-in CLI harness
also passed all six top-level tests (five CLI scenarios plus the six-group child
suite), zero FAIL/SKIP; the child report independently records six PASS, zero
FAIL/SKIP. Its captured local log is
`node_modules/.bootstrap-tools/final-hardening/final-cli-regression.log` (ignored
test evidence, not release source). Expected injected database errors are passing
negative cases.

Engine: `public.ecr.aws/supabase/postgres:17.6.1.155` (server 17.6), pgcrypto 1.3,
Vault 0.3.1 and 82 genuine GoTrue v2.197.0 Auth history versions. Infrastructure
schema-only copies and fictional UUIDs exercise actual SQL role/RLS/Vault paths.
SQL claim setup is not an Auth HTTP login. No hosted encryption/provider
attestation, genuine JWT/CAPTCHA or Management request is implied. Missing local
dependencies fail the opt-in driver. Docker works; no local dependency blocker
remains for the completed checks.

## Remaining blockers and security limits

The UI references `create-platform-user`, `update-platform-user`, and
`delete-platform-user`. No authoritative handlers exist in the checked-in function
tree/configuration, available Git file history, or the inspected local Platform
handoff/schema sources. Their actual deployed existence/authorization is unknown;
no hosted request was made and no handler was invented. This is a server release
gate, not merely a hidden-control requirement. Before production, a separately
authorized trusted operator must inventory the exact target's functions and any
proxy/alias routes and prove these endpoints absent or provider-disabled for all
paths/credentials. Frontend hiding, CORS, anonymous 401 or malformed-request 400
does not prove that. Unknown deployed handlers stop release; obtain authoritative
source and test it or explicitly remove/block those exact endpoints. Repeat the
inventory after the four-function allowlisted deployment. The runbook defines
the verification and future server authorization criteria.

Intended production Auth UUID selection, actual target org/region/emptiness/history,
provider event-trigger permissions/ownership, production PG/extensions, secure
secrets/Auth settings and hosted smoke remain release gates. Provider-owned
collision correction may require provider assistance; preflight refuses unsafe
substitutes. No administrator UUID is embedded in production code.

The immutable baseline temporarily has permissive policies and a weak schema
default. Mandatory API/signup/frontend quarantine prevents exposure before the
final password-free UUID-authorized state. The complete chain is not globally
atomic; historical explicit file COMMIT can precede CLI history recording. The new
file's SQL/history commit together under the verified unflushed CLI batch.
Ambiguous acknowledgment outcomes require inspecting genuine history and schema,
never fabricated history. Provider failover/power loss/pooler behavior and other
CLI versions are unproven locally. Audit resists
API mutations; trusted DB-owner/provider authority still requires operational
governance. No down migration restores email/password authorization.

## Exact safe subsequent sequence

After review and explicit deployment authorization, follow the commands in
[the complete runbook](PRODUCTION_BOOTSTRAP.md). These steps were not executed
against either hosted project:

1. Integrate through the approved development/deployment release process; main
   stays frozen. Resolve team-handler source or prove its server endpoints absent
   or explicitly disabled before production bootstrap/exposure.
2. Verify production `mincersddxuaqojczcih`, org `jcjsfijdfiunbfnkawpo`, region
   `ap-southeast-1`; quarantine API/signup/frontend.
3. Prepare reviewed provider prerequisites; run general/fresh preflights as
   postgres. Stop on ownership/collision/drift/permission failures.
4. With reviewed CLI 2.120.0 and explicit verified DB URL, run migration list,
   `db push --dry-run --skip-vault`, then approved `db push --skip-vault`.
   Confirm twelve genuine versions; no reset/seeds/role import/history repair.
5. Create and verify intended Auth administrator; record actual UUID. Run
   initialize_config and bind_master together with reviewed alias/reason as postgres.
6. Run validate.sql and empty-record counts; securely configure exact server/Vault
   secret names, Auth/CAPTCHA/SMTP and narrow redirect URLs from the runbook.
7. Separately deploy exactly four Platform functions to the production ref.
   Enable pg_cron/pg_net, verify credentials/functions, install the existing named
   scheduler. Do not deploy/repackage Shop.
8. Enable API, deploy approved public frontend configuration, perform real
   Auth/role/support/provisioning smoke on approved disposable targets. Preserve
   unpublished/legal status and record hosted outcomes separately.
9. Upgrade staging separately: snapshot/counts, current real UUID review, general
   preflight, audited approval script, dry-run only new version, apply/validate and
   verify original session/UUID and retained data.

Stop for owner review. No commit, remote Git mutation or hosted deployment yet.

## 2026-10-09 — Current Git checkpoint, preview and P2 follow-up

The local-only Git statements above describe the historical implementation
checkpoint. The owner subsequently authorized a reviewed Git checkpoint:

- Commit `ba1b770e5ef79b07c4202eaa4c7a56dc0a2b354d`, message
  `fix(platform): harden production bootstrap and migration atomicity`.
- Exactly **22 intended files were committed and pushed** on
  `feature/production-bootstrap-hardening`; the inventory above is unchanged.
- [Draft PR #1](https://github.com/zaighaumrana/orbito/pull/1) targets `development`;
  it has not been merged. `development` and `deployment` remain at `a43db6a`;
  frozen `main` remains at `5df274a`. Protected remote heads were rechecked during
  this follow-up and remain unchanged.
- Cloudflare reported a **successful automatic frontend preview deployment**
  after the feature push (owner-provided result; not independently revalidated
  against Cloudflare here). A frontend preview does **not** prove database
  migration, Edge Function deployment, production deployment or hosted test
  success. No such backend/production outcome is claimed.

**Preview isolation is not verified.** `src/supabase.js` creates the normal app
client from build-time `VITE_PLATFORM_URL` and `VITE_PLATFORM_ANON`; a preview
hostname/feature branch does not force a separate database or a read-only app.
The deployment's preview environment/access settings and built public target
were not inspected, and the preview was not opened. Before another authorized
push or preview use, establish that the preview has an approved isolated backend
or an inert backend configuration and suitable access restrictions. Do not use
the preview to probe either protected hosted project. No Cloudflare settings
were changed by this follow-up.

Source review reported no P0/P1 defects and two P2 findings. The local follow-up
changes only `tests/run-onboarding-local.mjs`, this report and
`ENGINEERING_HISTORY.md`:

- The disposable SQL-only runner wraps migrations lacking top-level transaction
  boundaries in one explicit BEGIN/COMMIT; authored boundaries are preserved.
  Comments, literals and dollar-quoted function/DO bodies are excluded from
  boundary detection. All fresh/upgrade migration call sites use the same helper.
- `--platform-only` runs the affected Platform paths without reading Shop sources.
  A temporary copy of the new migration fails with division by zero after its
  SQL and before the runner's COMMIT. Configuration/approval/audit, authority and
  function/table ACLs, defaults and constraints remain unchanged; new binding
  objects are absent. Clean retry preserves the existing synthetic master UUID.
- All historical SQL, the new production migration, Shop release artifact and
  dedicated actual CLI migration-history harness remain unchanged. The runner
  does not insert history and is not a substitute for the earlier CLI proof.

| Follow-up validation | Result | Evidence/limit |
| --- | --- | --- |
| Affected SQL runner: fresh Platform full chain and existing focused SQL fixtures | PASS | Actual disposable loopback PostgreSQL 17.6; synthetic Auth/Vault contracts |
| Late SQL-only migration failure and clean upgrade retry | PASS | Real psql stdin, catalog/row/ACL assertions and retained approval/authority |
| Existing focused identity/support/scheduler regressions | PASS | 49 PASS, zero FAIL/SKIP; existing Auth/Management mocks |
| Runner syntax, whitespace and immutable migration/artifact/harness checks | PASS | No migration or CLI driver edits |
| Shop execution | SKIP | Explicit no-Shop boundary; Platform-only mode |
| Hosted backend/preview isolation and hosted smoke | SKIP | Outside authorization; not inferred from preview success |

Reproduce the affected runner from this checkout against a dedicated disposable
local PostgreSQL 17 server with the existing required roles and local connection
credentials, never a hosted URL:

```powershell
node tests/run-onboarding-local.mjs <local-loopback-port> --platform-only
node --test tests/platform-identity-consistency.test.mjs tests/support-access.test.mjs tests/support-handoff.test.mjs tests/provision-scheduler.test.mjs
node --check tests/run-onboarding-local.mjs
git diff --check
```

Missing dependencies are failures/blockers, not passes. The local test container
was task-owned and removed after validation; no existing Docker workload was
changed. Sequence counters can retain gaps after rollback, as documented above.
This P2 follow-up remains **uncommitted and unpushed** pending owner approval;
no new preview was triggered and no hosted project, Auth, secrets, Cloudflare
configuration, Shop source or legal/publication state was modified.

### 2026-10-09 — Owner-confirmed preview controls and checkpoint authorization

The owner has confirmed that Cloudflare preview access is restricted to
authorized users and that `feature/production-bootstrap-hardening` is excluded
from automatic preview deployment. This supersedes the earlier pending access/
branch-control verification for the authorized Git follow-up. The owner has
authorized committing the three reviewed P2 files and pushing only this feature
branch to update draft PR #1; no merge or hosted deployment is authorized.

These confirmed controls do **not** establish preview/production backend
isolation. Matching variable names do not establish matching or isolated target
values; no Cloudflare environment settings, built target or hosted backend were
inspected or changed here. Previously reported preview success remains frontend
evidence only. The follow-up reuses the completed local validation above;
checkpoint checks cover the staged diff, whitespace, sensitive values, immutable
files, PR base/draft/head and protected remote branches. Report any visible
Cloudflare check/deployment on the new commit separately, without treating an
empty GitHub result as proof of provider inactivity.
