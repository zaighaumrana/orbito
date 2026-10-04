# Repository working rules — RetraSell Platform

These rules govern work in this repository. Follow the user's current scope and
authorization; preserve these safeguards unless an explicit later decision changes them.

## 1. Start of task

- Confirm the repository, current branch and `git status` before meaningful work.
- Current branch: `feature/platform-overhaul-v1`; integration base: `developmentv2`.
- `main` is legacy, not the current integration target.
- Do not merge the overhaul branch until the hosted smoke gate is complete.
- Do not create branches, commit, push, merge or deploy unless the user requests it.
- Read the current-state entry and the last 2–5 relevant engineering-history entries.
- Read relevant authoritative documents, then inspect only necessary implementation.
- Never assume a clean tree; preserve unrelated and uncommitted user work.
- Do not reset, stash away, discard or overwrite user changes to simplify your task.
- Respect named repository/client exclusions, including the legal worktree and Client 1.
- Avoid rediscovering the whole project for a small task.

## 2. Two-repository boundary

- Platform: `zaighaumrana/orbito`, sibling checkout `../orbito`.
- Shop: `zaighaumrana/Orbitoshopv2-v1`, sibling checkout `../Orbitoshopv2-v1`.
- Platform is the control plane: clients, provisioning, lifecycle, billing and history.
- Shop is the operational source of truth: retail, repairs, inventory and local Auth.
- Inspect both sides for a bridge, provisioning, identity or entitlement contract change.
- Preserve deployed compatibility; do not casually duplicate responsibility.
- Update both histories when both repositories materially change.
- Platform entry points: `src/client-setup.js`, `src/lifecycle.js`, `src/operations.js`.
- Trusted operations live in `supabase/functions/platform-*` and forward migrations.
- Current specifications: `PLATFORM_OVERHAUL_V1.md`, `docs/SUPPORT_SESSION_HANDOFF.md`.
- Older phase reports are historical evidence; their superseded setup paths are not fallbacks.

## 3. Architectural invariants

- Each managed customer has one isolated Shop Supabase project.
- Platform and Shop must NEVER use the same Supabase project; account/org may be shared.
- Validate the exact target project, client, pairing binding and source before remote work.
- Keep Shop operational data Shop-side and control-plane/financial history Platform-side.
- Never place service-role keys, Management PATs or other privileged keys in browser/Vite code.
- Use protected server state for lifecycle, configuration recovery and ownership.
- Browser caches/localStorage are not authoritative recovery records.
- An uncertain remote outcome is uncertain; do not report success or blindly issue a new request.
- Recover using the same request UUID and intended payload; reject conflicting ID reuse.
- Never silently resurrect archived, destroyed or decommissioned clients.
- Keep stable bridge contracts, immutable usage identities and versioned projections.
- Preserve BILL/INVENTORY semantics, THERMAL metering, invoice/payment and repair ledgers.
- Printing and thermal tracking remain independent of Paper Resupply.
- `technician_module_enabled` is canonical; do not introduce new `workshop_enabled` logic.
- Basic = POS/repair; Pro adds Technician/Tracking; Pro Plus adds EMS.
- Inventory/Paper are independent; Break Tracking is independent but requires EMS.

## 4. Database and migration rules

- Applied migrations are immutable infrastructure, not disposable source files.
- Add forward migrations; never rewrite an already-applied production migration.
- Inspect target identity and migration status before any authorized database push.
- Destructive schema/data changes require explicit justification and authorization.
- Never reset production or use a historical maintenance script as routine setup.
- Investigation is read-only on hosted databases unless the user explicitly requests mutation.
- Preserve audit/financial history and existing customer ownership/cutover.
- Use existing canonical operator authorization; do not replay baseline email policies on an upgrade.

## 5. Security and identity

- Never print, log, commit or persist plaintext credentials outside their approved secret store.
- Redact passwords, PATs, service/secret keys, bridge credentials and support grants.
- Do not open environment/pairing/runtime files just to inventory their presence.
- Never output Vault decrypted values or full Management API key responses.
- Shop owner passwords stay exclusively in Shop Supabase Auth.
- Platform must not collect customer service-role keys, DB passwords or customer PATs.
- Preserve authenticated UUID/operator identity as Platform master authorization.
- `admin_username` is an alias; `VITE_PLATFORM_AUTH_EMAIL` grants no role.
- Historical `platformadmin@retailos.internal` is not a required replacement Auth account.
- Do not weaken Platform or Shop CAPTCHA to fix an integration issue.
- Fail closed when authorization, identity, pairing or required audit cannot be verified.
- Use existing trusted server boundaries; browser role/identity inputs are not authority.
- Support starts at authenticated Platform master through the one-time handoff.
- Never reintroduce Shop-side Platform password forwarding.
- Grants use 256-bit randomness, 90-second issuance expiry and hash-only persistence.
- Preserve single-use consumption, lifecycle rechecks and client/project/binding/source checks.
- Keep grant plaintext transient; remove the URL fragment before Shop initialization.
- Do not store grants in logs, analytics, query strings, browser storage or application tables.
- Canonical Shop role remains `Orbito Support`; do not rename it for branding.
- Active/Suspended managed targets support handoff; BYO support handoff is not enabled.
- Archived/destroyed/decommissioned targets deny handoff.
- Legacy support-auth configuration is compatibility-only, not the current login architecture.
- Keep bridge source and call credentials separate; do not change scheduler cadence.

## 6. Lifecycle and retention

- Lifecycle: Provisioning → Active ↔ Suspended → Archived.
- Infrastructure: unknown / present / unreachable / destroyed / decommissioned.
- Suspend changes access; Archive is terminal local historical retirement in V1.
- Archive must work without reaching the Shop and must retain historical records.
- Archive alone does not revoke a reachable Shop's access; suspend first when required.
- Infrastructure destruction/decommission is separate from local Archive.
- Historical is the archived view, not an additional mutation or deletion state.
- Never implement a vague Delete action that conflates these concepts.
- Financial, usage, provisioning and audit history must survive infrastructure destruction.
- Remote destructive decommission automation remains deferred unless separately approved.
- Business Owner is denied while suspended; canonical support remains allowed.
- Instant suspension propagation to already-open sessions remains future work.

## 7. Validation: token and cost efficiency

**Minimize token and compute consumption without reducing correctness for high-risk areas.**

- Start with the smallest meaningful existing validation set.
- Prefer existing tests/helpers/fixtures to redundant scenario matrices.
- Iterate: narrow relevant check → smallest fix → rerun that check.
- Run broader regression once near completion only when the risk warrants it.
- Do not rerun successful same-task checks unless later edits could invalidate them.
- Documentation-only work: content/fact/secret review and `git diff --check`.
- Do not run builds, full suites or database tests for ordinary documentation-only edits.
- Formatting/comment-only changes do not need full application smoke.
- Do not invent dozens of near-identical tests merely to raise the count.
- Before adding a test ask: "What regression does this uniquely protect?"
- If an existing check proves that invariant, do not duplicate it.
- Avoid combinatorial/fuzz/property matrices unless the requested risk needs them.
- Avoid large synthetic datasets unless behavior actually depends on scale.
- Avoid huge snapshots of generated structures and duplicated tests across files.
- Prefer a few meaningful boundary checks and reuse shared fixtures.
- Never trade away security, authorization, financial or migration correctness for cost.
- Concurrency, data integrity and destructive-operation safety need sufficient validation.
- Explain why expensive checks are necessary for high-risk changes.
- Do not execute hosted destructive smoke automatically; give instructions unless authorized.
- Avoid scans of node_modules, build outputs, lockfile internals and giant generated artifacts.
- Use targeted searches; read relevant sections, not every source file.
- Keep tool output bounded and summarize validation rather than dumping logs.
- Distinguish mocks/local SQL from hosted Auth, Vault, Management and browser evidence.
- Do not read the generated `shop-release.json` wholesale; inspect builder/checksums as needed.

## 8. Change discipline

- Make the smallest safe change; no unrelated refactors or speculative improvements.
- Prefer additive changes during stabilization; explain scope expansion before doing it.
- Preserve working bridge behavior and deployed contracts.
- No mass technical rename for RetraSell branding; use existing public branding configuration.
- `published=false` remains until the explicit legal/provider review gate is cleared.
- Onboarding precedes legal evaluation; preserve the current unpublished-owner/staff behavior.
- Future per-ticket support consent/legal disclosure is not implemented fact.
- Platform owner Auth creation and project/Cloudflare/env automation remain deferred.
- For Shop function/migration changes, coordinate the reviewed Shop release builder and artifact.
- Do not change an artifact mid unresolved operation or silently replace passed stage checksums.
- Separate completed-client repairs from release changes for future installs.

## 9. Debugging

- Follow logs → existing state → narrow reproduction → root cause → smallest fix.
- Use redacted logs; do not expose credentials to diagnose failures.
- Distinguish browser, Edge Function, Auth, database, Management API and DNS/Cloudflare failures.
- A generic UI error is not proof of root cause; find the authoritative failing boundary.
- Do not shotgun-edit unrelated subsystems.
- Preserve uncertainty and history when investigating timeout-after-success.

## 10. Deployment

- Do not deploy by default: implement locally, validate, report required commands and stop.
- If deployment is requested, confirm exact target and deploy only changed components.
- Do not rerun complete managed onboarding for a one-function fix.
- Do not replay owner/bootstrap or rebind a completed Shop unnecessarily.
- Distinguish current-client repair from future-client release updates.
- Do not claim deployed or hosted-verified from a commit, local build or deployment instruction.
- Verify Git history and the remote branch before claiming pushed; reconcile stale status with dated notes.
- Deployment/publication and destructive hosted smoke require explicit user scope.

## 11. Engineering history maintenance

- Append a dated entry to `ENGINEERING_HISTORY.md` BEFORE finishing meaningful changes.
- Required for behavior, database/migrations, architecture, security/auth, billing, provisioning,
  infrastructure/deployment, legal, cross-repo contracts, material fixes or significant tooling.
- Use Asia/Karachi date/time when time matters; preserve every previous entry.
- Never rewrite history merely for style; append corrections when accepted decisions change.
- Typical entry format:

```markdown
## YYYY-MM-DD — concise title
Branch:
### Purpose
### Changed
### Decisions
### Validation
### Deployment / DB impact
### Deferred / deliberately unchanged
### Git
```

- Keep entries proportional: small fix 80–200 words; normal feature 150–350;
  major architecture/security/migration 300–700. Exceed only for necessary evidence.
- Record why, accepted decisions, components, validation, impact and remaining limits.
- Separate locally implemented, committed, deployed, hosted verified and deferred states.
- Never include secret values/hashes, private customer data, full logs or chat transcripts.
- No entry for read-only/Q&A/tests-only/formatting/reverted experiments unless a milestone is requested.
- Read relevant recent/subsystem entries, not the entire growing history on each task.

## 12. Documentation hierarchy and completion

- `AGENTS.md`: how to work; `ENGINEERING_HISTORY.md`: why decisions were made.
- Relevant specs/audits establish detailed contracts; Git establishes exact source changes.
- README/status summaries give context; dated older status is not current hosted truth.
- If sources conflict, investigate current code and newer accepted evidence.
- Preserve older evidence and append a correction rather than blending contradictory designs.
- Finish concisely: changed files, decision, validation, DB/deployment impact, remaining limits,
  history update, branch/status and suggested commit when useful.
- Never imply the overhaul hosted smoke gate is complete while required stages remain pending.
