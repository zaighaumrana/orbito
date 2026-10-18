# Customer Support implementation validation — 18 October 2026

## Scope and source identity

Platform base: 23a157a5c2aa581eec6e0f02b97318c784296e79, feature/verified-customer-support-platform. Shop base: f91f02819a9f2909062e36140f1775a870009115, feature/verified-customer-support-shop. Both remote development heads were rechecked and unchanged before delivery. The PR descriptions record final implementation SHAs. No main/deployment checkout, commit, push, merge, tag, release or settings change was performed. Initial trees were clean; existing other worktrees were left alone. The four original investigation documents were read and preserved.

## Executed results

| Check | Baseline | Final implementation |
|---|---|---|
| Platform existing unit/handler/simulation set, plus new Support groups | 301/302 pass, 1 failure | 309/310 pass, same baseline failure |
| Shop all existing .test.mjs files, plus new Support groups | 92/93 pass, 1 failure | 100/101 pass, same baseline failure |
| Actual new Platform + Shop HTTP handlers | N/A | 8/8 groups pass; injected HTTP transports, no provider network |
| Shop Support client/renderer/role/package/installer | N/A | 8/8 groups pass |
| New native PostgreSQL 17 + real GoTrue schema + Vault, three independent databases | N/A | 7/7 groups pass; actual SQL/ACLs/transactions/concurrent connections |
| Existing PR #4 native security campaign | N/A | 8/8 groups pass |
| Existing Platform login/Add Client browser campaign | N/A | 6 viewport/theme groups pass; actual modules, synthetic SDK/CAPTCHA |
| New Platform Support browser integration | N/A | PASS: Master/Manager/Billing navigation, provenance, resolution/revision, pagination, escaping, responsive layouts |
| New Shop Support browser integration | N/A | PASS: actual admin form, lost-commit retry, one receipt, escaped details/resolution, Owner/Manager navigation, responsive layouts |
| Both Vite production builds | PASS | PASS |
| Browser privileged key scan | N/A | No service_role JWT, Support secret variable or Management token variable found in built JS |
| Whitespace/syntax/import checks | N/A | PASS; Node 24 parses/imports actual TypeScript handler modules |

The full unit set excludes opt-in Platform files whose documented entry point requires a provisioned native container/CLI path (postgres, database, production-bootstrap). These are separate native campaigns, not silently counted as unit passes. A first indiscriminate invocation from the parent workspace demonstrated those prerequisites and wrong-working-directory child imports; the baseline counts above use each repository's proper cwd. No test expectation was weakened and no existing test was removed or skipped to obtain a result.

### Native Support groups (actual implementation)

1. Full migration chains in one central and two Shop databases; confirmed/current-session/current-user/role/employee/email/lifecycle authorization. Same Auth user UUID in two projects produces separate source namespaces.
2. Atomic create/context/event/budgets; same request retry; actor/payload conflict; Manager own-ticket privacy; Owner Shop scope; cross-customer opaque-ID denial; financial bridge credential rejection; no payment/invoice/bridge/provision side effects; creation-audit failure rollback.
3. Canonical staff ceilings; Billing denial; optimistic audited resolution; equivalent retry; customer response projection; resolution/operator-audit failure rolls back status/revision/event; legacy compatibility wrapper; raw browser UPDATE denied; legacy provenance stays unverified.
4. Two independent concurrent duplicate submissions converge on one receipt; source and actor quotas; accepted retries remain free.
5. Master-only disabled preparation, same-enrollment replay/conflict, separate read/create scopes, rotation/revocation, active-key re-pair invalidation and central suspended/archived/destroyed/decommissioned denials.
6. Managed generation and one protected Vault value, exact digest consistency, same-ID recovery, idempotent install dispatch/ack audit and disabled/unverified status, revocation hides material. BYO stores only its externally prepared hash.
7. Focused staged anonymous closure proves effective table/column/sequence denial and removes the legacy policy in the disposable database; all new private tables have RLS and no raw anon/authenticated/service_role access.

Native infrastructure: Docker Desktop Linux engine 29.8.0; cached Supabase postgres:17.6.1.155 and GoTrue:v2.197.0; actual Auth migration schemas and Vault extension. Storage/Realtime fixture tables model required prerequisites; this campaign does not test those providers. Owned labeled container/network and all three synthetic databases are removed by the runner. No hosted URL or saved .env selects a test database.

### Existing PR #4 native groups

PASS F1 retirement/new identity/activation collision behavior; F2 protected support destination approval/public URL isolation/direct-role denial/one-use/expiry/pair/reapproval; F3 delayed/duplicate/uncertain configuration and stale payloads; forward-17 retained rows and late-failure rollback; N2 outstanding legacy reservation abort; N2 queued legacy writer fencing; two concurrent editor client-lock serialization; exact frozen-journal SQL same-ID recovery after later writes. These preserve current canonical identity/lifecycle/configuration/handoff protections; no claim is made about every hosted employee journey.

### Browser scope

Pinned ignored local Playwright 1.56.1 with installed Chrome 155; headless temporary contexts, all non-loopback requests blocked. New Support campaigns use actual production admin/render/client/event modules with explicitly synthetic SDK transport, not a hosted backend. 320/768/1440px pass; existing login/Add Client also passes both light/dark themes. The new pages introduce no global styles. Provider CAPTCHA and real sign-in are not exercised by these browser fixtures.

## Baseline failures and incomplete established campaigns

1. tests/overhaul-sql.test.mjs, 'Platform full forward chain: lifecycle, unknown operations, stage retry, RBAC and retained history': both baseline and final fail in platform_config_recovery with 'Unknown remote configuration requires verified read-back; cannot close blindly'. The full new migration parses/replays before that unchanged fixture path. Do not weaken the verified read-back guard. This old fixture needs a separate compatibility correction/review.
2. Shop tests/platform-overhaul.test.mjs, 'approved server release exactly matches current migrations and all six function gateway settings': baseline and final find drift in the already accepted _shared/runtime-preflight.ts bytes embedded in the existing approved artifact. The accepted Platform _shared/shop-release.json, Shop shared runtime source and privileged handoff source were not changed. The new optional Support artifact is separate and is checked against the reviewed current source; its source files normalize LF. Do not silently replace the accepted artifact to hide the old gate.
3. Existing tests/run-support-local.mjs fails 'Explicit current Master-approved support destination required'. Reproduced independently from an archive of the exact original development commit with the same result. Its fixture predates the protected approval prerequisite; the handoff implementation itself is unchanged. PR #4's focused protected-destination group passes. Correct the old fixture separately before claiming the entire legacy handoff native runner passes.
4. The broad tests/run-platform-team-local.mjs campaign timed out in an eight-minute child-suite limit on this Windows/Docker environment. Completed subgroups were not independently captured by that parent and are not counted. The focused --pr4-security-only campaign passed all eight groups afterward. Other opt-in production bootstrap, complete team/lifecycle/read projection/PostgREST and actual CLI atomicity campaigns remain incomplete this session.

These are explicit review gates, not a claim that every established test is green. The PRs remain Draft and are not labeled production-ready.

## Not executed / before-use gates

Hosted migrations/functions/secrets/Auth/pairing/provisioning were forbidden and were not executed. Actual new function deployment, Supabase gateway/public-key propagation, real user-token HTTP verification and logout revocation across two deployed projects, real managed Management API secret installation, different-account BYO installation, hosted browser journeys, provider/Vault recovery across outages and actual deployed sender inventory remain pending. Node import/syntax checks are not Deno static type checking or Edge runtime deployment. No Android device smoke was performed. Existing POS/repair/inventory/returns/thermal/Paper/bridge/entitlement checks passed within their available unit/simulation scope; no unexecuted provider/device journey is presented as passed.

The anonymous closure is prepared outside active discovery; it is not applied to staging and the historical vulnerability is not claimed closed. Full deployed historical sender compatibility is unresolved. Future candidate release promotion and production/backend/application rollout require the owner's separate acceptance.

## Reproduction and local evidence

Evidence is retained outside the repositories at C:\Users\ranaz\Desktop\Development\Support ticket\implementation-evidence. Key logs: platform-unit-baseline.log, shop-unit-baseline.log, platform-unit-final.log, shop-unit-final.log, support-native-final.log, platform-pr4-security.log, support-handoff-native.log, support-handoff-native-baseline.log, platform-browser-existing.log, platform-support-browser.log, shop-support-browser.log, platform-build-final.log, shop-build-final.log. The baseline archive contains only tracked tests/supabase source from origin/development, never .env or customer state. Early failed attempts are diagnostic history; the final filenames above are the acceptance runs.

From Platform: npm run test:support and npm run test:support:native. Existing security: node tests/run-platform-team-local.mjs --pr4-security-only. From Shop: npm run test:support. Full unit commands used Get-ChildItem tests -Filter '*.test.mjs' and node --test with the documented Platform native-file exclusions above. Both repositories: npm run build and git diff --check.

Browser runtime setup (ignored, no application dependency change): from Platform run npm install --prefix node_modules/.support-test-runtime --no-save --package-lock=false --ignore-scripts playwright@1.56.1. Set PLAYWRIGHT_MODULE_PATH to that absolute playwright/index.mjs and CHROMIUM_EXECUTABLE_PATH to an installed Chrome executable. Run node tests/customer-support-browser.mjs from each repository; node tests/ui-polish-browser.mjs from Platform. The tests accept only loopback Vite origins and abort external browser requests.

Candidate: supabase/releases/shop-release-support-v1.json, 33 migrations and 7 functions. Internal canonical JSON SHA256: e4cab486e51833d92d91ec68720fa1693c199f5a21dfe52405c79b0aeacf7d7f. File transport SHA256 (LF): 2df724d489c68425d4e67ce30f4c621711df755d5d50080c443a69c5b913a710. The accepted six-function artifact remains unchanged. Candidate test asserts exact current normalized source and reproducible build output.

The split-operator BYO regression additionally executes a copied installer in a standalone Shop checkout with no sibling Platform repository; private generation succeeds without customer privileged authority leaving the machine.

## Deployment delivery

New active migrations, in their separate project chains: Platform 20261018000612_verified_customer_support.sql; Shop 20261018000617_customer_support_actor.sql. Staged only: close_anonymous_support.sql, to be promoted with a fresh CLI migration after compatibility approval.

New Edge Functions: Platform platform-support-tickets and platform-support-enrollment; Shop support-tickets. No existing Edge Function was modified. Existing frontend Support administration is extended; Shop adds Help & Support for Owner/Manager only. All configuration/setup changes are source controlled. Follow CUSTOMER_SUPPORT_DEPLOYMENT.md for exact project references, CLI-2.120.0 flags, managed/BYO enrollment, platform-first ordering, current-client versus future package handling, closure timing, verification and rollback. No hosted Supabase or Cloudflare resources were changed.

References checked: Supabase's current Edge auth-header/session documentation and changelog index. The October TLS deprecation is limited to old CBC client stacks; this implementation uses the runtime's normal modern HTTPS fetch and does not change TLS configuration. See https://supabase.com/docs/guides/functions/auth-headers and https://supabase.com/docs/guides/auth/sessions.
