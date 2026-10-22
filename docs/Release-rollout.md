# Owner-authorized rollout order

This milestone stops at source review. No command below has been run against a
hosted project. Keep PR #5 and Shop PR #1 Draft; merging or deploying needs separate
owner authorization. Inventory exact project identities, pending jobs, installed
sender versions and effective request-hook configuration first. Never change
production branches or Cloudflare settings as part of this review checkpoint.

1. Review the final package and issue/acceptance registers. Back up each target
   using its approved backup procedure. Preserve existing migration ledgers, job
   pins, Vault entries, Auth identities and original setup/enrollment journals.
2. In the Platform checkout, inspect the exact reviewed Platform target and only
   its pending migrations. The new forward migration is
   `20261022155957_support_consent_and_release_catalog.sql`; older missing
   prerequisites require their own review. Do not apply the staged anonymous
   closure yet. After explicit target authorization:

```powershell
npx --yes supabase@2.120.0 link --project-ref EXACT_PLATFORM_REF
npx --yes supabase@2.120.0 migration list --linked
npx --yes supabase@2.120.0 db push --linked --dry-run
# Only after the displayed pending migration list is approved:
npx --yes supabase@2.120.0 db push --linked
npx --yes supabase@2.120.0 functions deploy platform-provision --project-ref EXACT_PLATFORM_REF --use-api --no-verify-jwt
npx --yes supabase@2.120.0 functions deploy platform-support --project-ref EXACT_PLATFORM_REF --use-api --no-verify-jwt
```

3. `platform-provision` carries the final release registry/pointer/package and
   optional Support reconciler. `platform-support` carries the consent/capability
   gate. Preserve config.toml JWT settings and existing server secrets. Existing
   pre-consent unconsumed grants fail closed; request a new owner approval.
4. Existing initialized Shops use [the additive upgrade](Existing-shop-upgrade.md)
   before new privileged Support access. Deploy all seven packaged functions and
   missing SQL, not just support-tickets. Require hosted proof of the effective
   `public.support_request_guard` hook, expiry/revocation of subsequent requests,
   active owner and case/binding verification. Custom hooks require composition
   review; no automatic overwrite. Pending older jobs stay on their old artifacts.
5. Authorize new Managed provisioning and new BYO installation from the final
   shared release separately. Managed installs all SQL and six core functions;
   optional enrollment installs support-tickets from that same package after owner
   activation/onboarding. Report optional Support pending distinctly; do not block
   normal POS or claim the seventh function/enrollment passed early. BYO installs
   all seven using the customer's own CLI and exact public/private inputs. Use
   Platform Client Detail's guided commands and the original external journal.
6. Build frontends from the reviewed commits using each target's explicit public
   JSON; verify dist before the separately authorized Pages upload. No Wrangler
   deployment is part of this milestone. Turnstile site keys must be real keys for
   each customer's hostname and matching private widget secret, never fixture keys.

```powershell
# In each intended repository, with its own public JSON and exact project ref:
node scripts/build-verified.mjs --config C:/Private/RetraSell/public.json --project-ref EXACT_PROJECT_REF
node scripts/build-verified.mjs --config C:/Private/RetraSell/public.json --project-ref EXACT_PROJECT_REF --verify-dist
```

7. Complete independent fresh Managed and BYO owner activation, onboarding,
   browser CAPTCHA, Support, consent/revoke, Paper, billing and POS acceptance plus
   the final comprehensive security audit. Hosted Management/Auth/PostgREST and
   existing Realtime connection behavior are not proven by local SQL fixtures.
8. **Anonymous-intake closure is a release blocker.** Inventory supported installed
   senders, upgrade/verify authenticated proxies and record owner compatibility
   approval. Only then use `supabase migration new close_legacy_support_reviewed`
   to create a new forward migration from
   `supabase/staged-migrations/close_legacy_support_after_review.sql`, adding the
   reviewed transaction-local compatibility approval before its guard. Review its
   dry-run before applying. The script revokes table/column/sequence access and
   policy, preserving old records as legacy/unverified. Do not fabricate provenance.

Recovery: retain old immutable packages and fingerprints. Missing pinned packages
fail closed; restore the exact artifact. Never repin an interrupted job, revert
applied SQL, reset a Shop, rotate secrets or redo owner bootstrap to bypass a
failure. An uncertain function write needs authoritative provider source/gateway
review and an explicit attestation in the original upgrade journal. A new backend
change requires a new immutable release/fingerprint and coordinated selectors.
