# Focused verification — 2026-10-22

## Actually completed locally

- Shop: `node --test tests/final-stabilization.test.mjs` — 4 passed: missing
  Turnstile/shared public validation, deterministic departed Paper continuation,
  fixed diagnostics and additive provenance/unknown function-write fencing.
- Platform: `node --test tests/final-frontend.test.mjs` — 2 passed: public JWT
  boundaries and authorized route restore/late-response isolation.
- Platform: `node tests/byo-guide-browser.mjs --route-only` with bundled Playwright
  and local Chrome — passed direct detail/reload, Historical/reload, Back/Forward,
  missing ID and Manager historical denial. Fixture made no external requests.
- `node tests/milestone-native.mjs` in an owned network-isolated PG17 container —
  passed Shop and Platform forward chains; existing-v2 owner/Auth/reservation/
  business/config/PIN/Vault preservation; verified case/owner vs Manager; approval
  idempotency, single session and replay denial; expiry/revoke, Data API guard,
  RLS helper and privileged Edge authority; consent history and service-only ACLs;
  Platform consent issuance/exchange; exact release catalog, immutable pins;
  guarded anonymous closure and actual column/sequence revocation. Vault/Auth are
  synthetic SQL substitutes, not hosted GoTrue/Vault/PostgREST.
- `node tests/milestone-native.mjs --platform-only` — passed after inserting the
  final v4 catalog fingerprint; omitted already-passed Shop checks.
- `node tests/final-release-parity.mjs` — passed package SHA, every migration and
  embedded source hash against committed Shop Git blobs, all gateways, selectors,
  final SQL allowlist and byte-equivalent preserved legacy artifacts.
- Deno 2.9.6 `check --no-config`: Shop account-admin/login/verify-pin/support-tickets;
  Platform platform-support/platform-provision — passed including imported shared
  dependencies. Initial nonexistent-config invocation was corrected; no deployment.
- Both explicit-public Vite production builds passed with synthetic anon claims
  and widget fixture; no private .env loaded. These outputs are not customer builds.
- `git diff --check` and staged source/private-path/credential-shape review passed.

Native fixture setup applies predecessor migrations to small test databases; no
complete Platform/Shop suite or production simulation was run. Early fixture issues
(SQL identifier/alias, readiness and sole-owner reuse) were corrected; final checks
passed. Lost prior browser output was recovered by the one focused browser run
listed above. No provider success is inferred from an operator-reported receipt.

## Hosted acceptance still required

Separate fresh independent Managed and BYO projects must install the exact final
package. Verify all migration ledger checksums, seven required functions, gateway
settings, required runtime/CAPTCHA secrets and stable request identities. Test
owner invite/login/onboarding, ticket creation/read, owner consent with a verified
case, Managed-only Master handoff, single-use grant and session, expiry and revoke
against actual Data API RPCs/RLS and privileged Edge functions. Confirm effective
request hook reload; an existing custom hook requires reviewed composition.

Exercise Paper, billing, POS and real provider interruption/reconciliation; upgrade
a representative approved historical Shop with before/after ownership, data,
credentials and business snapshots. Independently verify installed historical
sender compatibility before anonymous closure. That closure remains an explicit
release blocker, prepared but unapplied. Final comprehensive security review and
owner acceptance precede any merge/production approval.

Security references: Supabase documents that
[pre-request hooks cover Data API only](https://supabase.com/docs/guides/api/securing-your-api),
so the implementation also uses restrictive RLS and explicit privileged Edge gates.
[PostgreSQL restrictive policies](https://www.postgresql.org/docs/17/sql-createpolicy.html)
combine with existing policies; existing authorization remains necessary.
[Definer-function precautions](https://www.postgresql.org/docs/current/perm-functions.html)
inform empty search paths and explicit grants. Cloudflare documents
[commit-message skips](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message);
actual skip records are recorded in the external final evidence after pushing.
