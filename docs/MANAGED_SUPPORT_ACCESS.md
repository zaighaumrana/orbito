# Managed Shop support access

The password-login design described below is superseded by [one-time Platform support handoff](SUPPORT_SESSION_HANDOFF.md). The three-setting repair remains available for compatibility; current support entry uses the new handoff, requires the new Platform migration/function and updated Shop login/frontends, and does not call Platform password Auth. Use the linked handoff document for current deployment and Test 4 instructions.

Local implementation only. No hosted project was queried or changed, and nothing was committed, pushed or deployed.

## Root cause and authoritative values

Managed setup installed the three bridge settings and TURNSTILE_SECRET but omitted PLATFORM_SUPABASE_URL, PLATFORM_SUPABASE_ANON and PLATFORM_AUTH_EMAIL. The existing Shop support login correctly rejects missing configuration before attempting Platform Auth.

The first support repair implementation assumed SUPABASE_ANON_KEY was a legacy JWT. A modern publishable runtime key caused the generic "Canonical Platform support authentication configuration is unavailable" failure before the three support settings were written.

The corrected shared server helper takes the URL only from SUPABASE_URL and extracts its exact 20-letter hosted project ref. Using the server-only PLATFORM_MANAGEMENT_TOKEN, it checks GET /v1/projects/{ref}/api-keys/legacy for enabled legacy keys and reads GET /v1/projects/{ref}/api-keys?reveal=true. The shared public-api-key selector returns only a three-part legacy JWT named anon with role=anon and ref matching that project. It rejects expired/not-yet-valid JWTs, wrong-project JWTs, service-role/secret keys and opaque publishable keys. The runtime SUPABASE_ANON_KEY is not a support-configuration source. The complete API response never leaves server code. These endpoints are documented in the [Management API key reference](https://supabase.com/docs/reference/api/v1-get-project-api-keys) and [legacy-key enabled-state reference](https://supabase.com/docs/reference/api/v1-get-project-legacy-api-keys).

The email still comes from the existing platform_operator_identity RPC under the verified caller JWT: its auth_user_id must equal auth.getUser().user.id, and its authoritative role must be master_admin. That RPC reads email directly from auth.users for auth.uid(); optional username/email aliases, browser parameters and VITE_* values are not used. Existing UUID-based master authorization is preserved. Errors now distinguish master identity unavailable, Platform project identity invalid, and Platform public anon JWT unavailable, without including values or remote error bodies.

## Behavior

Future managed setup adds the independently persisted support-auth-config stage after Turnstile and before functions. Previously passed stages keep their skip/checksum behavior. The three support settings are written through the Management API secrets endpoint and their names are checked afterward. They are not frontend environment values.

The master-only repair-support-access route runs before platform_provision_begin. It resolves a completed managed Shop's exact project, binding and immutable owner request from protected Platform state, rejects BYO, Platform itself, retired targets and pending provisioning, then reads the target's version/client/binding/owner request to confirm they match. Its only remote write updates the three support settings. It records intent/result audit and boolean configuration health, without creating or changing provisioning jobs/stages, owner, pairing, onboarding, billing or lifecycle. Repeating the same repair UUID with the same actor/client/pairing is safe.

The original support-access migration supplied the persisted stage and guarded repair/audit RPCs. This public-key resolution correction requires no migration, and does not modify applied migration 20261003174809_managed_support_access.sql, RBAC, the Shop release, or Shop code.

Advanced / Technical Details exposes Configure Support Access for an eligible managed Shop to the master administrator. Verified means the trusted write succeeded and all three runtime secret names were present; it does not claim a password login was tested. Future Shop login preflight also reports a protected support_auth_configured boolean, independent of customer readiness. Configuration values never appear in these responses or repair audit entries. Existing support-login identity auditing remains intact.

Customer suspension and support login are unchanged. Regression tests execute the actual login handler: Business Owner is denied while suspended, configured support can sign in, and support is denied when its audit cannot be recorded.

## Current hosted Shop

dexzxxqkbwnpetbsuxxv can use the same Configure Support Access button again after only the corrected Platform platform-provision function is redeployed. Its live identities must still match its completed reservation, it must have no pending provisioning operation, and the server Management token must have read access to Platform's enabled legacy API keys plus the existing target permissions. Validation checks those conditions at execution time. No new managed setup request, migration, Shop function deployment or owner/bootstrap replay is needed. Existing successful jobs/stages remain unchanged. This implementation has not inspected or repaired that hosted project.

## Files changed by this public-key correction

Platform:

- supabase/functions/_shared/public-api-key.ts (new shared selector)
- supabase/functions/_shared/support-auth.ts
- supabase/functions/_shared/managed-setup.ts
- tests/support-access.test.mjs
- tests/platform-overhaul.test.mjs
- docs/MANAGED_SUPPORT_ACCESS.md

No Shop files changed. Existing managed public environment still returns the Shop's public anon JWT through the same shared selector, with an additional exact-project check. Tests cover its public response and rejection of wrong-project keys.

The generated release includes the optional runtime boolean. Its unchanged migration checksum alias remains valid; changed function source gets new checksums. Frozen legacy fingerprints are not changed. A pending request whose successful functions use an older artifact still fails closed on an artifact mismatch rather than silently redeploying passed functions. Completed Shop repair bypasses that path entirely.

## Commit and deployment steps afterward

These commands are instructions for the operator, not actions performed in this task. Platform branch: feature/platform-overhaul-v1. Review the explicit file list before committing.

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\orbito
git add supabase/functions/_shared/public-api-key.ts supabase/functions/_shared/support-auth.ts supabase/functions/_shared/managed-setup.ts tests/support-access.test.mjs tests/platform-overhaul.test.mjs docs/MANAGED_SUPPORT_ACCESS.md
git commit -m "Resolve support anon JWT through Platform Management API"
```

Redeploy only platform-provision to Platform ukbhyerxshteyetwomqy. The following CLI flags were checked against the cached CLI help. Authenticate using the operator's existing credentials. No database push, migration application, Shop deployment or frontend deployment is needed for this correction.

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\orbito
npx --no-install supabase functions deploy platform-provision --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
```

Keep the existing Platform gateway setting (verify_jwt=false); the handler verifies the user and database role itself and retains scheduler authentication. The Platform function's deployment bundles its shared helpers and the approved Shop release. It needs its existing PLATFORM_MANAGEMENT_TOKEN and Supabase runtime values; no new master email secret is required.

The local public test Turnstile key is only for compilation validation and is not a production CAPTCHA key.

In Platform, sign in as the canonical master, open the managed client for dexzxxqkbwnpetbsuxxv, expand Advanced / Technical Details and select Configure Support Access. Expect Verified. Confirm the existing provisioning request remains complete and suspension remains unchanged, then smoke-test owner denial and audited support login while suspended. Do not select managed setup or owner bootstrap for this repair. Existing Shop functions and frontend do not need deployment for support repair; the new probe is included in future approved managed releases.

## Local validation

Key-resolution correction validation: 61 relevant Platform tests passed; the full Platform suite passed 122 tests with no failures or skips. npm run build -- --outDir node_modules/.support-access-build passed with process-only VITE_TURNSTILE_KEY=1x00000000000000000000AA. git diff --check passed. Build output stays in that ignored directory. No hosted API requests or mutations are made by the test fixtures.

SQL runs in disposable in-process PostgreSQL with Auth/Crypto/Vault test substitutes; handler tests mock external API boundaries. They do not claim hosted deployment or password-login smoke-test coverage.
