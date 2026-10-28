> Maintained development workflow: feature work originates from and targets `development`; `main` is off limits for routine work. Follow [AGENTS.md](AGENTS.md) for branch/dependency hygiene and explicit push/merge authorization. No temporary feature branch is a permanent source requirement. Current backend-upgrade guidance and the paired-merge handoff are in [PR6_RELEASE_REPORTING_FIX.md](docs/PR6_RELEASE_REPORTING_FIX.md). Dated PR/hosted status below remains historical evidence, not current branch or deployment authority.
# Orbito Platform

## Later hosted acceptance update —2026-10-17

The [final hosted acceptance and conditional merge decision](docs/PR4_HOSTED_ACCEPTANCE_2026-10-17.md)
supersedes earlier current-status statements below:staging has17 migrations;
config12/support5/provision19 source matches541c46d,D1 source drift resolved;
permanent deletion remains disabled;canonical Pages manual deployment56fa2285
serves541c46d. A06 current-password configuration is directly verified enabled,
not a hosted password-change test. Owner UI/API acceptance,independent reads and
partial provider checks remain separately attributed. Merge is conditionally
owner-authorized subject to gates/checks;production remains NO-GO and before-use
Shop/finance/Support/provider obligations remain. Prior reports are historical.


## Historical PR #4 status — 2026-10-17

RetraSell Platform source is on `feature/platform-team-lifecycle-v2`, reviewed at
`27f6abde0274ac6c989664d0b363504b93128d10`, targeting `development` through
[Draft PR #4](https://github.com/zaighaumrana/orbito/pull/4). All 14 implementation/
correction commits are committed/pushed; this checkpoint adds documentation only.
Development remains `0dbde676ca57ed1599a295e221d274ef080cac41`; staging Pages
serves ad hoc d3fc517, not the latest corrections. Staging has 16 migrations and
12 functions; source 17 remains unapplied. Deletion policy last verified false.

See the [definitive acceptance/deferred register](docs/PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md),
[120 stable cases](docs/PR4_ACCEPTANCE_CASES.csv), [readiness report](docs/PRODUCTION_READINESS_REPORT.md)
and [engineering history](ENGINEERING_HISTORY.md). Employee staging journeys have
scoped owner acceptance, independently corroborated state and separate local tests.
F1/F2/F3/N1/N2/N3 are locally corrected; D1 provisioner drift and hosted integration/
provider/recovery gates remain. Documentation finalization is approved; merge is
not approved and production is NO-GO. Older status below describes its dated era.

## Historical project overview and October4 status


Orbito Platform is the administration application for connected Orbito Shop clients. It manages client accounts, usage billing, payments, module settings, thermal print reporting and paper resupply.

The frontend uses JavaScript and Vite. Supabase provides authentication, PostgreSQL accounting transactions and server-side bridge/configuration functions.

## Current status

As of 2026-10-04, Onboarding V2 is integrated into `developmentv2`; Platform Overhaul V1 and secure one-time support handoff are committed and pushed on `feature/platform-overhaul-v1`. Local HEAD and the live GitHub feature branch match at `a054e28`. The Shop counterpart is also committed and pushed at `68885d4`. Historical reports' local-only wording describes their original checkpoints.

The project owner reports managed provisioning, hosted Shop/custom domain/Turnstile, owner setup, suspension/reactivation and one-time support smoke verified. Reconciliation, concurrent/cross-session recovery, infrastructure destruction, offline Archive, retention and secret-exposure checks remain pending. Do not merge before the hosted smoke gate completes. Local validation and Git status do not independently prove deployment; see [engineering history](ENGINEERING_HISTORY.md) for evidence boundaries.

Billing is usage-only at each client's configured BILL and INVENTORY rates. Each client chooses its own currency; balances in different currencies are displayed separately. THERMAL tracks estimated printing and has no financial charge.

## Documentation

- [Working rules](AGENTS.md) and [engineering history](ENGINEERING_HISTORY.md) — current decisions, evidence and efficient task protocol.
- [Onboarding V2](NEW_CLIENT_ONBOARDING_V2.md), [Overhaul V1](PLATFORM_OVERHAUL_V1.md) and [one-time support handoff](docs/SUPPORT_SESSION_HANDOFF.md) — current setup, lifecycle/recovery and support contracts.
- [Client provisioning and Turnstile setup](docs/CLIENT_PROVISIONING.md) — historical provisioning details; current V2 guidance supersedes older setup paths.

- [Implementation report and deployment checklist](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md) — architecture, billing rules, migration, provisioning, cutover, validation and live acceptance.
- [Full change manifest](docs/ORBITO_CHANGE_MANIFEST.txt) — tracked change summary and new files, including the documentation update.
- [Live smoke-test checklist](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md#validation--live-acceptance).
- [Deployment requirements](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md#deployment-requirements--not-performed).

The V2/overhaul/support documents above establish current contracts. The modernization implementation report and older handoff documents retain historical architecture, validation and rollout evidence; superseding notes distinguish later committed/pushed state from original task results.

## Local development

Install Node.js with npm, then run these commands from the repository root:

~~~sh
npm ci
~~~

Create a local .env.local file with the existing deployment's public frontend configuration:

~~~dotenv
VITE_PLATFORM_URL=https://YOUR_PLATFORM_PROJECT.supabase.co
VITE_PLATFORM_ANON=YOUR_PLATFORM_PUBLIC_ANON_KEY
VITE_PLATFORM_AUTH_EMAIL=YOUR_CONFIGURED_PLATFORM_AUTH_EMAIL
VITE_TURNSTILE_KEY=YOUR_PUBLIC_TURNSTILE_SITE_KEY
~~~

The VITE variables are included in browser code. Use only public configuration here; Shop service-role credentials and bridge secrets belong in server-side secrets. The local environment file is ignored by Git.

~~~sh
npm run dev
~~~

Open http://localhost:4180. Real application operations require the deployed backend and an authorized Platform Auth user with an active operator mapping.

To build and inspect the production frontend:

~~~sh
npm run build
npm run preview
~~~

The build is written to dist. The production preview serves it on port 4180; stop the development server first if it is using that port.

## Read-only sample preview

The development-only /preview.html page uses actual screen renderers with clearly labeled sample data. It does not exercise hosted billing or configuration operations and is not included in the production entry point.

For an isolated sample session on Windows PowerShell:

~~~powershell
$env:VITE_PLATFORM_URL = 'http://127.0.0.1:55440'
$env:VITE_PLATFORM_ANON = 'preview-only'
npm run dev -- --host 127.0.0.1 --port 4181
~~~

Open http://127.0.0.1:4181/preview.html. These dummy environment values apply to the current shell; use a fresh shell with real configuration for live testing.

## Repository layout

| Path | Purpose |
| --- | --- |
| src/ | Administration screens, forms, rendering and retry-safe operations |
| supabase/migrations/ | Existing baseline and additive Platform control-plane migration |
| supabase/functions/platform-bridge/ | Authenticated Shop event ingestion and revision delivery |
| supabase/functions/platform-config/ | Authorized server-side Shop configuration updates |
| supabase/maintenance/ | Guarded reset for the two existing disposable test accounts |
| tests/ | Targeted accounting, authorization, concurrency and compatibility checks |
| docs/ | Implementation, deployment, change manifest and historical handoffs |

## Validation

Run the browser-operation retry tests and frontend build:

~~~sh
node --test tests/operations.test.mjs
npm run build
git diff --check
~~~

Database checks require a disposable local PostgreSQL fixture. Follow the setup in the implementation report before running the SQL or concurrency tests. Never run the fixture bootstrap or test-accounting fixture against a hosted database.

Recorded checks passed for baseline plus migration, source binding and replay conflicts, accounting permissions, exact invoice membership, concurrent ingestion, payments, currency boundaries, paper lifecycle and the frozen Shop billing projection. Both Edge Functions passed syntax transformation. Full Deno type checking and hosted Edge/JWT integration remain unverified.

## Client onboarding

After the one-time setup, use Clients → Add Client → Client Detail → Provision Client → Modules → Verify Setup → Activate Bridge. Master administrators provision connections and manage credentials; existing module and billing roles remain unchanged. Activation requires an explicit paused-write/reconciliation confirmation and captures the actual Shop cutover sequence. Per-client credentials are encrypted in Vault; the legacy server-secret JSON remains a compatibility fallback.

The new platform-provision function automates Management API secret/config setup. One Platform-side dispatcher schedule polls activated managed clients. See the provisioning guide for PLATFORM_MANAGEMENT_TOKEN, Vault/scheduler setup, function deployment and Turnstile's **server-side Supabase Auth CAPTCHA configuration**. The public Turnstile site key is required on localhost as well as deployed domains; offline/network failures leave login disabled with a recovery message.

## Deployment and live smoke testing

For this follow-up, first follow [Client provisioning](docs/CLIENT_PROVISIONING.md#once-per-platform). Apply the **new 20260926234425_client_provisioning.sql migration**, deploy platform-provision, redeploy platform-config, configure the one-time infrastructure and rebuild/deploy the frontend. Earlier modernization checks below are historical; no new automated or hosted tests were run for the provisioning/Turnstile change.

For an environment that has not yet received the original modernization, the earlier deployment sequence remains:

1. Review and apply only the additive migration, 20260925191052_platform_control_plane.sql, and deploy the two Platform Edge Functions with their checked-in JWT settings.
2. Configure operator identities, server secrets, per-client source bindings and currencies.
3. Apply the guarded test-accounting reset for the existing disposable client IDs 1 and 3, before activating their bridges.
4. Coordinate the explicit legacy cutover and enable authenticated bridge polling.
5. Run the report's smoke checklist for usage replay, separate billing/thermal metrics, partial and full payments, module changes and paper fulfilment.

The reset is scoped to those test accounts and refuses modern accounting/bridge activity. It is not a general production cleanup script. The existing baseline migration must remain unchanged.

Local completion does not establish hosted readiness. Record live smoke results after deployment before treating the rollout as accepted.
