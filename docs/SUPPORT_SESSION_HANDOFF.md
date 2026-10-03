# One-time Platform support handoff

This replaces the Shop's Platform password login. The confirmed hosted failure was Platform Auth returning `captcha_failed` because the Shop forwarded a valid master password without a Platform CAPTCHA token. Platform CAPTCHA remains enabled and unchanged. Shop customers keep their existing Shop login/CAPTCHA flow.

## Authorization and transport

The authenticated Platform master selects **Clients → Client detail → Open Shop as Support**. The new `platform-support` Edge Function verifies `auth.getUser()` and the existing `platform_operator_identity()` under the caller JWT, requiring the same UUID and canonical `master_admin` role. Browser-supplied actor, email, destination, project or credentials are rejected.

The service-only issuance RPC rechecks canonical identity, locks the registered client and requires Onboarding V2, immutable managed pairing, matching project URL/binding/source and installed bridge credentials. Active and Suspended are eligible. Archived, destroyed, decommissioned and BYO clients are rejected. BYO support handoff is deliberately not enabled in this change.

The server generates 32 cryptographically random bytes, encoded as 64 lowercase hex characters: **256 bits of entropy and exactly 90 seconds lifetime**. Only its SHA-256 hash is persisted in `platform_private.support_grants`, alongside actor UUID, client ID, project ref, binding, source UUID, issuance/expiry and consumption timestamps. RLS is enabled; PUBLIC, anon, authenticated and service_role cannot directly read/write the table. Only the service-only definer RPCs access it.

Platform opens the registered HTTPS Shop origin with `/#support=<opaque-token>`. The Shop reads and synchronously removes the fragment with `history.replaceState` before its boot/configuration/network work. It keeps the token only transiently in memory, never in localStorage/sessionStorage, logs, query parameters or a database. After removal, refreshing resumes an established local session or ordinary login; it cannot exchange the original grant again.

The Shop browser sends only `{mode:'support-handoff',token}` to its own `login` Edge Function. That function obtains client ID, project and binding/source from its server runtime and protected Shop database. It derives the exact Platform endpoint from existing `PLATFORM_BRIDGE_ENDPOINT` and authenticates the server exchange with existing `PLATFORM_BRIDGE_SOURCE_SECRET`. Neither is supplied by the browser. No new Shop secret is required.

Platform hashes the presented source credential and token. The consume RPC authenticates the source hash, locks client then grant, checks expiry/unused status and every client/project/binding/source assertion, and rechecks live lifecycle and canonical master UUID/email. It atomically marks consumption and commits the successful audit in the same transaction. Concurrent requests have one winner; replay fails. A denied exchange commits a redacted failure audit for a known authenticated source and returns a generic denial. Invalid/unrecognized source credentials receive denial without revealing identities or creating untrusted client/actor audit records.

The exchange response contains only the verified assertion: contract/ok, Platform UUID/canonical email, client ID, Shop project, binding and source UUID. It contains no Platform session, anon key, service key, management token, password, source secret or plaintext grant. The Shop checks every assertion against local trusted state, then reuses `bootstrapSupportSession`: local Orbito Support identity, generated magic link/verifyOtp, and mandatory `support_access_log`. Audit failure denies the session response. Only local Shop session credentials reach the Shop browser.

The old `mode:'support'` password endpoint is denied, the Shop support button now explains how to open from Platform, and mapped local Support identities cannot use the ordinary password route. Support remains exempt from Shop suspension; Business Owner/staff/customer login remains blocked. No owner bootstrap, lifecycle/billing operation, provisioning job or Shop migration is part of handoff.

## Audits and compatibility

Platform records `support_grant_issued`, `support_grant_consumed` and `support_grant_failed` with client, actor and existing audit timestamp. Issuance includes grant UUID and expiry; failures include grant UUID when known and a fixed reason. No audit contains token or key values/hashes. The unchanged Shop audit records Platform UUID, canonical email, local support auth UUID, `support_login` and user agent.

Already-installed `PLATFORM_SUPABASE_URL`, `PLATFORM_SUPABASE_ANON` and `PLATFORM_AUTH_EMAIL` are preserved. The handoff no longer reads any of them, and does not depend on the server Management token or a Platform public anon JWT. All three can be deprecated together in a later coordinated cleanup of the compatibility provisioning stage, Configure Support Access repair, legacy runtime flag and documentation. This change leaves those compatibility paths in place; the legacy `support_auth_configured` boolean reports legacy settings presence, not a handoff smoke-test result.

The approved Shop source artifact was regenerated using the existing builder so future managed installs include the new login/helper. All 32 Shop migrations and gateway JWT settings are unchanged; changed function files receive new checksums, and frozen shipped fingerprints remain unchanged. A pending provisioning request with a passed old function checksum still fails closed on an artifact mismatch. Do not rerun managed setup on a completed Shop to adopt handoff.

## Files

Platform:
- `src/client-setup.js`, `src/events.js`, new `src/support-handoff.js`: eligible master button and transient fragment transport.
- `supabase/config.toml`, new `supabase/functions/platform-support/index.ts`: master-authenticated issuance and source-authenticated exchange.
- New `supabase/migrations/20261003230535_support_session_handoff.sql`: private hash-only grants, canonical identity helper and service-only issue/consume RPCs.
- `supabase/functions/_shared/shop-release.json`: regenerated approved Shop source artifact.
- `tests/overhaul-sql.test.mjs`, new `tests/support-handoff.sql`, `tests/support-handoff.test.mjs`, `tests/support-handoff-postgres.test.mjs`: SQL safety/ACLs, handlers, UI and real overlapping PostgreSQL transactions.
- This document; the older managed-support-access document now links here as superseded login guidance.

Shop:
- `src/auth.js`, `src/shared.js`: remove password support mode and prevent accidental use of that route.
- `src/main.js`, new `src/support-handoff.js`: immediate fragment removal, starting/error state and canonical support session routing.
- `supabase/functions/login/index.ts`, new `supabase/functions/_shared/support-handoff.ts`: trusted server exchange and existing audited bootstrap.
- `tests/onboarding-v2.test.mjs`, `tests/support-access.test.mjs`, `tests/platform-overhaul.test.mjs`, new `tests/support-handoff.test.mjs`: regression coverage and fixture/release expectations.

## Deployment afterward — instructions only

Nothing has been committed, pushed, deployed or applied to hosted Supabase by this task. Both branches are `feature/platform-overhaul-v1`.

1. Review both repo diffs and apply **only** new forward Platform migration `20261003230535_support_session_handoff.sql` through the normal reviewed migration process. Applied migration `20261003174809_managed_support_access.sql` is unchanged. No Shop migration is needed. Verify there are no unrelated pending migrations before any database push.
2. Deploy new Platform `platform-support` with gateway JWT verification disabled. Its handler authenticates master JWT issuance or opaque Shop source exchange itself:

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\orbito
npx --no-install supabase functions deploy platform-support --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
```

3. Deploy only the updated Shop `login` function (bundles its shared helper). Keep its existing `verify_jwt=true`; do not use `--no-verify-jwt` for Shop login. Existing pairing endpoint/source credential must remain installed:

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\Orbitoshopv2-v1
npx --no-install supabase functions deploy login --project-ref dexzxxqkbwnpetbsuxxv --use-api
```

4. Build and publish both updated frontends through their existing hosting process using real public production configuration. Do not publish a build using the process-only Turnstile test key. Deploy Shop frontend before enabling the Platform support button for operators.
5. For **future managed installations**, redeploy Platform `platform-provision` so it bundles the regenerated approved Shop release:

```powershell
Set-Location C:\Users\ranaz\Desktop\Development\orbito
npx --no-install supabase functions deploy platform-provision --project-ref ukbhyerxshteyetwomqy --use-api --no-verify-jwt
```

There is no need to redeploy Shop bridge/other functions, reinstall compatibility secrets, replay owner/bootstrap, create another provisioning job or change suspension on the current Shop.

**Test 4 can be rerun on existing `dexzxxqkbwnpetbsuxxv` after the migration, functions and both frontends are deployed.** Sign in on Platform with its normal CAPTCHA as canonical master, open the suspended managed client's detail, select Open Shop as Support and enter within 90 seconds. Expect local Orbito Support access and both audits while suspension and completed onboarding remain unchanged. Confirm Business Owner login remains blocked, and copied/replayed/expired handoff links are denied. This task has not contacted that hosted Shop, so live pairing validity is checked at issuance/exchange rather than asserted here.

## Local verification

The new grant SQL runs under the full forward Platform chain in disposable in-process PostgreSQL; Auth/Crypto/Vault there are test substitutes. An additional disposable PostgreSQL 18 cluster bound to `127.0.0.1` exercises two separate overlapping backend transactions with real row locks and pgcrypto, proving exactly one consumption/audit and denied replay. Vault and Auth identity fixtures remain local substitutes. Handler tests execute actual Edge code with mocked external boundaries. No hosted smoke test is claimed.

Run full suites with `node --test tests/*.test.mjs` in each repo. To opt into the real local concurrency test, supply only a disposable local PostgreSQL port through `ORBITO_LOCAL_SUPPORT_TEST_PORT`, plus `ORBITO_LOCAL_PSQL` when psql is not on PATH. The test hardcodes localhost, creates/drops its own disposable test database, and accepts no hosted database URL.

Final validation: relevant Platform SQL/handler/UI tests and the dedicated real PostgreSQL concurrency test passed; 34 relevant Shop tests passed. Full Platform suite: **128 passed, zero failures/skips**, including the real concurrency test. Full Shop suite: **93 passed, zero failures/skips**. Both `npm run build` commands passed; Platform used process-only public test Turnstile key `1x00000000000000000000AA`. Both `git diff --check` checks passed. Platform emitted its existing Vite deprecation/mixed-import warnings. The disposable local PostgreSQL server was stopped after testing. Hosted services were not contacted or mutated.
