## Current integration status — 2026-11-17

Shop `development` is at `bff63c451ea11950b2dd7d17ccb7cbe73d742cc1`. Platform `development` is at `15952fb7f443fb58a65e61cc3386763902e22a24`. Both are owner-confirmed, in sync with their respective `origin/development`, and were independently re-verified by fresh-cloning both repositories directly from GitHub and re-running `node scripts/release-parity.mjs --candidate support-v11`, which printed the same `PASS` the owner's machine produced. The register-shifts backend itself (Shop commit `74a7d38...`, part of the ancestry of `bff63c4`) is a disposable-dev-shop-only addition under the owner's Option A: Shop's own non-candidate release-parity check is expected to keep failing on `development` until this document's promotion is applied, and that failure is not a regression.

**Promotion is PREPARED, NOT YET APPLIED.** Everything below the first section was verified against a disposable local replica seeded from a read-only snapshot of the live `platform admin` project (`ukbhyerxshteyetwomqy`), never against the live database itself. No migration has been pushed and no function has been redeployed as of this writing. The two phases below are independent and owner-authorized but not owner-executed.

---

# Support-v11: server-side register shifts, candidate and promotion

17 November 2026. Candidate registration is complete and pushed. Promotion (the Platform database migration and the three-function redeploy) is written, verified against a disposable replica of production, and awaiting the owner's own execution.

## What v11 adds

One additive Shop migration (`20261108120000_register_shifts.sql`) and one single-line change inside the existing `verify-pin` function. Nothing else differs from v10.

- New table `public.register_shifts`: one open register per operator (Business Owner or Cashier), RLS-scoped (owner/manager/support read all, a cashier reads only their own), immutable once closed, no direct browser writes.
- Five new RPCs: open, get-my-open, get-summary (live or stored), close, force-close, and a bounded paged history list.
- A server-computed shift summary split into register cash, online channels, credit (udhar), returns and sales/repairs, with online payments and unpaid credit explicitly excluded from the register-cash figure.
- One new PIN purpose, `shift-close`, used only when a Cashier's counted cash is short; an Owner counting less needs no PIN.
- One new optional capability, `register-shifts`, and one new `read_contracts` key, `register_shifts`, both surfaced through the existing `shop_backend_capabilities()`/`get_app_config()` functions (re-created, not redesigned).

## Candidate registration — complete

| Field | Value |
|---|---|
| Release id | `support-v11` |
| SHA-256 | `caa5a5d5af74fd97fee263330582fe5eefc5a5a35f4b66252cf736eb018b1e5c` |
| Backend source commit | `cd3e01ee5c1f05ce8c3f085933d1065f028302c0` |
| Migrations / functions / requirements | 43 / 7 / 13 |
| `approved_for_new` / `supported` / `review_status` | `false` / `false` / `candidate-local` |

Built with `node scripts/build-platform-release.mjs --support`, independently reproduced to the identical hash from a separate clone of the same Shop commit. It is a strict superset of the approved v10 package: all 42 v10 migrations and 6 of 7 functions are byte-identical; `verify-pin` differs by exactly the `shift-close` purpose addition; one migration is new.

Validating `--candidate support-v11` required three changes, each isolated into its own commit for independent review/revert:

1. **`supabase/functions/_shared/backend-inventory.ts`** synced to match Shop's already-committed `scripts/backend-inventory.ts` (the gate requires these two mirror copies to be byte-identical; Shop's copy was correctly updated in Stage 3 while Platform wasn't supposed to change yet, so this sync was the expected catch-up).
2. **`supabase/releases/shop-release-support-v11.json`** (the built artifact) and the candidate entry appended to **`supabase/releases/approved-shop-releases.json`**.
3. **`scripts/release-parity.mjs`**: one line added to the hard-coded per-migration requirement ledger — `...(versions.includes('20261108120000')?['register-shifts']:[])` — following the identical pattern used for every prior optional capability (`bounded-operational-reads`, `catalog-icons-and-brands`, `icon-label-preferences`, `inventory-retirement`). This is the one change that is genuinely release-parity logic; it was flagged to the owner explicitly before being applied, since without it v11 could never validate under any circumstance, by design.

Confirmed on both remotes: `git log origin/development -1` on Platform shows `15952fb`; on Shop shows `bff63c4`. A fresh clone of both from GitHub at these exact commits reproduces `PASS local candidate parity {"review_status":"candidate-local-not-promoted","release_id":"support-v11","sha256":"caa5a5...","migrations":43,"functions":7,"requirements":13}`, and the non-candidate (default) check still fails on Shop `development` with "Migration source omitted from package" — the expected Option A state.

## Promotion — prepared, not yet applied

### Phase 1: database migration

`platform_private.approved_shop_releases` is a live table in the `platform admin` project, read via read-only MCP access to obtain its exact current 11 rows. A migration following the identical structure of `20261031010011_promote_support_v10.sql` (lock, assert-before, insert/update, assert-after) was written with those real values as `expected_before`, and tested against a disposable scratch table seeded with those exact 11 rows: it applied cleanly, produced precisely the predicted final state (`support-v11` the sole `approved_for_new` row, `support-v10` kept `supported: true` with `successor` repointed to `support-v11`, `support-v5` — already unsupported — untouched), and was confirmed idempotent on a second run against its own output. The live database's migration-tracking table (`supabase_migrations.schema_migrations`) was also confirmed to match git history exactly as of `20261031010011_promote_support_v10`, so `supabase db push` will see only this one new migration, nothing unexpected.

This phase is inert by itself: nothing currently reads `approved_for_new` live from the database to choose behavior (`platform_managed_release_pin` only checks that the `release_id`/`sha256` pair exists, not that it's the approved-for-new one).

### Phase 2: release registry and function redeploy

Three deployed Edge Functions (`platform-provision`, `platform-upgrade`, `platform-backend-inventory`) import a shared module, `supabase/functions/_shared/shop-release-registry.ts`, that hard-codes a map of known releases and reads `supabase/releases/active-shop-release.json` to decide the current target. As written today it stops at v10. Fresh provisioning will keep installing v10 until both files are updated and all three functions are redeployed together. Two `_shared` helpers (`support-automation.ts`, `managed-setup.ts`) that also consume this registry are bundled transitively through `platform-provision` and need no separate edit.

## Requirement and delivery parity

| Route | Status after promotion |
|---|---|
| Fresh Managed | `platform-provision` requests `active-shop-release.json`'s target via `platform_managed_release_pin`, which will resolve to v11 once Phase 2 is deployed. |
| Fresh BYO | Owner-directed scope deliberately does not extend the BYO upgrade/onboarding path for this release; v11 reaches BYO shops only through the same fresh-setup flow as Managed, by the owner's explicit choice. |
| Existing Managed / Existing BYO | Untouched. `support-v10` remains `supported: true`; no existing shop is offered or forced to upgrade. |

## Activation order and remaining work

1. Owner runs `supabase db push --dry-run`, reviews, then `supabase db push` (Phase 1).
2. Owner edits `shop-release-registry.ts` and `active-shop-release.json`, then runs `supabase functions deploy` for `platform-provision`, `platform-upgrade`, `platform-backend-inventory` (Phase 2).
3. Owner commits the migration file and the two edited source files to Platform `development`.
4. Owner reports the exact CLI output; this document's status line and the paired Shop/Platform `ENGINEERING_HISTORY.md` entries are updated to reflect completion only once that is received.
5. Per the owner's stated order: documentation (this document and its Shop-side counterpart) before a fresh dev shop is provisioned against v11.

## Validation and evidence limits

- Candidate hash reproduced independently from a second clone of the exact Shop commit; `--candidate support-v11` passed both on the owner's machine and from a from-GitHub fresh clone on review.
- The promotion migration was proven against a disposable scratch copy seeded with a live read-only snapshot, not against the live database. No write has been made to `ukbhyerxshteyetwomqy` as of this writing.
- Neither phase of promotion, nor a fresh-shop provisioning test on v11, has been run. Nothing in this document should be read as hosted acceptance of the promotion.
