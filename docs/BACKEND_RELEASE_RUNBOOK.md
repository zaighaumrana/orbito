# Backend release runbook: registering and promoting a Shop backend candidate

This document exists because registering and promoting `support-v11` required discovering, one failure at a time, **seven separate files across two repositories** that all encode some part of "which backend release is current." Four of those seven were missed on the first pass of real promotion work and only surfaced because the actual validator was re-run against the actual pinned CI reference, not assumed from a plan. This runbook is the fix: follow it exactly, in order, and verify at every checkpoint it names. Skipping a verification step here is how the original gap went unnoticed for several commits.

**This file must exist, identically, in both `Orbitoshopv2-v1` (Shop) and `orbito` (Platform).** An agent or developer working in only one repo must be able to complete an entire promotion correctly from this one document, without needing to have the other repo open to know what it also requires.

## The one concept that causes every mistake here

**There are two completely independent places that record "which release is approved," and they do not update each other.**

1. **The live database table**, `platform_private.approved_shop_releases`, in the Platform's own Supabase project. Changed only by a migration, applied only by `supabase db push`.
2. **The git-committed static file**, `supabase/releases/approved-shop-releases.json`, in the Platform repo. Changed only by hand-editing (or scripting) the JSON and committing it.

Updating one does **not** update the other. Nothing in the system keeps them in sync automatically. A promotion that touches only the database (because that felt like "the real change") leaves the static file — which several deployed functions and the parity validator both read — silently pointing at the old release. This exact mistake happened during `support-v11`'s promotion and produced a different, confusing validator error than the one anyone was expecting, specifically because the database was already correct and the static file was not.

**Rule: every time you touch one, check whether the runbook below also requires touching the other, in the same sitting.**

The second recurring mistake: **a deployed Edge Function is a snapshot of whatever was on disk at the moment `supabase functions deploy` ran — not of what's in git, and not of what you intended to save.** If you edit a function's source, the edit must actually be saved to disk, confirmed with `git diff`, *before* you deploy — not after. Deploying first and committing "the same change" afterward can silently ship the old file if the edit was never actually written. Always `git diff` the exact file immediately before deploying it.

The third recurring mistake: **testing the release-parity script against the Platform repository's current `development` branch proves nothing about what GitHub Actions will see.** The Shop repository's CI workflow pins the Platform repository to one fixed, named commit (see Part C below). That pin is itself a file that must be advanced as part of every promotion. Testing against Platform's live `development` HEAD instead of that exact pinned commit will report success while the actual CI check still fails.

---

## Master checklist — every file this process can touch

| # | File | Repo | When |
|---|---|---|---|
| 1 | `supabase/migrations/<ts>_<name>.sql` | Shop | New backend change (registration) |
| 2 | `scripts/backend-requirements.json` | Shop | Registration |
| 3 | `scripts/backend-inventory.ts` | Shop | Registration (if the change is an *optional* capability) |
| 4 | Any Edge Function whose accepted-value list (PIN purposes, enum, etc.) the migration extends | Shop | Registration (only if applicable) |
| 5 | `scripts/backend-release-catalog.json` | Shop | Registration |
| 6 | `supabase/functions/_shared/backend-inventory.ts` | Platform | Registration (must mirror #3 byte-for-byte) |
| 7 | `supabase/releases/shop-release-support-v<N>.json` | Platform | Registration (built artifact) |
| 8 | `supabase/releases/approved-shop-releases.json` — **candidate entry appended** | Platform | Registration |
| 9 | `scripts/release-parity.mjs` — ledger line | Platform | Registration (only if #2 added a new optional-capability requirement id) |
| 10 | `supabase/migrations/<ts>_promote_support_v<N>.sql` | Platform | **Promotion** |
| 11 | `supabase/releases/approved-shop-releases.json` — **flip to approved-shared** | Platform | **Promotion** (same file as #8, a *second*, later edit) |
| 12 | `supabase/functions/_shared/shop-release-registry.ts` | Platform | **Promotion** |
| 13 | `supabase/releases/active-shop-release.json` | Platform | **Promotion** |
| 14 | Redeploy every Edge Function that imports #12, transitively | Platform | **Promotion** |
| 15 | `scripts/byo-release-manifest.json` | Shop | **Promotion** |
| 16 | `.github/workflows/backend-parity.yml` — pinned `ref:` | Shop | **Promotion** |

Sixteen touch points, nine repos×files for registration, seven for promotion. None of them is optional; several (#3/#6, #8/#11) are easy to think you've "already done" because a sibling file with a similar name was touched earlier in the same session.

---

## Part A — Registering a new candidate

Do this once you have a new, committed, additive migration on Shop `development` (or a feature branch) that you want to make available for a future release.

### A1. Shop repo

1. **The migration itself** must already be committed. It must be additive only — never alter or drop an existing object relied on by an approved release.
2. **`scripts/backend-requirements.json`**: append one object to `requirements[]` with a stable kebab-case `id`, a one-sentence `purpose`, the exact `migrations` array (just the new file's version string, unless the change spans more than one migration), the `functions` it touches, and non-trivial `managed`/`byo`/`verification` prose (each ≥ 10 characters; the validator checks this). Also append the new migration version to **both** `installers.managed.migrations` and `installers.byo.migrations`, and the new requirement `id` to **both** `installers.managed.requirements` and `installers.byo.requirements`. If the change adds new tables, functions, triggers, or security properties, append them to the matching arrays under `runtime.database`.
3. **`scripts/backend-inventory.ts`**: if the new capability is *optional* (an existing shop without it should degrade gracefully rather than fail), add its exact name to the allow-list array that currently reads something like `['bounded-operational-reads','catalog-icons-and-brands','icon-label-preferences','inventory-retirement']`. If it is not optional — i.e. every supported shop must have it — do not add it here; consult the parity rule in `AGENTS.md` §Mandatory Rule instead, since a non-optional requirement needs a different, more careful path.
4. **Any Edge Function with its own accepted-value list** that the migration's feature depends on (for example, a new PIN `purpose`, a new enum, a new header) must be updated here too. Search for every place the old value set is spelled out literally; do not assume one file is the only copy.
5. **`scripts/backend-release-catalog.json`**: this is populated once you have the real built artifact's sha256 (step A2.2), so do this step after A2.2, not before. It is keyed by that sha256. Build the entry by copying the shape of the most recent existing entry, with `review_status: "candidate-local"`, `approved_for_new: false`, `supported: false`, and `migration_manifest`/`function_manifest` derived directly from the built artifact — do not hand-type these, generate them from the artifact JSON so a stray digit never gets transcribed.

Commit Shop's changes (steps 1–4; step 5 depends on the artifact and can be committed in the same batch once you have it).

### A2. Platform repo

1. **Sync `supabase/functions/_shared/backend-inventory.ts`** to be byte-identical to Shop's `scripts/backend-inventory.ts` from step A1.3. This is checked by the validator as "Inventory evidence-model divergence"; it is not a logic change, it is a mirror-file copy, every single time Shop's copy changes.
2. **Build the release artifact**, from the Shop repo, with the exact commit you intend to register:
   ```
   node scripts/build-platform-release.mjs --support <path-to-platform-repo>/supabase/releases/shop-release-support-v<N>.json
   ```
   `--support` is mandatory — without it, migrations past a hard-coded cutoff date are silently dropped and `requirements` is omitted entirely. Note the printed sha256; it is the release's permanent fingerprint.
3. **`supabase/releases/approved-shop-releases.json`**: append the candidate entry (copy A1.5's shape here too, or use a small script reading the artifact so the `requirements` array and manifests can't be mistyped — see the worked example below). Required fields and their mandatory values for an unpromoted candidate: `approved_for_new: false`, `supported: false`, `review_status: "candidate-local"`. Any other combination fails the validator's candidate-mode check outright.
4. **`scripts/release-parity.mjs`**: if step A1.2 introduced a brand-new optional-capability `id` that is tied to one specific migration version, add exactly one line to the hard-coded ledger that looks like:
   ```js
   ...(versions.includes('<the_new_migration_version>')?['<the-new-requirement-id>']:[])
   ```
   placed alongside the existing lines of the same shape. This is the one change in this entire runbook that is genuinely release-parity *logic*, not data or a mirror sync. **Flag this specific edit for explicit sign-off before applying it** — not because it is risky (it is exactly as safe as every prior line of its kind), but because changes to this file's logic are the one category this project treats as requiring a deliberate decision, not an assumed default.

### A3. Verify the candidate — before touching anything else

From the Platform repo:
```
node scripts/release-parity.mjs --candidate support-v<N>
```
This must print `PASS local candidate parity {...}`. If it fails, the error names the exact missing piece — do not guess; trace the assertion to the line in `release-parity.mjs` that raised it, and check the corresponding row in the master checklist above. Do not proceed to registering files you haven't verified.

Commit both repos' registration changes once this passes. Nothing here is live yet: `approved_for_new` and `supported` are false everywhere for the new release, and no shop's available backend has changed.

---

## Part B — Promoting a registered candidate

Only start this once the owner has explicitly authorized promotion. Promotion is two independent phases; each is safe to leave half-finished overnight, but the release is not actually live to new shops until Phase 2 is both deployed and committed.

### Before you write the promotion migration

Query the Platform's live database for the table's exact current contents — do not reconstruct this from reading migration files by eye, and do not assume the last promotion migration in the repo reflects the live state (hotfixes can diverge from committed history). The promotion migration pattern self-verifies its starting state against an exact snapshot; that snapshot must be the real, current, live data.

### B1. Phase 1 — database migration (Platform)

Write `supabase/migrations/<ts>_promote_support_v<N>.sql` following the exact structure of the most recent prior `promote_support_v<N-1>.sql` file: lock the table, assert the live state matches either the expected pre-state or the expected post-state (making the migration safely re-runnable), insert the new row, update every row where `supported` is currently true (except the new one) to set `approved_for_new = false` and `successor = 'support-v<N>'`, set the new row's `approved_for_new = true`, then assert the final state exactly. Test this migration against a disposable copy seeded with the real live rows before running it for real — not against a freshly-replayed chain of every historical migration, which is slow and can fail on environment differences unrelated to the migration's own correctness.

Apply with `supabase db push --dry-run`, review, then `supabase db push`.

This phase alone changes nothing visible: nothing currently reads `approved_for_new` live from the database to decide runtime behavior.

### B2. Phase 2 — make it actually live (Platform, then Shop)

1. **`supabase/releases/approved-shop-releases.json`** — **this is a second, separate edit of the same file touched in A2.3.** Flip the new release to `approved_for_new: true`, `supported: true`, `review_status: "approved-shared"`. Flip the *previous* release to `approved_for_new: false`. Update `successor` to the new release's id on every entry that currently has `supported: true` (except the new release itself, whose `successor` stays `null`), mirroring exactly what the Phase 1 migration did to the live table. Do not skip any supported entry — the validator checks all of them, and a stray out-of-date `successor` was discoverable only by re-running the real check.
2. **`supabase/functions/_shared/shop-release-registry.ts`** — add one `import` line for the new release's JSON and one entry to its `releases` map. **Before deploying, run `git diff` on this exact file and read it.** If it shows no change, the edit was not actually saved — go back and save it before proceeding. Do not deploy from memory of having made an edit.
3. **`supabase/releases/active-shop-release.json`** — replace its `release_id`/`sha256` with the new release's.
4. **Redeploy every function that transitively imports step 2's file.** Find them with:
   ```
   grep -rln "shop-release-registry" supabase/functions --include=*.ts
   ```
   then trace any `_shared` helper hits (e.g. a module two levels removed from the registry) to whichever top-level function imports *that* helper, so the full transitive set is redeployed, not just the direct importers. Deploy each by name; confirm the deploy actually shipped the new content by checking that the function's listed version number and `updated_at` advanced (an unchanged version number after a deploy command means the deploy didn't pick up your edit).
5. **`scripts/byo-release-manifest.json`** (Shop repo) — replace its entire contents with the new release's `release_id`, `review_status: "approved-shared"`, `sha256`, `migrations` count, `functions` count, and `backend_source_commit`.

### B3. Verify promotion — against the right thing

From Platform, against its own current `development`:
```
node scripts/release-parity.mjs
```
A `PASS` here is **necessary but not sufficient.** It only proves internal consistency of the two repositories' current branches. It does **not** prove GitHub Actions will pass, because of Part C below.

Also confirm, and expect:
```
node scripts/release-parity.mjs --candidate support-v<N>
```
now correctly **fails** with `Unpromoted registered candidate required`. This is the right behavior, not a regression — a promoted release is no longer a candidate, and candidate mode is specifically for the pre-promotion state.

---

## Part C — The CI pin (Shop repo, after every promotion, without exception)

`.github/workflows/backend-parity.yml` checks out the Platform repository at a **fixed commit hash**, not at `development`, for CI stability. Every prior promotion (check `git log --follow -- .github/workflows/backend-parity.yml` for the exact precedent before assuming this runbook is out of date) was followed by a dedicated commit advancing this one `ref:` value to the new Platform promotion commit. This is mechanical — one 40-character hash changes, nothing else — but it is still a change to CI/release infrastructure, so **flag it for explicit sign-off before applying it**, same as the ledger line in A2.4.

```yaml
ref: <the Platform promotion commit from Phase 1/2 above>
```

Find the exact current value first (`grep "ref:" .github/workflows/backend-parity.yml`), and use the established commit-message convention (`[CF-Pages-Skip] Pin v<N> parity to coordinated Platform source`) so this commit doesn't trigger an unrelated Cloudflare Pages rebuild.

**To genuinely know whether CI will pass — not merely hope — reproduce the exact CI invocation, not an approximation of it:**

```
git clone <shop-repo-url> shop-check && cd shop-check && git checkout <the exact commit you pushed>
git clone <platform-repo-url> platform-check && cd platform-check
git checkout <the exact ref now in backend-parity.yml>
node scripts/release-parity.mjs --shop-root ../shop-check --platform-root .
```
Only a `PASS` from *this* invocation — fresh clones, at the exact commits GitHub Actions will actually use — is real confirmation. A `PASS` against Platform's live `development`, or against your own local working tree, proves something different and weaker.

---

## Closing checklist before calling a promotion done

- [ ] `--candidate support-v<N>` passed before any promotion step began.
- [ ] The live database table and the static `approved-shop-releases.json` agree (query one, read the other, compare by eye).
- [ ] `git diff` on `shop-release-registry.ts` showed the real change immediately before each deploy, not after.
- [ ] Every function transitively depending on the registry was redeployed, and each one's version number actually advanced.
- [ ] `scripts/byo-release-manifest.json` (Shop) reflects the new release.
- [ ] The CI pin in `.github/workflows/backend-parity.yml` was advanced, in its own flagged, sign-off commit.
- [ ] The exact CI invocation (fresh clones, exact commits, exact pinned ref) was reproduced locally and printed `PASS` — not just the default check against whatever `development` currently is.
- [ ] `--candidate support-v<N>` now correctly fails with `Unpromoted registered candidate required` — confirming the release genuinely left candidate state rather than quietly remaining in it.
