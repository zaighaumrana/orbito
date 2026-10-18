# Owner deployment runbook — verified customer Support v1

This is a manual handoff, not evidence of deployment. During implementation, neither hosted Supabase project nor Cloudflare was changed. Never run these hosted commands as part of local tests.

## Review and compatibility gates

Accept both coordinated implementation PRs against development after reviewing their final SHAs and validation report. Platform base: 23a157a5c2aa581eec6e0f02b97318c784296e79. Shop base: f91f02819a9f2909062e36140f1775a870009115. Feature branches: feature/verified-customer-support-platform and feature/verified-customer-support-shop. Resolve current implementation SHA with git rev-parse HEAD and compare with the PR; the PR description records the delivery SHA. Never use main or deployment for this work.

The disposable Shop tufvoxxlgfydoknxczoy may be empty or unpaired. These changes do not initialize Auth, reserve/create an owner, pair a Shop, activate a client or authorize replay of onboarding. If it lacks the approved baseline, use the separately reviewed normal new-Shop provisioning process first. If an existing initialized Shop lacks migration history, stop and reconcile/adopt it explicitly; do not replay baseline SQL or reset it. Only enable Support after the exact active central client/source/binding and confirmed Shop Owner exist.

Keep both PRs unmerged until your review decision. Hosted real Auth/gateway/Management/Vault/installation, different-account BYO and browser smoke acceptance remain before-use gates even when native local tests pass. Separate review of existing baseline failures is required; see CUSTOMER_SUPPORT_VALIDATION.md. No production-ready claim is made.

Drain/reconcile outstanding configuration/provisioning jobs. Preserve their request IDs, frozen stage fingerprints and the accepted _shared/shop-release.json. Existing completed Shops receive only the additive migration/new function and optional credentials; never rerun their completed setup.

## Tooling and identity

Commands below were checked against installed Supabase CLI 2.120.0 help (db push supports --project-ref, --dry-run, --skip-vault; functions deploy supports --project-ref and --use-api; secrets set supports --env-file). Pin that reviewed version or review any newer CLI's help before running. Use an actual installed executable, not an invented wrapper path. No debug output or terminal transcript should capture credentials.

PowerShell (owner executes later):

~~~powershell
$SupportCli = 'C:\ABSOLUTE\PATH\TO\supabase.exe' # replace with your installed executable
& $SupportCli --version
& $SupportCli db push --help
& $SupportCli functions deploy --help
& $SupportCli secrets set --help
& $SupportCli migration list --help
& $SupportCli projects list --output json
~~~

Verify project access and exact project IDs privately. Do not paste project key responses, database passwords or Management tokens into this runbook or Git. CLI project list and migration history are read-only. Do not rely on a saved link or an existing .env to choose the target: every hosted command below has an explicit project reference.

## 1. Platform development first

~~~powershell
Set-Location 'C:\Users\ranaz\Desktop\Development\orbito'
git status --short
git branch --show-current
git rev-parse HEAD
& $SupportCli migration list --project-ref ukbhyerxshteyetwomqy
& $SupportCli db push --project-ref ukbhyerxshteyetwomqy --dry-run --skip-vault
~~~

Expected new active migration, after all 17 existing migrations:

1. 20261018000612_verified_customer_support.sql

If dry-run includes unexpected historical/baseline migrations, STOP. Review current hosted history, prerequisites and approved source; do not add --include-all to suppress a discrepancy. Snapshot/back up the target according to your existing approved process. The migration must be applied as the trusted postgres migration owner. It adds four private Support tables, ticket revision/resolution columns, service intake/read RPCs, Master credential commands, pairing-invalidation triggers, staff projection/resolution RPCs and an audited legacy wrapper. It revokes browser direct status/resolved_at updates. It does **not** close anonymous INSERT yet.

After explicit owner approval of that exact dry-run:

~~~powershell
& $SupportCli db push --project-ref ukbhyerxshteyetwomqy --skip-vault
& $SupportCli functions deploy platform-support-tickets --project-ref ukbhyerxshteyetwomqy --use-api
& $SupportCli functions deploy platform-support-enrollment --project-ref ukbhyerxshteyetwomqy --use-api
~~~

Do not deploy other functions or use --prune. platform-support-tickets has verify_jwt=false because its bearer is an opaque per-Shop Support credential. It independently verifies that credential and the real Shop user. platform-support-enrollment has verify_jwt=true and repeats canonical live Master/session checks in both handler and SQL. Existing platform-support (privileged handoff) and platform-bridge are unchanged.

Built-in SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY remain runtime-only. Managed credential installation uses the existing protected PLATFORM_MANAGEMENT_TOKEN; no new customer Management PAT is required. Install/verify/status commands return no plaintext key. BYO uses its own local CLI authority.

Deploy the reviewed Platform frontend only in a separately authorized application deployment. This implementation does not deploy Cloudflare. Until backend deployment, the new Support page cannot load its new projection RPC.

## 2. Disposable Shop additive upgrade

Only after the Shop has the normal approved baseline, owner, pairing and lifecycle prerequisites:

~~~powershell
Set-Location 'C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1'
git status --short
git branch --show-current
git rev-parse HEAD
& $SupportCli migration list --project-ref tufvoxxlgfydoknxczoy
& $SupportCli db push --project-ref tufvoxxlgfydoknxczoy --dry-run --skip-vault
~~~

Expected new migration, after the existing Shop chain:

1. 20261018000617_customer_support_actor.sql

It adds authenticated support_ticket_actor_context and service-only support_ticket_capability_context. It does not change existing Auth, owner, billing, bridge, transaction or handoff RPCs. Auth schema prerequisites are real Supabase auth.users fields email_confirmed_at/is_anonymous/deleted_at/banned_until and auth.sessions id/user_id/created_at/not_after; the new native suite checks them against GoTrue v2.197.0 migrations. Stop on incompatible provider schema; never weaken session checks.

After reviewing exact history/dry-run and target prerequisites:

~~~powershell
& $SupportCli db push --project-ref tufvoxxlgfydoknxczoy --skip-vault
& $SupportCli functions deploy support-tickets --project-ref tufvoxxlgfydoknxczoy --use-api
~~~

support-tickets retains verify_jwt=true. Its user calls still verify Auth and the live actor RPC. Capability probes use the explicitly approved Shop public anon JWT only for the gateway, then the dedicated installation proof. No change to existing six functions is required for a completed Shop upgrade.

Deploy the reviewed Shop frontend later through a separately authorized application deployment. Help & Support appears for Business Owner and Manager only; missing optional Support settings produce an unavailable/not-enabled message and do not fail POS/bridge/onboarding preflight.

## 3. Exact per-Shop enrollment (managed and BYO)

Use the owner-operated Shop script for both paths. The non-secret JSON config must contain only:

~~~json
{
  "platform_ref": "ukbhyerxshteyetwomqy",
  "project_ref": "tufvoxxlgfydoknxczoy",
  "client_id": 42,
  "source_id": "REPLACE_WITH_CANONICAL_SOURCE_UUID",
  "client_binding": "REPLACE_WITH_CANONICAL_BINDING",
  "shop_public_api_key": "REPLACE_WITH_SHOP_PUBLIC_ANON_JWT",
  "request_id": "REPLACE_WITH_ONE_NEW_ENROLLMENT_UUID",
  "pairing_mode": "managed",
  "scopes": ["ticket:create", "ticket:read"]
}
~~~

42 is illustrative, not an actual client to create/use. Read the actual existing client/source/project/binding through approved Master administration. Never infer identity from a submitted name/email or revive an archived client. The public Shop key must be the existing own-project anon JWT; service/secret keys are rejected. Use a fresh enrollment UUID once, then retain it for every retry/recovery action. Rotate with a *new* enrollment UUID only as an explicit rotation after reconciling any pending installation.

The script reads SUPPORT_MASTER_ACCESS_TOKEN and PLATFORM_PUBLIC_API_KEY from the current owner's terminal process environment. Use your current canonical Master session from the existing approved login/CAPTCHA flow; never bypass it with password forwarding or create a new identity. Enter the short-lived token privately, do not save it in shell history/files. One way to avoid echo is Read-Host -AsSecureString plus transient BSTR conversion; remove the environment variable after use. The Platform public API key is public, not a service key. No Support credential is copied into a browser.

Managed path (the Platform already has its protected Management authorization):

~~~powershell
node scripts/support-setup.mjs --help
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action prepare --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action install --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action verify --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action status
~~~

Preparation creates a disabled key. Install sends exactly PLATFORM_SUPPORT_TICKETS_SECRET and PLATFORM_SUPPORT_TICKETS_ENDPOINT to the registered Shop. The endpoint is https://ukbhyerxshteyetwomqy.supabase.co/functions/v1/platform-support-tickets. An install result alone never enables. Verify checks the installed secret proof, exact local pairing and endpoint, then enables atomically and revokes earlier keys. Repeat the same request after an uncertain HTTP/Management outcome; Vault preserves the same prepared managed secret.

BYO path: set pairing_mode=byo in the reviewed exact config. Create a private directory outside both repositories, protected by the owner's Windows ACL. Customer Supabase CLI must already have authorized access to that exact customer project; do not send its Management PAT to Platform. The private runtime file contains only the two dedicated Support settings and is never printed.

~~~powershell
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action generate --runtime-file 'C:\PRIVATE\shop-support.env'
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action prepare --runtime-file 'C:\PRIVATE\shop-support.env' --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action install --runtime-file 'C:\PRIVATE\shop-support.env' --cli $SupportCli --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action verify --apply
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action status
~~~

The trusted Platform owner executes prepare/verify with its own Master authority; the customer executes local installation with its own CLI. For different machines, the customer exports a hash-only enrollment file and securely transfers that file plus the reviewed public target config to the Platform operator. No customer runtime file or PAT is sent:

~~~powershell
# Customer machine, local file operations only:
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action export --runtime-file 'C:\PRIVATE\shop-support.env' --enrollment-file 'C:\PRIVATE\support-enrollment.json'
# Platform operator machine, current canonical Master authority:
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action prepare --enrollment-file 'C:\PRIVATE\support-enrollment.json' --apply
# Customer performs the local install command above; Platform operator then verifies.
~~~

The stable request ID and exact project/source/client/binding must match on both machines. The platform enrollment handler never returns the secret or hash in responses. Keep the original private runtime file protected through uncertain installation recovery; remove unnecessary downloaded copies after acceptance. Remove terminal token variables:

~~~powershell
Remove-Item Env:SUPPORT_MASTER_ACCESS_TOKEN -ErrorAction SilentlyContinue
~~~

Revoke explicitly using the original config/request:

~~~powershell
node scripts/support-setup.mjs --config 'C:\PRIVATE\support-target.json' --action revoke --apply
~~~

Active credentials fail closed on suspension/archival/decommission/unpairing; changing pairing permanently revokes prepared and enabled keys. Re-pairing requires a new explicit enrollment. Historical tickets retain their original namespace and never silently migrate into a different binding.

## 4. Existing and future managed/BYO installations

Do not replace the accepted supabase/functions/_shared/shop-release.json during this rollout. Existing completed clients get the additive upgrade above. The optional future candidate is generated from exact reviewed Shop source:

~~~powershell
Set-Location 'C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1'
node scripts/build-platform-release.mjs --support '../orbito/supabase/releases/shop-release-support-v1.json'
node --test tests/customer-support.test.mjs
Get-FileHash '../orbito/supabase/releases/shop-release-support-v1.json' -Algorithm SHA256
~~~

The artifact's internal sha256 hashes canonical JSON content excluding its own sha256; Get-FileHash hashes file bytes and is a separate transport fingerprint. Rebuild twice and compare bytes/internal hash. New function/migration changes require regeneration and review. The Platform consumer still imports its accepted artifact; candidate promotion is an explicit later release decision after no in-flight operation is bound to the old fingerprints. Promote by the reviewed builder to the accepted destination only under that later approval, update accepted artifact regression evidence, then deploy the affected provisioner bundle. Never hand-edit JSON, rewrite passed stage checksums or silently change frozen jobs. Existing BYO setup's allowlist recognizes the two optional Support settings and deploys the seventh function only when the complete dedicated group exists. Missing optional capability does not fail existing readiness.

## 5. Anonymous compatibility gate and closure

Current integrated source has no legacy anonymous Support sender; all deployed historical senders are not independently inventoried. Therefore closure is staged outside active discovery at supabase/staged-migrations/close_anonymous_support.sql. It is PREPARED, not deployed or closed. Inventory every deployed build/manual/external sender and record the explicit compatibility decision. Upgrade any legitimate sender first.

After that approval, create a new forward migration using the installed CLI; copy the staged closure into the returned filename, review it, and commit it. Never execute the original guarded review proposal or add the closure to automatic discovery before this gate.

~~~powershell
Set-Location 'C:\Users\ranaz\Desktop\Development\orbito'
& $SupportCli migration new close_anonymous_support_after_compatibility
# Copy the staged SQL into the CLI-returned filename; review and commit it.
& $SupportCli db push --project-ref ukbhyerxshteyetwomqy --dry-run --skip-vault
# After explicit review, apply only the approved forward migration chain.
~~~

Verify effective ACLs (SQL Editor read-only query or your approved CLI query procedure):

~~~sql
select has_table_privilege('anon','public.support_tickets','INSERT') as anon_table_insert,
 has_any_column_privilege('anon','public.support_tickets','INSERT') as anon_column_insert,
 has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE,SELECT,UPDATE') as anon_sequence;
select policyname,cmd,roles from pg_policies where schemaname='public' and tablename='support_tickets';
select tablename,rowsecurity from pg_tables where schemaname='platform_private' and tablename like 'support_ticket_%';
select routine_name,grantee,privilege_type from information_schema.routine_privileges
 where routine_schema='public' and routine_name like 'platform_support_ticket%';
~~~

Before closure the anonymous flags may still be true. After deployment they must all be false, with no anonymous permissive INSERT/ALL policy. Also verify raw private access and intake RPC EXECUTE are denied to anon/authenticated, and staff page/resolution remain available only through canonical live authority. Hosted denied INSERT probes must use an explicitly authorized synthetic client/data plan; no real client impersonation or new support records are authorized by this implementation task.

## 6. Owner smoke acceptance after separate deployment

At orbito.ahwad.com sign in as the canonical Master; check existing client/billing/team screens and Open Shop as Support without changing its handoff contract. Portfolio Manager may view/resolve Support; Billing must not administer it. In the same verified disposable pairing at retrasellshop.ahwad.com:

1. Confirm normal CAPTCHA/login, Owner POS and relevant existing repair/inventory/billing/Paper workflows still operate. New Help & Support appears for Owner/Manager, absent for Cashier/Technician/Orbito Support.
2. Owner creates a synthetic clearly labeled test request; record its opaque ID. Confirm actual central customer, verified provenance/category and creation event. A second explicit lost-response retry with the same UUID/payload returns that same receipt, not a second ticket.
3. Manager creates a request; its own list/get succeeds, another Manager's request is inaccessible. Owner sees both for the current Shop. Test another separately authorized Shop/project to prove cross-tenant denial and repeated user UUID namespace isolation.
4. Portfolio Manager resolves with a customer-visible response. Retry the same revision/response and verify one resolution event/audit only. Owner/author sees the response and timestamp without private staff data. Legacy rows remain labeled unverified.
5. Revoke a synthetic user session and retry its old unexpired JWT: denied. Test inactive employee, mismatched email/role, wrong project/source/binding, forged client/role fields, expired/forged token, suspended/unpaired Shop and stolen credential without a user token. Verify no ticket or billing/provisioning side effects.
6. Rotate/revoke only the dedicated disposable Support credential. Old credential must fail; existing bridge/handoff must keep their own credentials and behavior. Repeat actual BYO enrollment in a genuinely different Supabase account before claiming cross-account acceptance.
7. Verify browser built assets contain neither dedicated secret nor privileged keys. Check generic error/timeout states and preserve the original pending request. Never capture access tokens/headers/message content in telemetry.

These steps may create synthetic records only under your later explicit hosted acceptance authorization. No scenario is a pass merely because its steps are written here.

## Failure and rollback

If deployment/function/proof fails, leave the credential disabled (or revoke it), retain tickets/events and the original enrollment UUID/Vault or protected BYO file, and inspect exact project/history before retry. Lost create responses reconcile by the same request UUID/payload; check ticket history before creating a replacement after a tab is closed. Failed new UI can be reverted to the last compatible frontend under separate deployment approval. Keep additive schema/audit data and fix forward; do not drop ticket/context/event tables or revert canonical security migrations. Do not restore anonymous INSERT. Never reset a completed Shop or rerun owner/bootstrap to repair optional Support.

## Local validation is separate

From Platform: node tests/run-customer-support-local.mjs creates its own labeled Docker network/container and three databases using native PG17/GoTrue migrations/Vault, strips inherited hosted settings, and removes only its owned fixtures. node --test tests/customer-support.test.mjs uses HTTP doubles and the actual handlers. From Shop: node --test tests/customer-support.test.mjs checks UI/client/retry/package behavior. Existing native regression runners are documented in the validation report. None accepts a hosted project URL as its target.
