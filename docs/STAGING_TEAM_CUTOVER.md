# Secure Platform team management and staging cutover

Prepared 2026-10-09, Asia/Karachi. Local implementation and planning only.
No deployment, backup, Auth change, migration, Git integration or production
operation is authorized by this document. Review the exact target at each gate.

## Read-only findings and source provenance

Owner-authorized retrieval from staging `ukbhyerxshteyetwomqy` found:

| Function | Active version | Gateway JWT | Provider bundle SHA256 |
| --- | --- | --- | --- |
| create-platform-user | 10 | true | a038908c9058bb38ff5c38b6383b62b168fabe626dbd3f52297ddbadbf306fb9 |
| update-platform-user | 8 | true | ea6ba836d46692488a9e23a31e4822335818b61f41650fad42bbc07774a418ec |
| delete-platform-user | 8 | true | c1b3440edcfa1996016473d24b72aae21ea47b66cf111139d7a84710d3251af8 |

All three instantiate a service-role client without verifying the caller's Auth
user or canonical operator role. Create accepts an arbitrary role/email, sends
an invitation, then inserts a team row. Update/delete directly pass a supplied
Auth UUID to privileged Auth methods. None protects the master or writes audit
evidence. Failures can leave Auth/team state inconsistent. JWT gateway checks
and the fixed frontend CORS origin do not supply master authorization.

Read-only inventory also found platform-bridge v6, platform-config v9,
platform-provision v16 and platform-support v1 (seven active functions total).
This does not establish absence of aliases, proxy routes, older integrations or
other privileged services. No live database policies, users, UUIDs, configuration
values or secrets were retrieved. The production project was not contacted.
The matrix below describes checked-in schema; verify deployed drift later.

## Existing authority and permission matrix

| Capability | Master | Portfolio Manager | Billing | Other/anonymous |
| --- | --- | --- | --- | --- |
| Canonical operator reads | Yes | Active member | Active member | Denied |
| Client creation/edit, lifecycle and support ticket resolution | Yes | Yes | Denied | Denied |
| Invoice generation and payment recording | Yes | Denied | Yes | Denied |
| Shared operational status/recovery reads | Yes | Yes | Yes | Denied |
| Provisioning, configuration/support privileged Edge actions | Master checks | Denied | Denied | Denied |
| Platform alias configuration and team profile/status SQL updates | Yes | Denied | Denied | Denied |
| Team Auth invite/update/delete through these replacements | Yes | Denied | Denied | Denied |
| Change own Auth password / Auth recovery | Own account | Own account | Own account | Auth recovery flow only |
| Accept invitation | Own Pending row | Own Pending row | Own Pending row | Verified invited Auth user only |
| Bootstrap binding/rebinding | Trusted postgres procedure only | Denied | Denied | Denied |

Anonymous support submission and narrow public compatibility helpers retain their
existing contracts; they do not grant operator or team administration authority.
Scheduler dispatch uses the existing dedicated server secret, not a new role.
The existing two team roles remain `portfolio_manager` and `billing_person`.
No SQL grant, policy, role or migration is changed by the team implementation.
The old master authority must independently resolve to the intended real Auth
UUID. After bootstrap, operator_role uses the protected UUID binding; a disabled
bound master fails closed for all operators as already specified by that migration.

## Repository replacements and compatibility

All three entrypoints call `_shared/platform-team.ts`, pinned supabase-js 2.108.2.
Each POST uses the caller-scoped anon client to call Auth `getUser`, then
`platform_operator_identity`. Both must identify the same Auth UUID and the RPC
must return `master_admin`. Browser email, metadata, roles and target IDs never
prove caller authority. Service-role construction occurs only after authorization.
No service secret enters browser code. Gateway JWT verification stays true.

Configure server-side `PLATFORM_TEAM_SITE_URL` to the reviewed HTTPS frontend
origin (no credentials/path/query/fragment). It supplies CORS and the invitation
redirect `/?reset=true`; missing configuration fails closed. Also require the
existing SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Do not
use a preview variable name as evidence of backend isolation. No setting was made.

Contracts:

- Create: `{email,name,role}`; roles limited to the two existing ordinary roles.
  Reject master email as target protection, existing Auth identities/orphans and
  ambiguous team records. No password, metadata, redirect or caller ID accepted.
  Create Auth invitation then Pending team row. A matching Pending retry verifies
  the linked Auth ownership and returns `already_invited` without another email.
  Inventory is bounded at 10,000 Auth users; a larger installation fails closed
  for operator review rather than silently skipping the ownership check.
- Update: `{id,name?,email?,role?,password?}`. For the old UI, `auth_user_id` is
  accepted only as a lookup selector for exactly one server team record. Conflicting
  selectors fail. Validate existing immutable mapping with Auth `getUserById`.
  No arbitrary Auth target, role escalation or master mutation is possible.
  The old UI's earlier desired-email database write is supported through the same
  server-held mapping; unexplained email drift otherwise stops the operation.
  Auth update precedes profile update; own-account recovery is unchanged.
- Delete: `{id}` or the same legacy selector. Mark the ordinary team row Inactive
  before deleting its linked Auth account. Retain the historical team row. An
  explicitly unlinked legacy row can be deactivated without any Auth operation.
  Missing/deleted linked accounts require review; repeated deletion after Auth
  removal does not blindly repeat a privileged operation. Password/email reset
  and deletion of the canonical master are denied, even through a misleading row.

Frontend edit/removal now invoke these handlers for the entire operation rather
than splitting direct DB/Auth writes. Backend-first rollout supports the existing
frontend payloads; frontend-first rollout is unsafe because the old update handler
cannot interpret the new `id` payload. Old master-only SQL profile/status grants
remain unchanged; this task does not claim all legacy master SQL edits are audited.

Immutable `operator_audit` start/completion/failure rows contain verified actor,
operation UUID and target team UUID, never passwords, emails, names, bearer tokens
or raw provider errors. Required start-audit failure prevents mutation. Unknown
provider/transport outcome returns a sanitized error and operation reference.
Auth and Postgres are separate transactions: a failed final audit can also follow
a successful write. Do not classify that response as a rolled-back operation.
Do not resend invitations, roll back passwords, delete orphan accounts or restore
Inactive status automatically. Review audit, Auth account and team row first.
Completed invite retries are safe; credential/deletion retries need outcome review.

Authorization is rechecked before writes, but cannot hold a database lock across
Auth HTTP calls. Freeze team operations and all trusted identity changes during
cutover/rebinding; drain in-flight requests first. A trusted concurrent UUID
rebind is not proven atomic with an in-flight Auth request. Existing access JWTs
can outlive Auth deletion; Inactive operator status revokes canonical DB authority.
Other services accepting tokens without current operator checks require inventory.

## Approval gate A: contain, deploy and verify the three endpoints

1. Independently verify the staging project and current source versions. Review
   the seven-function allowlist and every direct/custom/alias route. If protection
   cannot be deployed immediately, separately approve provider-side blocking of
   the exact three vulnerable endpoints **before handler execution**, including
   direct Supabase routes. CORS, frontend hiding or an anonymous 401 is insufficient.
   Test the block with a valid ordinary session without triggering Auth writes.
2. Review the intended origin, secrets availability, gateway behavior with the
   project's signing keys, Auth site/redirect allowlist, SMTP delivery, CAPTCHA
   login/recovery and public/anonymous signup restrictions. Native Deno/Edge runtime
   validation is only local evidence; actual hosted Edge validation remains a gate.
3. After separate deployment approval, use the reviewed CLI and checked-in config:

   ```powershell
   $cli = (Resolve-Path node_modules/.bootstrap-tools/supabase.exe).Path
   & $cli functions deploy create-platform-user update-platform-user delete-platform-user --project-ref ukbhyerxshteyetwomqy
   ```

   Discover flags with that binary's `functions deploy --help` first. Never pass
   `--no-verify-jwt` or deploy/prune other functions. Re-inventory versions/JWT
   settings and retrieve deployed source to compare the reviewed artifact.
4. In an approved test-account scope, verify master invite/update/removal,
   Manager/Billing/anonymous/invalid/forged callers, master target protection,
   invitation acceptance and password recovery. Verify actual Auth and DB state
   after denials, not just HTTP responses. Record sanitized evidence/operation IDs.
   Do not use real business accounts as destructive test targets. Confirm old UI
   still works before moving on; unknown privileged endpoints block cutover.
5. Failure: keep the affected routes blocked; fix forward or deploy an explicitly
   reviewed secure previous version. Never restore the vulnerable code to recover
   availability. Resolve any partial test-account operation through its audit.

## Approval gate B: independent identity, baseline and encrypted backup

The owner must review the staging target, backup tool/version, destination,
encryption recipients/key custody, retention, access controls and recovery target
**before any backup or credential handling**. No backup was executed in this task;
no storage location or real master UUID is invented here.

1. Maintenance freeze: block new team/identity changes, drain in-flight handlers;
   pause scheduler and other writers only through separately approved controls.
   Prevent new invitations or master changes while taking the recovery baseline.
2. Verify master UUID from the intended person's verified Auth session plus
   canonical RPC, independently cross-check the actual enabled/confirmed Auth row
   and existing operator_role as trusted postgres. Record UUID in restricted
   operator evidence, not source or public reports. Confirm no placeholder account
   supplies authority. Inspect actual role/RLS drift without decrypting Vault.
3. Run `supabase/bootstrap/preflight.sql`. Confirm PG17, roles/owners/grants,
   extensions schema pgcrypto, Vault and publication dependencies. Compare all
   eleven historical version IDs/content to reviewed files and applied history;
   only `20261008191709` may be pending. Use pinned CLI 2.120.0; no history repair.
4. Record counts only, not personal/financial rows or secrets:

   ```sql
   select 'auth_users' object,count(*) from auth.users
   union all select 'platform_users',count(*) from public.platform_users
   union all select 'clients',count(*) from public.clients
   union all select 'billing_cycles',count(*) from public.billing_cycles
   union all select 'payments',count(*) from public.payments
   union all select 'platform_config',count(*) from public.platform_config
   union all select 'operator_audit',count(*) from public.operator_audit;
   select role,status,count(*) from public.platform_users group by role,status;
   select version from supabase_migrations.schema_migrations order by version;
   ```

5. Prefer verified provider backup/PITR recovery plus a separately encrypted logical
   backup when supported. Confirm provider recovery point, plan entitlement and
   retention; do not assume enabled PITR or a portable Vault key. For logical backup,
   approve PostgreSQL 17 pg_dump/pg_dumpall and an approved authenticated encryption
   tool such as age, with recipient/key custody outside this repository. Dump
   schema/data for public, platform_private, Auth, migration history, Vault/extension
   state and required grants/roles within actual provider permission limits. Roles
   need separately reviewed globals; do not restore provider-owned globals blindly.
   Supabase CLI's default dump exclusions are not a complete Auth/private backup.
   Compare required tables against the backup manifest; missing access is a blocker.
6. Stream binary custom-format pg_dump output directly into the encryption process
   using a reviewed binary-safe supervisor, check **both** exit codes, then publish
   only the completed encrypted file and checksum/manifest at the approved location.
   Windows PowerShell text pipelines can corrupt binary output; do not improvise
   one. No plaintext dump, password argument, credential-bearing logs, debug output
   or plaintext temporary file. This pre-cutover backup may include historical
   plaintext legacy fields and Auth password hashes: encryption/access review is
   mandatory. Obtain connection credentials only through approved secret storage.
7. Verify encrypted file integrity and decryption using the authorized key holder;
   pg_restore --list verifies archive readability, **not** recoverability. Perform
   a disposable isolated restore with matching PG/extensions/provider roles where
   feasible, no outbound customer/SMTP/Shop traffic, disabled functions/scheduler,
   no imported sessions exposed. Verify restored counts, canonical identity,
   historical versions, FK/RLS/ACLs and audit integrity. Validate Vault usability
   without printing decrypted secrets; provider encryption keys may not be portable.
   If provider-managed Auth/Vault recovery cannot be rehearsed locally, record the
   limitation and prove the provider recovery route before cutover approval.

Scope omissions must be listed: Storage object bytes are not in a SQL dump;
Edge bundles, gateway routes, Auth/SMTP/CAPTCHA settings, secrets, JWT signing
material, Cloudflare configuration and external Shop systems need separately
approved protected recovery records. No Shop backup/change is authorized here.
The disposable synthetic tests below are not a restore rehearsal of real staging.

## Approval gate C: UUID cutover, preservation and frontend integration

1. Require gates A/B evidence, maintenance freeze and reviewed recovery point.
   Follow the exact staging procedure in [PRODUCTION_BOOTSTRAP.md](PRODUCTION_BOOTSTRAP.md).
2. Run trusted `approve-staging-master.sql` with the independently verified UUID
   and reviewed reason. The existing authority must already authorize that UUID.
   Approval is committed separately and survives a later migration failure.
3. Using the pinned CLI and a reviewed direct/session connection, dry-run from
   the reviewed checkout. Require **only** the new version pending:

   ```powershell
   & $cli db push --db-url "$env:PLATFORM_DB_URL" --dry-run --skip-vault
   # Separate go/no-go review of target, eleven existing versions and one pending version.
   & $cli db push --db-url "$env:PLATFORM_DB_URL" --skip-vault
   ```

   Do not replay historical migrations, run the SQL alone in autocommit, insert
   history manually or use migration repair. The new migration and genuine CLI
   history entry share one implicit transactional batch with CLI 2.120.0.
4. Run bootstrap validate.sql and verified-session master/Manager/Billing checks,
   team endpoint negative tests, support/provisioning/lifecycle/finance smoke.
   Cross-check the original master UUID, Auth users/roles/credentials and baseline
   customer/billing/config rows. Existing audit entries remain; expected bootstrap
   and test audit additions mean audit count increases. The unused config plaintext
   admin_password is intentionally scrubbed, not preserved as authority.
5. On CLI failure, inspect genuine history and old authority/committed approval.
   Local history-insert/termination regressions prove rollback for reviewed cases;
   unknown network/provider outcome still requires inspecting history/state before
   retry. One successful genuine history row is required. Never fabricate it.
   After successful commit there is no automatic reverse migration. Restore through
   the approved recovery plan only with downtime/write-loss assessment, or fix
   forward through governed UUID procedures. Never reinstate email authority.
6. After backend and old/new frontend compatibility is verified, separately approve
   merging draft PR #1 to development. Review the resulting automatic staging
   Cloudflare deployment and exact built frontend backend target; perform authenticated
   browser smoke. Do not infer backend isolation from preview access or variable
   names. Failure: retain maintenance protection, deploy a reviewed compatible
   frontend or fix forward. A frontend rollback does not reverse database/Auth work.
7. Re-enable approved writers only after all checks pass. Record outcome/recovery
   references without secrets. No protected branch was changed during this task.

## Future production gate

Separately review/promote approved development to deployment; frozen main remains
untouched. Verify the release commit and build-time Platform target. Use the fresh
procedure for `mincersddxuaqojczcih`, organization `jcjsfijdfiunbfnkawpo`, Singapore
ap-southeast-1: verify empty project, preflight, all twelve migrations in order,
first intended Auth administrator, trusted config initialization/UUID binding,
then the seven reviewed Platform functions including these secured team handlers.
Set the production-only origin/Auth redirect/SMTP/CAPTCHA/server secrets and
approved scheduler prerequisites. No staging data, users, credentials or history
are imported. Production promotion/bootstrap/publication needs separate approval.

## Reproducible local validation and remaining evidence

```powershell
node tests/run-platform-team-local.mjs
node --test tests/platform-identity-consistency.test.mjs tests/support-access.test.mjs tests/support-handoff.test.mjs tests/provision-scheduler.test.mjs
```

The runner owns labeled disposable PostgreSQL 17.6 and real GoTrue v2.197.0 schema
migrations/Vault fixtures, publishes no port, rejects external target arguments,
and cleans up its own resources. Forty handler/frontend cases use explicit Auth/
REST doubles; two additional groups use actual PostgreSQL canonical RPC/RLS before
and after approved synthetic UUID cutover. Existing six bootstrap database groups
run independently. These do not prove real Auth admin HTTP behavior, hosted gateway,
SMTP/CAPTCHA/browser success, provider restore or live schema identity continuity.
Those remain approved-window gates. Native Deno 2.4.5 type/dependency checking
passed for all three entrypoints with the pinned SDK. The official Windows archive
was SHA256 verified; tooling/cache remain ignored under node_modules/.bootstrap-tools.
This is separate from Node syntax transformation and is not a hosted runtime test.

| Check, 2026-10-09 | Result | Scope |
| --- | --- | --- |
| Handler/frontend security | PASS: 40 | Explicit Auth/REST doubles, real handler code |
| Canonical RPC/RLS compatibility | PASS: 2 | Actual PG17, before/after synthetic UUID cutover, finance role gates and invite acceptance |
| Existing bootstrap database groups | PASS: 6 | Actual PG17/Auth schemas/Vault, fresh/upgrade/negative/lifecycle/support |
| Existing focused regressions | PASS: 49 | Identity/support/scheduler, existing doubles |
| Native Deno checks | PASS | Three entrypoints, pinned SDK 2.108.2 |
| Syntax/whitespace/immutable files and sensitive scan | PASS | Local source review |
| Hosted gateway/Auth admin HTTP/SMTP/CAPTCHA/browser | SKIP | Not authorized; release gates |
| Real staging backup/restore/live UUID and schema verification | SKIP | Storage/target/tooling review and maintenance approval required |

No unresolved local FAIL. An initial Deno check found two TypeScript narrowing
errors; the guard declaration was corrected and the native check rerun successfully.
No CLI history harness rerun was required for this Edge/frontend change; its source
and all twelve migration files are unchanged. Earlier CLI evidence remains historical.

Primary references: [Auth invitation](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[Auth admin updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid),
[Auth deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[PG17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).
