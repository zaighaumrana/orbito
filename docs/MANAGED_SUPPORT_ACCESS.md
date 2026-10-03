# Managed Shop support access

Local implementation only. No hosted project was queried or changed, and nothing was committed, pushed or deployed.

## Root cause and authoritative values

Managed setup installed the three bridge settings and TURNSTILE_SECRET but omitted PLATFORM_SUPABASE_URL, PLATFORM_SUPABASE_ANON and PLATFORM_AUTH_EMAIL. The existing Shop support login correctly rejects missing configuration before attempting Platform Auth.

The new shared server helper takes the URL from SUPABASE_URL and the anon JWT from SUPABASE_ANON_KEY. It validates the hosted URL and the JWT's anon role and matching project ref. It rejects service-role keys. The email comes from the existing platform_operator_identity RPC under the verified caller JWT: its auth_user_id must equal auth.getUser().user.id, and its authoritative role must be master_admin. That RPC reads email directly from auth.users for auth.uid(); optional username/email aliases, browser parameters and VITE_* values are not used. Existing UUID-based master authorization is preserved.

## Behavior

Future managed setup adds the independently persisted support-auth-config stage after Turnstile and before functions. Previously passed stages keep their skip/checksum behavior. The three support settings are written through the Management API secrets endpoint and their names are checked afterward. They are not frontend environment values.

The master-only repair-support-access route runs before platform_provision_begin. It resolves a completed managed Shop's exact project, binding and immutable owner request from protected Platform state, rejects BYO, Platform itself, retired targets and pending provisioning, then reads the target's version/client/binding/owner request to confirm they match. Its only remote write updates the three support settings. It records intent/result audit and boolean configuration health, without creating or changing provisioning jobs/stages, owner, pairing, onboarding, billing or lifecycle. Repeating the same repair UUID with the same actor/client/pairing is safe.

A forward Platform migration is necessary because the existing database stage allowlist would reject support-auth-config, and the authenticated repair validation/audit RPCs need explicit grants. Existing applied migrations and RBAC identity functions are not changed. No new tables or Shop migration are needed.

Advanced / Technical Details exposes Configure Support Access for an eligible managed Shop to the master administrator. Verified means the trusted write succeeded and all three runtime secret names were present; it does not claim a password login was tested. Future Shop login preflight also reports a protected support_auth_configured boolean, independent of customer readiness. Configuration values never appear in these responses or repair audit entries. Existing support-login identity auditing remains intact.

Customer suspension and support login are unchanged. Regression tests execute the actual login handler: Business Owner is denied while suspended, configured support can sign in, and support is denied when its audit cannot be recorded.

## Current hosted Shop

dexzxxqkbwnpetbsuxxv can use the standalone repair after the Platform migration, function and UI are deployed, provided its live identities match its completed reservation and it has no pending provisioning operation. Validation checks those conditions at execution time. No new managed setup request, Shop migration, function redeployment or owner/bootstrap replay is needed. Existing successful jobs/stages remain unchanged. This implementation has not inspected or repaired that hosted project.

## Changed files

Platform:

- src/client-setup.js
- supabase/functions/_shared/support-auth.ts (new)
- supabase/functions/_shared/managed-setup.ts
- supabase/functions/_shared/shop-release.json (generated approved source artifact)
- supabase/functions/platform-provision/index.ts
- supabase/migrations/20261003174809_managed_support_access.sql (new)
- tests/support-access.test.mjs (new)
- tests/support-access.sql (new)
- tests/overhaul-sql.test.mjs
- tests/platform-overhaul.test.mjs
- tests/onboarding-v2.test.mjs
- docs/MANAGED_SUPPORT_ACCESS.md (new)

Shop:

- supabase/functions/_shared/runtime-preflight.ts
- tests/support-access.test.mjs (new)
- tests/platform-overhaul.test.mjs

The generated release includes the optional runtime boolean. Its unchanged migration checksum alias remains valid; changed function source gets new checksums. Frozen legacy fingerprints are not changed. A pending request whose successful functions use an older artifact still fails closed on an artifact mismatch rather than silently redeploying passed functions. Completed Shop repair bypasses that path entirely.

## Commit and deployment steps afterward

These commands are instructions for the operator, not actions performed in this task. Both branches are feature/platform-overhaul-v1. Review the explicit file list before committing.

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1
git add supabase/functions/_shared/runtime-preflight.ts tests/support-access.test.mjs tests/platform-overhaul.test.mjs
git commit -m "Report optional support auth runtime configuration"

Set-Location C:\Users\ranaz\Desktop\Development\orbito
git add src/client-setup.js supabase/functions/_shared/support-auth.ts supabase/functions/_shared/managed-setup.ts supabase/functions/_shared/shop-release.json supabase/functions/platform-provision/index.ts supabase/migrations/20261003174809_managed_support_access.sql tests/support-access.test.mjs tests/support-access.sql tests/overhaul-sql.test.mjs tests/platform-overhaul.test.mjs tests/onboarding-v2.test.mjs docs/MANAGED_SUPPORT_ACCESS.md
git commit -m "Configure and repair managed Shop support access"
```

Deploy to Platform ukbhyerxshteyetwomqy. The following CLI flags were checked against the cached CLI help. Authenticate using the operator's existing credentials. First preview the migration list: it must contain only 20261003174809_managed_support_access.sql. If it lists other pending migrations, resolve the history separately before proceeding; do not use include-all, seeds or resets.

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\orbito
npx --no-install supabase db push --project-ref ukbhyerxshteyetwomqy --skip-vault --dry-run
npx --no-install supabase db push --project-ref ukbhyerxshteyetwomqy --skip-vault
npx --no-install supabase functions deploy platform-provision --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
npm run build
```

Keep the existing Platform gateway setting (verify_jwt=false); the handler verifies the user and database role itself and retains scheduler authentication. The Platform function's deployment bundles its shared helpers and the approved Shop release. It needs its existing PLATFORM_MANAGEMENT_TOKEN and Supabase runtime values; no new master email secret is required.

Build with the real existing public frontend configuration, including VITE_TURNSTILE_KEY, then deploy the Platform dist through its established frontend deployment workflow. The local public test key used for compilation validation is not a production CAPTCHA key.

In Platform, sign in as the canonical master, open the managed client for dexzxxqkbwnpetbsuxxv, expand Advanced / Technical Details and select Configure Support Access. Expect Verified. Confirm the existing provisioning request remains complete and suspension remains unchanged, then smoke-test owner denial and audited support login while suspended. Do not select managed setup or owner bootstrap for this repair. Existing Shop functions and frontend do not need deployment for support repair; the new probe is included in future approved managed releases.

## Local validation

Relevant Platform handler/UI/stage/SQL tests: 48 passed. Relevant Shop runtime/login/release tests: 16 passed. Full suites: Platform 116 passed, Shop 89 passed, with no skips or failures. Shop npm run build passed. Plain Platform npm run build stopped on missing local VITE_TURNSTILE_KEY; compilation passed with Cloudflare's public test site key set only for the process and output in ignored node_modules/.support-access-build. Both git diff --check checks passed.

SQL runs in disposable in-process PostgreSQL with Auth/Crypto/Vault test substitutes; handler tests mock external API boundaries. They do not claim hosted deployment or password-login smoke-test coverage.
