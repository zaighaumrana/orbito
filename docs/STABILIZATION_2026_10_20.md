# Local BYO and Paper Supply stabilization

See the coordinated Shop guide `../Orbitoshopv2-v1/docs/BYO_GUIDED_SETUP.md` and
the dedicated evidence directory
`../Support ticket/implementation-evidence/stabilization-2026-10-20-byo-paper`.

The local changes are organized for independent review:

- Provisioning: `supabase/functions/_shared/managed-setup.ts` now rejects an
  ambiguous fresh completion timestamp before pairing/secrets. Source/prefix
  verification runs even for cached aggregate migration stages; atomic duplicate
  envelopes reject conflicting recorded source under the advisory lock.
- BYO: Shop's `scripts/setup-byo.mjs` coordinates the existing installer and
  customer-local Support workflow. Complete BYO Setup points to the real entry
  point and describes preflight/status/resume. Platform gains no customer
  Management authority. The original tested query flags are preserved.
- Paper: the new forward Platform migration adds approval/dispatch and bounded
  customer-visible communication to the existing revision pipeline. The existing
  client lock, current role/session guard, source credential identity, immutable
  usage/billing inputs and delivery capacity semantics remain. Legacy confirmed
  delivery calls are supported; approval/rejection/cancellation through the new
  UI require a message. Old records receive an explicit no-message fallback.
  The new RPC returns no private operator notes. Shop reads only the Owner-safe
  projection and renders text with the existing HTML escape helper.

No prior SQL or frozen release was edited. Active Support-v2 remains unchanged.
Support-v3 (36 migrations/7 functions) is an **inactive unregistered candidate**;
managed promotion requires a separate explicit compatibility/release decision.
Do not silently repin an existing job or install it on Client #3.

For Paper rollouts, review Shop SQL/sender first, then Platform SQL and UI. Updated
Shop senders accept old projections; old Shop senders ignore additional fields and
cannot display the new messages. Backfill no invented messages/delivery dates.
The legacy Reject/Cancel RPC now fails closed without a reason; coordinate the UI
update with Platform SQL. Confirmed delivery quantities remain under the existing
immutable supply ledger and a future timestamp cannot become delivered capacity.

The exact original Client #3 timestamp cause remains unproven without its
pre-correction state. Local differential reproduction identifies pre-existing Auth
state as one concrete trigger. Do not reset an uncertain Shop. Managed Client #3's
34/48 stages, owner/onboarding, Support and PKR40 billing checkpoints are preserved
as owner-reported hosted evidence, not new execution results.

No push, commit, merge, hosted query/write, function deployment, Cloudflare
deployment, credential rotation, release promotion or production cutover occurred.
The production Shop hostname still requires a separately approved public build
target, migration/runtime verification, CAPTCHA/domain/routing checks and a hosted
POS/Support/billing smoke procedure. Other minor POS workflow gaps stay deferred.
