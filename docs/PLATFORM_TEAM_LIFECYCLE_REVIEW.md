# Platform team lifecycle — corrected PR #4 review and rollout gates

2026-10-12 (Asia/Karachi). This supersedes the 2026-10-11 recovery-email reactivation design. Its historical checkpoint remains in engineering history; its transport instructions are withdrawn. Owner confirmed that migration `20261010233446` has never been applied or manually executed on a hosted database. Only that unreleased migration is revised; the preceding twelve migrations are unchanged.

Local branch: `fix/pr4-security-stabilization`, based on reviewed PR #4 HEAD `a0dae0fc90332f9fc4a498823c1851c00c3f17b6`. No new commit/push. PR #4 remains Draft, open and unmerged, from `feature/platform-team-lifecycle-v2` to `development`. No staging/production connection during this work.

## Final contracts

| State/action | Behavior |
| --- | --- |
| New invitation | Native `inviteUserByEmail`, one durable issuance reservation, genuinely new Pending identity. No automatic resend after uncertainty. |
| Pending setup | Verified UUID/session/email; SIGNED_IN/INITIAL_SESSION invitation callbacks; native caller password write succeeds before service-only acceptance. No ordinary authority while Pending. |
| Deactivate | Retain exact UUID/email/role/password. Commit Inactive, session cutoff and audit first; record provider dispatch, apply supported Auth ban and verify receipt. |
| Reactivate | Require completed reversible suspension and consistent original identity. Clear only recorded RetraSell-owned ban; restore former Active or Pending status and advance cutoff. No email/link/invitation/new account/password change. |
| Fresh access | Former Active employees use original password. Pre-cutoff sessions remain denied forever. A new native OTP recovery session may set a password but cannot gain normal authority after suspension; fresh password login is required. |
| Legacy Inactive | Unknown origin or missing/unlinked Auth stays review-required. Never adopt/create/delete by email. |
| Permanent deletion | Verified Master, approved continuity, current password, fresh CAPTCHA and acknowledgment. Durable revocation before exact-UUID Auth deletion. Archive/removal/final audit only after database-proven absence. |
| Archived | Immutable Master-only retained identity/dates/actor/request/reason. No ordinary restoration/reinvitation. |

Canonical operator authority requires confirmed/nonanonymous/undeleted/unbanned Auth, valid bound Master/configuration, matching team email/role, live owned `auth.sessions`, session cutoff and no tombstone. Missing/malformed/expired/mismatched/removed sessions fail closed. Ordinary browsers cannot read Auth sessions or modify cutoffs/identity/operations. Existing RLS, RPCs and privileged Edge checks inherit this boundary.

Restrictive authenticated Storage/private Realtime policies overlay existing policies without granting new permissions. Managed RLS and table-owner permission are prerequisites. Public buckets, anonymous/public channels and already-joined authorization caches need separate hosted inventory; this is not a claim of immediate transport disconnection. Current Platform source has no Realtime subscriptions.

Browser authority checks run every minute, on focus and when visible. Confirmed denial cancels dialogs, clears private state and returns to login with local logout. Network/ambiguous failures do not declare deactivation. Generation checks discard late authorization/config/client/username responses. JavaScript cannot erase previously copied/downloaded information.

## Native Auth gates

Ordinary password forms send `current_password` with the new password. Auth **Require current password** must be enabled and verified separately; frontend checks cannot stop a direct native API bypass. Invitation/recovery use verified caller sessions separately. Implicit native recovery uses OTP AMR; password-only sessions are denied by the setup handler. Query/URL flags alone never authorize setup.

Master verification uses an independent memory-only client, fresh CAPTCHA and local verifier logout. Real GoTrue tests prove multi-session original refresh before/during/after cleanup, repetition, slow cleanup and wrong-password isolation. Single-session mode rejects original refresh DURING verification; it can resume after cleanup, but a browser may already have discarded its session. Session-row existence alone does not prove provider-policy continuity.

The new database continuity policy defaults off and binds approval to the current Master UUID. Only trusted `postgres` can configure it with an audited reason. This does not configure Auth or prove safety. Rebinding invalidates approval. Deletion is denied before password grant/privileged client and at SQL reservation/dispatch until actual hosted continuity is verified. Username verification is also withheld while unapproved.

Public Forgot Password uses native Auth plus CAPTCHA and generic responses across success/provider failures, with neutral fresh-CAPTCHA guidance. Native `/auth/v1/recover` cannot reliably enforce an Inactive email-sending veto while retaining the built-in sender. Ban/canonical state block access; recovery cannot activate an Inactive row. No email veto is claimed.

Rejected third-party transport, Send Email Hook, custom recovery endpoint, reactivation proofs/rate tables/flags and unused wrapper are removed. Native invitation/recovery and required Shop support compatibility remain. No transport fallback or new secrets.

**Built-in shared delivery blocks general production onboarding:** Supabase documents restricted authorized recipients, shared rate limits and best-effort delivery. The selected built-in-only architecture cannot be described as reliable unrestricted production email. Resolve through a separate owner/provider decision; do not silently install another provider.

## Failure recovery and dependencies

Only the reservation winner dispatches Auth. Duplicate/conflicting requests cannot repeat writes or overwrite another worker's outcome. Required audit failures roll back associated SQL. Uncertain password updates stay restricted; saved-password retries can complete acceptance without another password write.

Delete checks Storage owner/owner_id, custom Auth FKs and team FKs at reservation and immediately before dispatch. Native Auth FK allowlist checks schema/table/owner/constraint/exact user_id column; extra custom FKs on managed tables are denied. Freeze relevant DDL and target writes during destructive work: no transaction spans the remote Auth HTTP call.

Ban/unban is not a provider compare-and-set API. Independent/changed bans block Reactivate; concurrent dashboard/provider changes must be frozen. Failure/uncertainty keeps Inactive and an audited review-required request. Do not automatically reban/unban/resend/recreate/redelete. Trusted recovery must independently compare current Auth/SQL against recorded UUID/ban and approve a narrowly audited reconciliation before any correction. No public automatic reconciliation exists for ambiguous ban/unban.

Delete reconciliation rechecks the same durable request and UUID/email absence without repeating deletion. If Auth still exists or dependencies are unknown, stop. Never fabricate history or restore vulnerable handlers. Pinned GoTrue has no verified admin-UUID logout-all endpoint: ban blocks password/refresh while applied; SQL cutoff permanently protects retained session rows. No forged employee JWT or manual production Auth-session deletion.

## Ordered staging plan — all hosted steps require separate approval

1. Review local fixes and explicitly approve a Git checkpoint. Commit on the isolated fix branch with approved `[CF-Pages-Skip]` prefix. After approval, fast-forward the existing PR #4 source branch to that commit and push ONLY that source branch. Keep Draft. No protected-branch update/merge.
2. Verify reviewed commit, staging `ukbhyerxshteyetwomqy`, twelve genuine migration rows, original Master UUID/roles and verified fresh backup. Production `mincersddxuaqojczcih` is excluded. Freeze operator/team writes, provider changes and related DDL. Coordinate scheduler pause separately; do not change its cadence automatically.
3. Read-only execute `supabase/bootstrap/team-lifecycle-preflight.sql` with the reviewed private credential process. Check managed owner permissions/RLS, FK definitions, public resources and duplicate mappings. No ownership transfer/application-role grant shortcuts. Stop on differences.
4. Separately verify/approve native current-password enforcement, CAPTCHA, invitation/recovery redirect `https://orbito.ahwad.com/?reset=true`, expiry, recipient/rate eligibility and multi-session behavior. Verify rejected hook/recovery endpoints absent or explicitly disabled server-side if ever deployed; UI hiding is insufficient. None was hosted-verified here.
5. In the coordinated freeze, separately approve deploying the six reviewed team/setup handlers FIRST: create/update/delete/deactivate/reactivate-platform-user and platform-password-setup, all `verify_jwt=true`. Verify every active deployed source/dependency and staging origin secret. Before migration, the new handlers must fail closed because the required session/context/RPC contract is absent; perform only non-mutating rejection checks. Stop on partial replacement. This avoids leaving old handlers able to dispatch Auth writes after SQL privileges change. Confirm no old in-flight requests remain. Do not deploy the four unrelated handlers; provisioning correction is a separate deployment item.
6. Repeat CLI 2.120.0 dry run: ONLY `20261010233446`. Apply only after explicit migration approval through the reviewed credential-safe process, with managed-policy prerequisites satisfied. CLI owns SQL/history atomicity; no authored COMMIT or history repair. If migration fails, leave the replacement endpoints fail-closed and stop for recovery; never restore vulnerable handlers.
7. Verify thirteen genuine rows, retained data, privileges and Master/Manager/Billing boundaries. Only after actual continuity verification may trusted PostgreSQL execute `select platform_private.configure_password_verification(:'verified_master_uuid'::uuid,true,:'audited_reason');`. Supply the independently verified existing UUID; leave disabled if safety cannot be proven.
8. Separately authorize staging frontend and disposable hosted accounts/emails. Validate invitation/expiry/reuse, native wrong/current password API, repeated Master verification/refresh, Deactivate/Reactivate same UUID/original password, old access/refresh denial, Storage/private Realtime, role denials, archive and uncertain-operation recovery. No real employee destruction. Resume normal writes only after accepted validation.

SQL/history rollback before commit is locally tested. After committed migration/Auth mutations, reverting JavaScript or deleting a history row is not rollback. Recovery requires a reviewed restore/reconciliation plan; backup encryption/provider portability and waived rehearsal limitations remain.

Full findings, evidence, precise file manifest and production NO-GO: `docs/PRODUCTION_READINESS_REPORT.md`.
