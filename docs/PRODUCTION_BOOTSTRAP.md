# RetraSell Platform production bootstrap

Prepared 2026-10-09 (Asia/Karachi). This is a reviewed-operator procedure, not
permission to deploy. This task changed local source only. Do not execute the
hosted steps until the owner approves the implementation and the exact target.

## Target and release gates

| Environment | Project reference | Use |
| --- | --- | --- |
| New production Platform | `mincersddxuaqojczcih` | Fresh procedure only after verifying emptiness |
| Existing staging Platform | `ukbhyerxshteyetwomqy` | Separate approved upgrade procedure |

Production must belong to organization `jcjsfijdfiunbfnkawpo`, region
`ap-southeast-1`. Verify these independently in the Dashboard and verify that
the database connection belongs to that project. A database name of `postgres`
does not establish project identity. Never target a Shop project.

Integration is `development`; production release is `deployment` at `a43db6a`
at task start. `main` is frozen. Review this feature branch before any release
integration; no remote Git operation is part of bootstrap. Do not import a
staging dump, users, customers, billing, runtime credentials or audit records.
Do not rebuild or replace the committed managed Shop release artifact.
Keep the existing unpublished/legal gate unchanged.

Keep the production frontend offline, disable the Data API, and disable public
and anonymous Auth signup throughout the migration chain. The immutable baseline
temporarily creates permissive historical policies/defaults; later files replace
them. Do not expose an installation that stopped partway through this chain.
Do not create the first Auth administrator until the full chain has completed.

**Source completeness gate:** the UI calls `create-platform-user`,
`update-platform-user`, and `delete-platform-user`, but their implementation is
absent from this repository and its function configuration. Obtain and review
their authoritative source, require verified Auth UUID/canonical master checks,
and test it before enabling team-account administration. Production may proceed
with that feature unavailable only after the server endpoint gate below is
proved and the owner approves that scope. Do not copy an unknown hosted handler or infer its safety
from the four checked-in functions. Hosted source was not inspected by this task.
Before any production bootstrap or Auth administrator creation, satisfy the
server endpoint gate below; disabled frontend controls are insufficient.

## Missing team endpoints: server release gate

Local searches found only the three UI invocations in `src/forms.js` and
`src/events.js`: no handlers in the function tree, no function configuration,
no matching file history across locally available Git refs, and no implementation
in available local Platform schema/handoff sources. Shop and other release
checkouts were excluded. Only four checked-in files call Deno.serve. This local
finding does **not** prove any hosted endpoint is absent.

After separate approval for hosted inventory, a trusted operator must:

1. Verify the exact production project/org and inventory its deployed functions
   with the Dashboard or reviewed CLI `functions list --project-ref
   mincersddxuaqojczcih`. Record slugs/versions and the approved four-function
   allowlist; inspect any deployment integration, gateway or custom-route alias
   that could install or route to team handlers. No inventory occurred here.
2. Prove `create-platform-user`, `update-platform-user`, `delete-platform-user`
   and all equivalent aliases are absent, or blocked by a verified server-side
   rule **before handler execution**. A frontend flag, missing local config,
   CORS, ordinary JWT gateway verification, an anonymous 401, or malformed-body
   400 does not establish that a privileged endpoint is disabled.
3. If an unreviewed implementation exists, stop release. Obtain authoritative
   source for review, or get separate explicit authorization to remove those
   exact functions using provider administration / `functions delete <name>
   --project-ref mincersddxuaqojczcih` one name at a time. Do not use --prune or
   delete any other function. This task authorizes no hosted deletion/disablement.
4. Re-inventory after approved removal/disablement and again after deploying the
   four named functions. For absence, corroborate provider routing's missing-
   function response on the direct Supabase `/functions/v1/<slug>` routes. For
   disablement, corroborate that the provider rule rejects requests before
   invocation, including valid master/operator/service credentials, through
   **every direct and custom route**. A frontend-only proxy block is insufficient.
   Perform only non-mutating routing probes after the provider state is proven;
   do not POST speculative payloads to an unknown live Auth-admin handler.
5. Retain sanitized inventory/rule/routing evidence in the release record. Never
   log bearer tokens. Keep these server endpoints absent/disabled until reviewed
   implementations and negative Auth-boundary tests are available. Production
   release remains blocked until server state is proved; team management remains
   unavailable even if an approved deployment proceeds with those endpoints absent.

Before restoring the feature, each handler must verify the requesting Auth user
and matching canonical master UUID, deny unauthenticated/ordinary operators,
resolve the target Auth UUID from the server's platform_users record, allow only
ordinary manager/billing roles, and refuse reset/delete/soft-delete/reassignment
of the bound administrator. Browser-supplied Auth IDs or metadata cannot be
authority. Audit/idempotency and actual Auth-side negative checks are required:
private UUID binding alone cannot prevent an unsafe Auth-admin endpoint from
resetting that account's credentials. No unknown handler was copied or invented.

## Prerequisites and controlled baseline preparation

Use a trusted `postgres` database session, an approved backup/recovery plan,
PostgreSQL 17+, `psql`, and the reviewed Supabase CLI. CLI **2.120.0** was used
for the local migration/history validation. Revalidate transaction behavior
before changing the deployment CLI version. Use a direct database connection or
session pooler, not a transaction pooler. Require TLS and the appropriate CA
verification for the hosted connection. Keep the connection credential in the
operator's approved secret manager/session, never a repository file or transcript.
In the examples, `PLATFORM_DB_URL` is that verified connection, not a literal
credential to paste into history. `psql -X` avoids operator startup scripts.
Do not use CLI debug output or log decrypted Vault/API keys.

Run the read-only prerequisite check:

```powershell
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -f supabase/bootstrap/preflight.sql
```

It checks PostgreSQL version (the baseline uses PG17 `MAINTAIN`), existing roles
`postgres`, `anon`, `authenticated`, `service_role`, service-role BYPASSRLS, no
API-role membership in `postgres`, actual Auth tables/functions/verification
columns, pgcrypto in `extensions`, real Vault signatures, and the explicit-table
`supabase_realtime` publication owned by `postgres`.

Do not fabricate Supabase roles or bypass RLS to make this pass. A missing or
outdated Auth schema requires the provider's real Auth migrations, not manually
created `auth.users` or test stubs. If the provider lacks the required extension
packages, publication ownership or event-trigger privileges, stop and use the
provider's supported setup/support path.

On a verified empty project only, an approved operator may prepare missing
extension/publication infrastructure before rerunning preflight:

```sql
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;
-- Only if this publication is absent; never replace an existing publication:
create publication supabase_realtime;
```

Do not run the publication statement if it already exists. `IF NOT EXISTS` on
an extension does not relocate one installed in another schema; preflight must
still pass. An incorrectly located extension or differently owned publication
needs a reviewed provider-specific correction, not DROP CASCADE.

Then run the fresh-only check:

```powershell
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -f supabase/bootstrap/fresh-preflight.sql
```

It refuses public application relations, `platform_private`, applied migration
history or any Auth users. It also detects collisions with event trigger
`ensure_rls` or function `public.rls_auto_enable()`, and exercises actual
event-trigger creation inside a rolled-back transaction. A partially initialized
project belongs in the recovery procedure, not the empty-project procedure.

For a collision, inspect the existing objects without executing their code:

```sql
select evtname, evtowner::regrole, evtenabled, evtfoid::regprocedure
from pg_event_trigger where evtname='ensure_rls';
select pg_get_functiondef(to_regprocedure('public.rls_auto_enable()'));
```

The baseline does not use CREATE OR REPLACE for these objects. If inspection
proves an existing provider RLS-enabling trigger/function is compatible, obtain
explicit approval to preserve it under unused names, as its actual owner:

```sql
begin;
alter event trigger ensure_rls rename to platform_prebootstrap_ensure_rls;
alter function public.rls_auto_enable() rename to platform_prebootstrap_rls_auto_enable;
commit;
```

Apply only the statements for objects actually present; check the new names
are unused first. Renaming preserves the original function OID/trigger linkage
and its behavior. Do not disable/drop an unknown security trigger. If ownership
prevents a supported rename, stop for provider assistance. Rerun both preflights;
retain the inspected definitions and approved change in the operator record.

## Full migration order and transactions

Apply exactly the repository files, in ascending version order:

| Version | Responsibility |
| --- | --- |
| 20260925153201 | Remote baseline, PG17 grants, RLS trigger, Realtime membership |
| 20260925191052 | Control plane, operator policies, audit, billing/configuration RPCs |
| 20260926234425 | Vault-backed provisioning and protected credentials/jobs |
| 20260928062701 | Separate bridge call credential |
| 20260929090000 | V2 onboarding and entitlements |
| 20261001090000 | Manual owner activation |
| 20261001100000 | V2 client browser column grants |
| 20261001120000 | Identity RPC and onboarding stabilization |
| 20261003120000 | Lifecycle, recovery and managed provisioning gates |
| 20261003174809 | Managed support-access preparation |
| 20261003230535 | One-time support session handoff |
| **20261008191709** | Verified UUID binding, staging approval cutover, password-free configuration |

Historical files are immutable. The first, second and seventh files have no
explicit BEGIN/COMMIT; running them through statement-by-statement autocommit
is unsafe (`SET LOCAL` in the baseline also needs a transaction). Eight historical
files own explicit transactions; CLI 2.120.0 executes those statements sequentially
and records history after their authored COMMIT. That historical commit/history
gap remains: a failure there requires inspection, never fabricated history.

The **new draft migration 20261008191709 has no explicit BEGIN/COMMIT**. The
actual native CLI v2.120.0 `migration-apply.ts` appends its history INSERT to one
extended-protocol batch with one final Sync. Its exact SQL has no transaction=false
directive, top-level transaction control, role-reset statements, or pipeline-
incompatible statement: CREATE/DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY,
VACUUM, ALTER SYSTEM or CLUSTER. Its DO/functions perform transactional DB work;
they do not commit, call external services or use autonomous transactions.
Therefore its schema/grants/configuration/binding/approval consumption/audit rows
and **genuine CLI history entry** commit or roll back together. Do not run this
file alone via `psql -f` autocommit: use the pinned CLI, or an enclosing transaction
for disposable SQL-only tests (which are not history validation).

Actual CLI regressions reject the final history INSERT after checking all new
SQL effects are visible inside that transaction; both fresh and approved staging
restore prior schema/grants/data, leave version absent, preserve staging approval/
legacy authority, and retry to exactly one genuine history row. Terminating the
CLI backend at a paused post-SQL history INSERT also rolls back both scenarios.
A deliberately unsafe **temporary copy** adding VACUUM proves a batch flush can
commit preceding SQL without history; the statement guard rejects it. That copy
is never release source. No historical file was changed.

The **whole chain is not a single transaction**: earlier completed files remain
committed on later failure. A connection lost after final Sync commits but before
the acknowledgement may leave **both** the new SQL and history committed despite
a command error; inspect history/binding before retry. Post-commit lost responses,
provider failover/power loss, hosted session-pooler behavior and different CLI
versions were not locally simulated. Audit identity sequence values can have gaps
on rollback; PostgreSQL nextval and server logs are not rolled-back row/catalog
state. The regression snapshots intentionally exclude sequence counters/logs.
Never reseed audit IDs or invent history to remove those gaps.

From the reviewed Platform checkout, inspect history and the exact dry-run list:

```powershell
supabase migration list --db-url "$env:PLATFORM_DB_URL"
supabase db push --db-url "$env:PLATFORM_DB_URL" --dry-run --skip-vault
# Only after confirming the target, empty history and all twelve files:
supabase db push --db-url "$env:PLATFORM_DB_URL" --skip-vault
supabase migration list --db-url "$env:PLATFORM_DB_URL"
```

Use an explicit connection, without `supabase link`. Do not use reset, seed,
include-seed, include-roles, include-all, migration repair, or a schema-only import
as an alternative migration history. `--skip-vault` avoids automatic CLI secret
synchronization; the actual Vault extension remains required. Check twelve
genuine applied versions, zero customers/operational records and empty config/
binding after a fresh chain. Historical defaults existed only as schema defaults:
no password/config row is inserted, and the final file removes the password
default, clears an existing legacy password, and prohibits any future non-NULL
value. No default password is ever used for Auth.

## First Auth administrator, configuration and UUID binding

In the verified production project's Auth administration, create the intended
human administrator with a strong unique Auth password through the trusted
provider flow. Verify the intended person/account outside SQL. Confirm their
email through the approved verification flow; the account must be non-anonymous,
not deleted and not currently banned. Do not create a historical placeholder
email account. Copy the **actual** Auth UUID from the verified account; this
runbook and migration intentionally supply no production administrator UUID.

Cross-check that UUID as `postgres`, without selecting password hashes:

```sql
select id,email,email_confirmed_at,is_anonymous,deleted_at,banned_until
from auth.users where id = :'master_uuid'::uuid;
```

Pass `master_uuid` to `psql -v` from the reviewed operator record. Initialize
and bind in one trusted transaction, using psql's quoted variables:

```sql
begin;
select platform_private.initialize_config(:'display_alias', :'reason');
select platform_private.bind_master(:'master_uuid'::uuid, null, :'reason');
commit;
```

`display_alias` is 1–160 trimmed characters; `reason` is 10–500 and should identify
the responsible operator and approved change ticket. Neither is a
password or an authorizing identity. Save these statements as an approved
operator script outside source if needed, and execute with `psql -X -v
ON_ERROR_STOP=1` and the variables, never string interpolation. Repeating the
same alias and bound UUID is a no-op with no duplicated bootstrap audit. A
conflicting alias or binding rejects the attempt.

`platform_private.master_identity` stores one verified Auth UUID. Only trusted
`postgres` can execute the SECURITY INVOKER initializer/binder; PUBLIC, anon,
authenticated and service_role receive no binding/approval table privileges or
bootstrap function execution. The private schema is not an exposed API schema.
Browser-editable `admin_username`, Auth email/metadata and a `platform_users`
master-role row cannot assign master authority. All role checks fail closed
until config and a valid binding exist; disabling the bound administrator also
closes ordinary operator access until trusted recovery.

For an explicitly approved future replacement, verify the new Auth UUID and
use the current UUID as a compare-and-swap precondition:

```sql
begin;
select platform_private.bind_master(:'new_uuid'::uuid, :'current_uuid'::uuid, :'reason');
commit;
```

This increments the revision and audits previous/new UUID, operator role and
reason. A stale/missing prior UUID fails. Retrying an already successful target
does not duplicate the audit. Rebind before deleting the old Auth account:
the foreign key prevents deletion of the currently bound account. No API token,
including service_role, substitutes for this trusted database procedure.

## Secrets, functions, scheduler and Auth settings

Set secrets only on the verified production Platform, after approval, through
the provider's secure secret administration. Never copy secret values into Vite,
logs, commits, this runbook or CLI debug output.

| Name | Location/purpose |
| --- | --- |
| `SUPABASE_URL` | Provider-supplied Edge runtime, exact production Platform URL |
| `SUPABASE_ANON_KEY` | Provider-supplied Edge runtime public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Provider-supplied Edge runtime privileged DB client |
| `PLATFORM_MANAGEMENT_TOKEN` | Platform Edge secret; approved Management PAT for managed provisioning/repair |
| `PLATFORM_SCHEDULER_SECRET` | Platform Edge secret; fresh high-entropy dedicated dispatch credential |
| `orbito_platform_url` | Named Platform Vault secret, exact production Platform URL |
| `orbito_platform_scheduler_secret` | Named Platform Vault secret, same value as Edge scheduler secret |
| `VITE_PLATFORM_URL`, `VITE_PLATFORM_ANON` | Public frontend URL/key for this Platform only |
| `VITE_TURNSTILE_KEY` | Public frontend CAPTCHA site key |
| `VITE_PLATFORM_AUTH_EMAIL` | Optional public alias-login convenience; actual administrator Auth email; never authority |

The legacy Platform anon JWT must remain available for the current managed
support compatibility resolver and gateway configuration. Do not replace it
with a service/secret key or assume an opaque publishable key satisfies every
existing gateway path. Management permissions must cover the intended managed
Shop projects only as required by the reviewed provisioning flow. Shop bridge
secret names are installed per client by that flow; do not prepopulate them in
fresh Platform config or repackage its Shop artifact during bootstrap.

Migrations/binding precede function deployment. The four checked-in functions
and shared files are deployed explicitly, only after separate deployment approval:

```powershell
supabase functions deploy platform-bridge platform-config platform-provision platform-support --project-ref mincersddxuaqojczcih
```

Use the checked-in config: platform-config verifies JWT at the gateway; bridge,
provision and support disable gateway JWT verification because they validate
source credentials, scheduler credentials or verified Auth/canonical identity
inside the handler. Do not add a blanket `--no-verify-jwt`, `--prune` or a Shop
function deployment. The new migration changes canonical authority, so the four
unchanged functions inherit it without an authorization fork. Missing team
functions remain the source-review gate described above.

Before installing the existing scheduler, enable actual `pg_cron` and `pg_net`
using supported provider tooling. Store the two named Vault secrets securely;
verify names/counts, not decrypted values. Ensure scheduler secret matches Edge,
function deployment succeeded, and no dispatch is possible with an absent/wrong
credential. Then, after approval:

```powershell
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -f supabase/maintenance/install_platform_bridge_schedule.sql
```

Verify exactly one active job named `orbito-platform-bridge`, at the existing
one-minute cadence, then inspect sanitized job outcomes. The installer reuses
that named job. No scheduler credentials belong in `platform_config`; no
scheduler installation or outbound polling was performed by this task.

Configure the exact production frontend Site URL and narrowly allowed login,
invite and password-reset redirect URLs in Supabase Auth. Configure working SMTP
and verify delivery/recovery before opening access. Configure server Turnstile
with its secret and the matching public site key/allowed production domain;
preserve CAPTCHA for login/recovery. Keep public/anonymous signup disabled; team
invitations require the reviewed missing handlers. Review token/session settings
and provider MFA options for the administrator. Existing Shop manual owner/Auth
activation remains a separate per-customer flow, not Platform bootstrap.

## Validation and opening access

Run the supplied database assertions after initialization/binding or staging upgrade:

```powershell
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -f supabase/bootstrap/validate.sql
```

This verifies the enabled confirmed binding, config/password restrictions, owned
RLS tables/private schema, no API-role owner membership/private CREATE, all table
privileges including TRUNCATE/REFERENCES/TRIGGER/MAINTAIN and column ACLs, and
bootstrap function owner/SECURITY INVOKER/empty search_path/execution restrictions.
It checks absence of old email policies. It displays only UUID/revision,
alias and a password-cleared boolean, then proves canonical identity inside a
rolled-back authenticated-role transaction. This SQL proof is **not** a real
Auth JWT/browser validation. Also inspect the genuine migration history and,
for a fresh installation, confirm these counts remain zero:

```sql
select 'clients' as relation,count(*) from public.clients
union all select 'platform_users',count(*) from public.platform_users
union all select 'billing_cycles',count(*) from public.billing_cycles
union all select 'payments',count(*) from public.payments
union all select 'usage_logs',count(*) from public.usage_logs
union all select 'support_tickets',count(*) from public.support_tickets
union all select 'provision_jobs',count(*) from platform_private.provision_jobs
union all select 'config_jobs',count(*) from public.config_jobs;
```

There should be one config row, one bound administrator Auth user and two
bootstrap audit rows (configuration initialized and master bound), not imported
audit history. Additional intentional provider Auth events are separate from
Platform audit. Confirm anonymous/ordinary API callers cannot obtain master
identity, mutate binding, invoke privileged lifecycle/recovery/provisioning RPCs
or read the legacy password column. `platform_accept_invite`, public plan
entitlement helpers and insert-only support submission intentionally have their
existing narrower permissions; they do not assign master.

Only then re-enable the Data API, deploy the approved frontend with real public
configuration, and perform an authenticated CAPTCHA login, session restore,
alias edit, recovery, master-only rejection and support/provisioning smoke on an
explicitly approved disposable customer. Those hosted checks remain pending;
local fixtures cannot claim them. Keep team server endpoints verified absent or
disabled until their source/security gate passes. Publication/legal status is unchanged.

## Existing staging upgrade and identity continuity

Do not run fresh-preflight or replay historical migrations on staging. First
take the approved recoverable snapshot; record pre-upgrade counts and the
existing administrator's **real** UUID from their verified Auth session and
`platform_operator_identity()`. Cross-check the intended person and Auth row as
the trusted operator. No staging UUID has been guessed or embedded in this task.

Run general preflight, compare local/applied history and dry-run: all eleven
historical versions must already correspond to the actual installation, with
only `20261008191709` pending. Unexpected drift/history needs separate review.
Do not repair/fabricate history to make the dry run appear correct.

Prepare the one-time cutover approval with the independently verified UUID:

```powershell
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -v "master_uuid=$env:REVIEWED_STAGING_MASTER_UUID" -v "reason=Approved UUID continuity cutover" -f supabase/bootstrap/approve-staging-master.sql
supabase db push --db-url "$env:PLATFORM_DB_URL" --dry-run --skip-vault
# Review that only the new migration is pending, then:
supabase db push --db-url "$env:PLATFORM_DB_URL" --skip-vault
psql -X -v ON_ERROR_STOP=1 "$env:PLATFORM_DB_URL" -f supabase/bootstrap/validate.sql
```

Approval requires a confirmed enabled Auth user whom the **existing**
operator_role already authorizes as master. It does not authorize an email
claimant anew. The trusted operator's independent identity review is required
even if an installation still has historical email logic. The migration rechecks
approval against old authority, changes authority, binds the same UUID, and
consumes approval in one transaction. Without approval it refuses to change an
existing installation. Retry of the same approval is audited once; a different
candidate refuses. Failure before commit preserves old authority and any
previously committed approval. Auth rows, customers, alias and operational/
financial history remain intact; the unused plaintext config password is
intentionally scrubbed and cannot be restored as an authentication mechanism.

Verify the original master with their existing authenticated session, confirm
the real UUID remains bound and the alias/record counts are retained, and verify
the historical placeholder account cannot gain access. The four checked-in Edge
functions need no redeployment for this DB-only cutover. Unknown team functions
still require separate source review; staging upgrade is not a claim that their
unavailable code is secure.

## Partial failure, recovery and rollback limits

On any failure keep fresh production API/frontend/signup closed. Inspect the
first failing statement, committed schema and actual migration history. Earlier
committed files stay applied. Fix a prerequisite using its reviewed procedure,
then rerun dry-run and only pending migrations. If schema committed but history
did not for a historical file, stop for explicit forensic/recovery review; do not
use history repair or rerun non-idempotent files blindly. The corrected new file
cannot produce that split under the tested unflushed batch; any observed split
is a blocker requiring source/CLI/provider investigation. Do not reset an installation containing
retained data. The fresh-only preflight intentionally refuses partial installs.

If the chain finished but config/binding did not, access stays closed. Inspect
the config and binding metadata, then repeat the same initializer/binder
transaction with the same verified UUID. Do not create a replacement account,
change UUIDs or bypass verification just because a login failed. For a disabled
master, restore the intended account through the approved Auth recovery flow or
perform the governed, audited rebinding as postgres.

An unapproved/failed staging cutover rolls back the new migration; the old
authority remains. Review and retry the same verified approval. After success,
the private approval is consumed; use governed rebinding, not the approval
script. There is no down migration. Returning to email authorization or legacy
passwords is unsafe. Use a reviewed forward fix or an approved whole-instance
snapshot recovery with explicit reconciliation of all post-snapshot writes.
Auth email changes do not change UUID authority. Support issuance/consumption
rechecks canonical authority, so a replaced/disabled master cannot consume its
old unconsumed grant. Existing admitted sessions/provider credential compromise
remain matters for the appropriate Auth/session/secret recovery procedures.

## Local evidence and reproduction

On 2026-10-09, six expanded Node database groups and five actual-CLI scenarios
passed on Docker's real Supabase PostgreSQL 17.6.1.155 image (server 17.6), pgcrypto
1.3, Vault 0.3.1 and GoTrue v2.197.0 Auth migrations. The image records seven Auth
baseline versions; the GoTrue pass adds 75, leaving **82** genuine Auth history
versions in the source infrastructure DB. Tests copy infrastructure **schema only**
into isolated databases, install real extensions, and use fictional test UUIDs.
No real master UUID/customer/secret was used. The test driver refuses arbitrary
database URLs and requires a task-prefixed Docker container. Missing Docker,
Auth prerequisites or extensions fail rather than silently skipping/mocking.

Preferred reproducible command (the CLI harness creates its own unique labeled
container/network, random local credentials and loopback port, real Auth
migrations, schema-only template and genuine CLI-applied history; then runs the
six existing DB groups and cleans up):

```powershell
$env:ORBITO_BOOTSTRAP_CLI_PATH=(Resolve-Path node_modules/.bootstrap-tools/supabase.exe).Path
node --test tests/production-bootstrap-cli.test.mjs
node --test tests/platform-identity-consistency.test.mjs tests/support-access.test.mjs tests/support-handoff.test.mjs tests/provision-scheduler.test.mjs
```

Use the actual reviewed CLI **2.120.0** at that absolute path, not a SQL-runner
replacement. Windows executable SHA256:
`1cbedd6e494581a1c1d90113660113a06798d9967d19c857127b66b8a428e836`.
It checks version/fingerprint and requires the two pinned cached Docker images;
missing dependencies fail. It strips inherited Supabase/PG configuration from
CLI invocation, accepts no hosted target or existing container, never inserts
history itself, and deletes only its label-verified resources and checked owned
workspace directory. Normal success/failure runs execute cleanup. Hard-killing
the runner cannot execute teardown: use the printed exact fixture scope to verify
its labels/no live test process, stop that container and remove that network.
Do not stop/remove all prefix-matching resources belonging to other concurrent runs.

For the six DB groups alone, prepare a dedicated local container (never an
existing project/container):

```powershell
docker network create --internal orbito-bootstrap-test-network
docker run --rm -d --name orbito-bootstrap-hardening-test --network orbito-bootstrap-test-network -e POSTGRES_PASSWORD=local-disposable-test-only public.ecr.aws/supabase/postgres:17.6.1.155
# Wait for pg_isready -h orbito-bootstrap-hardening-test -U postgres to succeed.
# Unix-socket readiness can see the temporary init server; require final bridge TCP.
docker exec orbito-bootstrap-hardening-test psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "alter role supabase_auth_admin password 'local-disposable-test-only'"
docker run --rm --name orbito-bootstrap-auth-migrations --network orbito-bootstrap-test-network -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:local-disposable-test-only@orbito-bootstrap-hardening-test:5432/postgres -e GOTRUE_SITE_URL=http://localhost:4180 -e API_EXTERNAL_URL=http://localhost:9999 -e GOTRUE_JWT_SECRET=local-disposable-auth-fixture-32-bytes-only public.ecr.aws/supabase/gotrue:v2.197.0 auth migrate
$env:ORBITO_BOOTSTRAP_TEST_CONTAINER='orbito-bootstrap-hardening-test'
node --test tests/production-bootstrap.test.mjs
node --test tests/platform-identity-consistency.test.mjs tests/support-access.test.mjs tests/support-handoff.test.mjs tests/provision-scheduler.test.mjs
docker stop orbito-bootstrap-hardening-test
docker network rm orbito-bootstrap-test-network
```

The literal passwords/JWT in this local-only example are disposable fixture
inputs on an internal network without published ports; never use them on a
hosted project. If the named container/network already exists, inspect ownership
and choose a new task name rather than replacing it. The driver drops its own
fixture databases; stop/remove only the containers/networks created for this task.

All six expanded DB groups and five CLI scenarios passed with zero unresolved
FAIL/SKIP. The existing handler/frontend tests
passed 49 checks with zero FAIL/SKIP; their Auth/Management boundaries are mocks,
separate from the real database tests. SQL regressions cover onboarding/manual
activation, control plane/currency, lifecycle/recovery and support handoff with
the actual UUID binding, not an operator_role override. Added actual DB denials
for soft-deleted users, disabled master and affected managers, bound-user deletion,
API TRUNCATE/initializer access, and outstanding support grants after rebinding;
the replacement master can still issue/consume its own grant. Validator corruption
tests cover extra table/column grants, wrong ownership, SECURITY DEFINER and
PUBLIC execution. The 49 tests remain mocked at their Auth/Management boundaries.

The checked-in CLI harness now reproduces full fresh/upgrade/history/retry checks,
history-write rejection and connection termination in both scenarios, plus the
unsafe flush negative control. Earlier baseline rollback/recovery evidence used
a temporary injected copy; immutable repository files stayed unchanged. Initial
harness issues (82 vs 75 total Auth records, temporary-server readiness, nested
Node test context) were corrected before final results. The six-group rerun has
durable captured TAP evidence; an interrupted test process's orphan resources
were separately label-verified and removed. The final combined corrected CLI
harness run also passed all six top-level tests with zero FAIL/SKIP, independently
verifying the child suite's six PASS/zero FAIL/SKIP. Captured ignored evidence:
`node_modules/.bootstrap-tools/final-hardening/final-cli-regression.log`.
The whole cross-repository harness was not run (it exercises
Shop and uses synthetic Vault). No hosted Auth, Management, CAPTCHA, function
deployment, scheduler HTTP or browser production smoke is claimed; those checks
are SKIP by the explicit no-hosted-operations scope, pending later approval.

References: [PG17 GRANT/MAINTAIN](https://www.postgresql.org/docs/17/sql-grant.html),
[Supabase Vault](https://supabase.com/docs/guides/database/vault),
[event triggers](https://supabase.com/docs/guides/database/postgres/event-triggers),
[restricted postgres role](https://supabase.com/docs/guides/database/postgres/roles-superuser),
[reviewed native CLI migration batching](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/migration-apply.ts),
[native transaction-mode parsing](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/migration-file.ts),
[native batch/Sync contract](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/db-connection.service.ts),
[PG17 extended protocol](https://www.postgresql.org/docs/17/protocol-flow.html),
[non-transactional sequence counters](https://www.postgresql.org/docs/17/functions-sequence.html),
[PG17.11 pgcrypto breaking-change notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
Platform uses digest/random bytes/Vault, not the deprecated cipher path. The
cached local engine is PG17.6; a production engine/version/provider-specific
baseline is still subject to the target preflight, not assumed from local PASS.
