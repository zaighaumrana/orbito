# Customer Support stabilization validation — 19 October 2026

This ledger supersedes the initial 18 October implementation totals. Both PRs remain Draft/unmerged against development. Platform base: 23a157a5c2aa581eec6e0f02b97318c784296e79; Shop base: f91f02819a9f2909062e36140f1775a870009115. Exact final feature heads are recorded in the PR descriptions and local STABILIZATION_REPORT.md; compare git rev-parse HEAD before manual deployment.

## Confirmed corrections

- Both shared protocols accept legitimate longer configured JWT lifetimes only after exact issuer/authenticated audience/expiry/UUID checks, independent registered-project Auth verification and live actor RPC. No decoded claim is authority. Protocol bytes are identical.
- New unshipped Platform migration uses client-first FOR SHARE for read/credential locks; create/enrollment/rotation/resolution retain FOR UPDATE. Post-lock authorization and 15-second actor freshness remain.
- Shop parses asynchronous error bodies before the final session/generation check. A late old HTTP 400 cannot erase the replacement account retry; current authorization denial clears cached tickets/detail/receipt.
- Recovery/handoff fixtures now honor PR4 verified read-back and explicit protected destination approval; historical cutoff tests explicitly retain their old contract. No production recovery or handoff source was modified.
- Native runners expose fixed local subgroup selectors, stream progress, bound the direct child at the existing eight minutes and retain stdout and stderr. No hosted target arguments are accepted.

## Executed matrix

| Check | Result | Evidence/scope |
|---|---|---|
| Platform broad unit/handler/simulation suite | 312/312 PASS | stabilization-platform-unit-final.log; original baseline 301/302, stale recovery/handoff fixtures corrected |
| Shop broad unit/renderer/package/installer suite | 101/102; one retained baseline gate | stabilization-shop-unit-final.log; accepted-release raw byte equality, original baseline 92/93 |
| Actual cross-repository HTTP/enrollment handlers | 10/10 PASS | Included in Platform suite; explicit HTTP doubles, not hosted Auth/Management |
| Shop Support client/renderer/retry/installer/package | 9/9 PASS | Included in Shop suite; includes late-error account-switch regression |
| Native Support SQL/concurrency + real local Auth | 10/10 PASS | stabilization-support-native-final-accepted.log; native PG17/real GoTrue schemas/Vault; independent psql backends; real local GoTrue/PostgREST JWT verification |
| Existing bootstrap native groups | 6/6 across bounded runs | stabilization-native-bootstrap.log first five plus corrected stabilization-native-bootstrap-behavior.log; historical cutoff source |
| Existing team-handler/canonical role native groups | 2/2 PASS | stabilization-native-team-database.log; before/after UUID contract |
| Existing lifecycle native groups | 12/12 across bounded runs | stabilization-native-lifecycle.log eleven completed before interruption; stabilization-native-lifecycle-boundaries.log final group |
| Existing role reads/RLS/PostgREST native groups | 4/4 PASS | stabilization-native-role-reads-final.log |
| Existing PR4 native security groups | 8/8 PASS | stabilization-native-pr4-security-final.log |
| Privileged handoff focused native campaign | 1/1 PASS | stabilization-handoff-native-final.log; overlapping actual consume transactions, current session/approval/source/expiry/replay/actor checks |
| Both production builds | PASS | stabilization-platform-build.log, stabilization-shop-build.log |
| Both actual Support browser integrations | PASS | stabilization-*-browser-final.log, 320/768/1440px; actual UI modules with synthetic loopback SDK, zero external requests/page errors |
| Built privileged credential scan | PASS | No Support/Management/service key variable or service_role JWT in built JavaScript |
| Shared protocol parity/candidate reproducibility | PASS | Identical protocols; deterministic separate 33-migration/seven-function candidate |
| Supabase CLI runbook syntax | PASS | Installed CLI 2.120.0 version/help, explicit project-ref/dry-run/skip-vault/use-api/env-file flags; no hosted commands executed |

The existing native groups total 32 completed checks across bounded historical/current campaigns; they are not one uninterrupted full-runner pass. The first old full-runner timeout remains diagnostic evidence. A local machine/Docker restart interrupted later checks; empty/interrupted logs are not acceptance. Fixed selectors resume only affected groups. Observed CheckpointDone cleanup waits indicate local disk/checkpoint overhead; no persistent deadlock was demonstrated. Child limits were not increased.

## Accepted release discrepancy

The accepted Platform _shared/shop-release.json remains byte-for-byte unchanged, internal SHA256 7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940. Thirteen package entries differ only in line endings across three unchanged Shop Git blobs: runtime-preflight.ts (52 approved CRLF vs 59 checkout), support-handoff.ts (0 vs 19), login/index.ts (396 vs 418). LF-normalized content matches. See stabilization-release-drift.json. The strict accepted-byte gate remains failing, with no expectation weakening, artifact replacement or checksum rewrite. Regenerating that accepted release changes approved identities and requires a separate owner release-promotion decision after frozen jobs are reconciled.

The separate Support candidate has internal SHA256 0c3298e97a1b9f479170644281499f9e6a0155209eedb9f242b1bcf85c7bcc01. It normalizes source to LF, includes the new protocol/migration/function and is reproducible. It is not the accepted provisioner import and was not promoted. Existing completed Shops use the additive manual upgrade; optional Support does not gate POS readiness.

## Boundaries and remaining gates

Local SQL/races and local Auth/PostgREST do not prove hosted gateway, Management, Vault/secret propagation or different-account BYO acceptance. Real disposable Owner/Manager/Master/Portfolio Manager/Billing, CAPTCHA/login/device smoke, actual installation and cross-project acceptance remain owner-controlled before-use checks. The hosted Shop JWT lifetime was not read or changed. Deno static/provider-bundle checking remains unexecuted; Node imports actual TypeScript handlers, but does not replace that gate.

A central Edge runtime compromise has privileged project credentials and exceeds dedicated-bearer scope protection. Hash-based capability proof assumes HTTPS to the exact registered Shop and trusted installed code; protect hash enrollment files. Cross-project authorization uses a fresh 15-second snapshot, not atomic immediate revocation. Read locks still briefly fence writers; no production-scale performance claim is made.

Current integrated and inspected historical Shop source/accepted artifacts contain no anonymous central ticket sender; read-only Cloudflare source metadata identifies the disposable frontend baseline. External/manual/customer deployed inventory is incomplete. Anonymous closure remains staged outside active migration discovery, PREPARED and NOT CLOSED. Native closure tests retain server intake and staff resolution while denying effective anonymous table/column/sequence grants and policy access.

Owner instructions: docs/CUSTOMER_SUPPORT_DEPLOYMENT.md. GO WITH CONDITIONS for the next controlled additive development deployment after exact history/dry-run and baseline/owner/pairing checks; NO-GO for customer use/production until actual hosted acceptance and remaining explicit gates. No hosted database/Auth/credentials/functions or Cloudflare deployments/settings were changed.

Detailed independent analysis and raw logs: C:/Users/ranaz/Desktop/Development/Support ticket/implementation-evidence/STABILIZATION_REPORT.md. Both engineering histories record the source changes; PR descriptions identify final heads.
