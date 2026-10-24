# Support automation and release acceptance — 2026-10-19

This implementation is staged. No hosted project, owner, pairing, migration,
function or Cloudflare deployment was changed by this engineering round.
The owner separately reported a successful manually enrolled Client 2 ticket
lifecycle. That historical evidence does not prove the new automatic workflow.

## Immutable release selection

| Package | Migrations / functions | Internal SHA-256 | State |
|---|---|---|---|
| `_shared/shop-release.json` | 32 / 6 | `7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940` | Accepted, unchanged, active |
| `supabase/releases/shop-release-support-v1.json` | 33 / 7 | `0c3298e97a1b9f479170644281499f9e6a0155209eedb9f242b1bcf85c7bcc01` | Earlier candidate, unchanged |
| `supabase/releases/shop-release-support-v2.json` | 34 / 7 | `144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414` | New inactive candidate |

`supabase/releases/active-shop-release.json` still selects accepted-v1.
The registry validates the package digest. Each managed job records its release
ID and digest before artifact work. Existing jobs with stage records are pinned
to the accepted package. Once pinned, deployment code must retain that exact
package for retries; changing the active pointer cannot change the job.

Owner review command (read-only):

```text
node scripts/promote-shop-release.mjs support-v2 144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414 --review
```

Only after separate owner approval, replacing `--review` with `--apply` changes
the LOCAL pointer. Review/commit that change and deploy through the approved
release procedure. This utility never deploys. Retain accepted-v1 for in-flight
jobs even after promotion; rollback the pointer for new jobs rather than replacing
any accepted artifact or rewriting migration history.

## Managed lifecycle

Deploy the new Platform forward migration
`20261019000019_support_automation_release_fences.sql` and updated Platform
`platform-provision`, `platform-support-enrollment`, and `platform-support-tickets`
only through the owner-approved release. Preserve existing gateway settings.
The customer Support functions retain JWT gateway verification; the existing
bridge/handoff compatibility settings are unchanged.

The base managed job deploys the six required functions and finishes normally.
The optional Support function is installed by the post-prerequisite lifecycle,
so its failure cannot hold the POS provisioning job open. Support is not added
to the mandatory POS preflight.

After job completion, the existing Master setup/status workflow and Master
client refresh automatically reconcile optional Support. Every server stage
revalidates the current canonical Master/session, client/project/source/binding,
active bridge, active confirmed owner, completed Shop onboarding and absence of
an unfinished provisioning job. No Master JWT is saved, scheduled or forwarded
to a Shop. The scheduler has no synthetic Master authority.

Before promotion, eligible clients show **Waiting for prerequisites** with the
explicit release approval reason. Existing enabled credentials are preserved;
automatic reconciliation never rotates an owner-enrolled key.

After promotion, reconciliation verifies provider project identity, checks the
live Shop owner and exact migration prefix/source hashes, adds only missing
Support migrations, deploys only `support-tickets`, verifies Shop installation
readiness, prepares one disabled credential, installs the stable Vault secret,
verifies a fresh nonce/HMAC proof of the exact project/source/binding/client and
Platform endpoint, and then enables the credential. Proof includes readiness
version 2 and confirmed-owner/completed-onboarding status.

The durable journal is associated with a completed base provisioning request
and a stable enrollment UUID. It pins the Support package fingerprint on first
work. Its states are waiting, preparing, installing, verifying, enabled,
attention and revoked. Portfolio Managers can read safe status but have no
credential actions. BYO enrollment uses a distinct customer-authorized path.

## Uncertainty and recovery

- **Waiting:** finish base provisioning, active pairing, confirmed owner and
  onboarding; or obtain release promotion approval. Refresh owner/runtime first
  if Platform health is stale.
- **History attention:** unexpected versions, gaps, missing history or different
  migration statements stop before credential writes. Review/adopt history in a
  separate owner-approved procedure. CLI statement splitting can differ from the
  exact source ledger: do not repair versions or normalize fingerprints to bypass
  the gate. Never reset or bootstrap an initialized Shop.
- **Provider attention:** check exact project access and the recorded stage.
  Retry/reconcile the same enrollment, package and Vault secret.
- **Proof pending:** a deployment response or secret-write acknowledgement does
  not enable a key. Refresh/reconcile; exact proof can recover an installed key.
- **Uncertain write:** the shared manual/automatic dispatch fence allows only one
  external secret-write attempt. A timeout does not expire this fence. Another
  worker cannot dispatch a replacement or rotate the credential. If the same key
  proves installed it may be enabled, while rotation remains fenced.
- **Provider completion reconciliation:** use the Master-only expanded control
  only after obtaining evidence that the original provider request finished and
  no late write remains pending. Supply its reference, a reason and explicit
  confirmation. This is audited. Elapsed time or a matching current secret is
  insufficient. The provider supplies no cross-request ordering/idempotency
  guarantee; automatic expiry would be unsafe. A late acknowledgement must match
  the original recorded attempt. Central credential revocation remains available.
- **Revoked/pairing changed:** stop. Review lifecycle and pairing. Automatic work
  cannot resurrect a retired client or replace a changed pairing.

Support optional errors are returned separately from successful base setup and
do not suppress the business client view. If the new status RPC is absent, the
UI reports status unavailable rather than assuming enrollment succeeded.

## Different-account BYO

Follow the complete customer procedure in the Shop repository's
`docs/SUPPORT_AUTOMATION.md`. The customer uses their own CLI account, explicit
project and approved release fingerprint. Fresh installs apply the full chain;
existing installs add Support without replacing base functions, owner or secrets.
Client 1 is explicitly excluded. Keep pairing and runtime files outside both
repositories and retain them during uncertainty.

After confirmed owner activation and onboarding, the customer creates/retains a
dedicated Support secret locally, installs it through their CLI, and exports only
the hash enrollment file plus exact public target metadata. The Master selects
that file in Client Detail → Customer Support, supplies the Shop public anon JWT
and selects **Prepare & verify Support**. The existing authenticated SDK session
is used; no Master JWT copying is required. The hash remains transient and is
never rendered, logged or stored in browser state. The server validates the exact
pairing and proof before enabling. Retry the same file/UUID after failures.

Customer PATs, database passwords, service-role keys and Support plaintext never
go to Platform. A public anon key does not grant Management API access. Privileged
Open Shop as Support remains a separate, managed-only handoff permission.

## Public build safeguard

Both repositories provide `scripts/build-verified.mjs`. Supply an explicitly
reviewed JSON file containing only their documented public Vite variables, then:

```text
node scripts/build-verified.mjs --config PUBLIC_CONFIG_JSON --project-ref EXACT_REF
node scripts/build-verified.mjs --config PUBLIC_CONFIG_JSON --project-ref EXACT_REF --verify-dist
```

The clean build reads no `.env`, removes inherited Vite inputs, checks project
and anon JWT role/ref/expiry, and emits `dist/retrasell-build.json` with public
configuration and asset digests. Verification refuses stale targets or changed
assets. Platform inputs: VITE_PLATFORM_URL, VITE_PLATFORM_ANON,
VITE_TURNSTILE_KEY; optional VITE_PLATFORM_AUTH_EMAIL is not authority. Shop
inputs: VITE_SUPABASE_URL, VITE_SUPABASE_ANON, VITE_TURNSTILE_SITE_KEY.
No server secret belongs in these inputs. Wrangler uploads compiled `dist`;
changing dashboard variables cannot repair an already compiled local bundle.
This round tested synthetic builds only and did not upload them.

## Validation and approval boundary

The evidence folder contains native PostgreSQL 17/Auth/Vault security checks,
actual Edge handler/orchestration tests with explicit provider doubles, real
app/router browser tests, before/after Platform screenshots, Deno checks, and
Supabase Edge Runtime v1.77.4 ESZIP bundling. Local tests do not prove hosted
Management permissions, gateway deployment, CAPTCHA hostname, SMTP, DNS/TLS,
cross-account CLI authorization, or real provider failure recovery.

The Shop's frozen accepted-release byte comparison remains deliberately red.
Historical newline drift in three files remains documented. The new candidate
also contains a type-only public-schema annotation correction in login; the
accepted package is not rewritten to accommodate it. Anonymous legacy intake
closure stays in staged-migrations and is not activated.

Owner acceptance order: review commits/evidence → approve promotion/deployments
→ personally provision a fresh managed Shop → verify automatic enrollment and
ticket/resolution/POS/login regressions → onboard a genuinely different-account
BYO Shop → separately decide legacy anonymous closure and wider rollout. Draft
PRs remain unmerged until those gates are met.
