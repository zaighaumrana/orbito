# Coordinated setup review checkpoint — 2026-10-21

This is the current guide to the Platform wizard changes. The customer-operated
installation procedure is authoritative in the Shop repository's
`docs/BYO_GUIDED_SETUP.md`. Older dated reports describe their own checkpoints.
Nothing in this checkpoint authorizes a hosted migration, installation or release
promotion. Both existing feature PRs must remain open, Draft and unmerged.

## Client creation

Add New Client preserves the original five sections: business, owner, plan and
services, billing and rates, and Shop configuration. Back/Next preserves inputs;
validation runs before advancing. Review is required before Save; editing a
reviewed field invalidates the review. Break Tracking still requires Pro Plus.
Inventory, Paper, rates, currency and Managed/BYO semantics use existing rules.
Drafts are held in sessionStorage scoped to authenticated operator/session and
cleared on logout or role change. They contain form fields, never credentials.

`platform_create_client_once` wraps the existing canonical `platform_save_client`.
A stable UUID, actor and canonical payload fingerprint reconcile lost responses.
Concurrent identical requests create one row; changed payload/actor reuse fails.
Unconfirmed outcomes lock the original fields and offer Retry original creation.
This is client registration only; customer Auth creation remains separate.

## BYO progress authority

Client Detail → **Resume BYO Setup** opens one of the original twelve technical
stages. All commands remain available without executing them. Step 5 requires
explicit fresh/existing selection before copying its installation command.
Back/Next, acknowledgments, optional stages, blocked categories and recent history
are persisted through `platform_byo_progress`, with optimistic revisions.

The new private table binds client, exact project ref and current server pairing
binding. Canonical live Master role/session authorization is checked on every
read/write. Client-row locking and expected revisions reject concurrent stale
writes. Archived/destroyed/decommissioned clients fail closed. A changed pairing
requires review; the wizard cannot silently adopt its previous progress.
Private tables have RLS and no browser/service-role direct access. Audit records
contain only operator identity, time, stage, mark and a fixed diagnostic category.

Operator acknowledgments are distinct from backend observations. Only trusted
existing health/Support state determines the latter, with observation time shown.
Opening/refreshing the guide reads recorded state and performs no customer check.
The local installer journal remains authoritative for local operations. Platform
cannot inspect it and never collects pairing/runtime/Support files, CLI authority,
Turnstile secrets or free-form diagnostics. Selecting a hash handoff file is not
proof of successful Support enrollment. Core acceptance does not require Support.

## Local validation and limits

Native PG17/Auth tests cover migration application, role/session/private ACLs,
project/binding checks, revision conflicts, actual simultaneous progress writes,
actual simultaneous creation and request replay. Browser tests execute the actual
Platform modules with isolated provider doubles and blocked external requests:
five steps, review invalidation, lost-response retry, twelve stages, resume after
refresh, blocked/conflict recovery, client isolation, focus/Escape and responsive
light/dark layouts. These are local evidence, not hosted acceptance.

All visual changes are confined to Platform: wizard layout, Support file picker,
Support/action spacing and lifecycle/technical/public-environment action groups.
Shop appearance, financial/thermal semantics, legal publication state, packaged
Shop releases and the managed Support-v2 pointer are unchanged.

## Separately approved rollout

1. Review both Draft PRs and final commit-specific external evidence.
2. Back up/inspect the intended Platform database and apply the new forward
   migration `20261021165221_coordinated_setup_wizards.sql` through the approved
   migration workflow. It is not a Shop migration. Do not reset a database.
3. Deploy the compatible Platform frontend only after its new RPCs exist. Missing
   progress RPC leaves instructions readable with saving disabled. Missing create
   RPC blocks creation without falling back to a non-idempotent write.
4. Separately approve the reviewed Shop checkout/package and exact customer target.
   Follow the customer-side guide with original private files. Do not install into
   the intended Client 1 project as part of source review.
5. Hosted acceptance must independently prove real CAPTCHA, manual confirmed owner,
   six-step completion, exact build/routing/redirects, and optional Support ticket
   and Paper flows. No local result establishes these hosted facts.

No Edge deployment, DNS change, scheduler change or Support-v3 promotion is needed
to record wizard progress. Future preview/production deployment is a separate gate.
