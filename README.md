# Orbito Platform

Orbito Platform is the administration application for connected Orbito Shop clients. It manages client accounts, usage billing, payments, module settings, thermal print reporting and paper resupply.

The frontend uses JavaScript and Vite. Supabase provides authentication, PostgreSQL accounting transactions and server-side bridge/configuration functions.

## Current status

The owner reports the original control-plane migration and platform-bridge/platform-config are deployed. The new client provisioning and Turnstile follow-up is implemented locally and awaits manual deployment and acceptance. Its new SQL and Edge code have not been runtime-tested. The connected Shop repository remains a read-only compatibility reference.

Billing is usage-only at each client's configured BILL and INVENTORY rates. Each client chooses its own currency; balances in different currencies are displayed separately. THERMAL tracks estimated printing and has no financial charge.

## Documentation

- [Client provisioning and Turnstile setup](docs/CLIENT_PROVISIONING.md) — current onboarding workflow, one-time infrastructure, credential rotation and recovery.

- [Implementation report and deployment checklist](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md) — architecture, billing rules, migration, provisioning, cutover, validation and live acceptance.
- [Full change manifest](docs/ORBITO_CHANGE_MANIFEST.txt) — tracked change summary and new files, including the documentation update.
- [Live smoke-test checklist](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md#validation--live-acceptance).
- [Deployment requirements](docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md#deployment-requirements--not-performed).

The implementation report is the current reference. Older handoff documents in docs are retained for historical context and carry superseded-reference banners.

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
