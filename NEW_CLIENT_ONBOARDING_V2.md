# New client onboarding V2

Manual-first owner activation is the default on feature/onboarding-v2. Email delivery and custom SMTP are not standard provisioning requirements. Development changes are local: no deployment, hosted migrations/secrets, scheduler changes or Client 1 reprovisioning were performed.

## Default lifecycle

1. Save the business name, owner name/email, plan, Inventory/Paper addons, independently selected Break Tracking (valid only with EMS), billing currency/rates, HTTPS Shop URL and project ref. Choose managed or client-owned/BYO pairing. SQL normalizes owner email and derives the canonical module snapshot. Platform collects no owner password.
2. A master administrator pairs the Shop. Managed setup uses Platform-owned Management authorization; BYO downloads the sensitive two-token pairing file for an authorized customer-project operator. No customer service-role key, secret API key, DB password, permanent PAT or Supabase login credentials are required.
3. Select **Provision Shop / Reserve owner** after BYO installation; managed pairing starts the same action immediately. Shop bootstrap reserves immutable owner name/email/request identity, applies the initial modules and enables the bridge without sending email. Platform registers the source and projects existing billing/configuration. Retry reuses the same snapshot. Infrastructure succeeds independently of SMTP.
4. Platform reports **Infrastructure: Ready**, **Owner Setup: Pending manual activation**, and **Reserved Owner**. An authorized operator opens that Shop's Supabase Dashboard → Authentication → Users and creates the exact reserved email with a password and confirmed email. Verify the intended owner's address before administrative confirmation. This account/password is created directly in Shop Auth; never put the password in Platform, chat, application tables or bridge payloads.
5. For BYO, the customer temporarily grants authorized project access or follows instructions through screen sharing. Never ask for the customer's Supabase account password or privileged keys. Securely transfer owner account access directly to the intended owner using the agreed process and revoke temporary project access after verification.
6. The owner logs into OrbitoShop normally. The Shop login gateway authenticates with its own Supabase Auth and verifies the session server-side. The no-argument authenticated activation RPC reads the JWT identity and protected reservation, requires confirmed exact normalized email, pending V2 setup and no conflicting owner, then atomically creates/confirms one Active Business Owner app_users row with employee_id NULL. The owner cannot choose a role. Unknown/mismatched/unconfirmed identities fail closed without disclosing the reserved email. Duplicate/concurrent claims are idempotent.
7. The owner is forced into the six-step wizard: Business/Branding, Contact, Receipt/Tax, Security, Plan Features, Review/Complete. Security preserves the existing override PIN flow; password creation is already handled by Auth. Completion verifies identity, password and required settings server-side, then enables normal routes. Failed private config reads and suspension remain fail closed; Support retains its existing exemption.
8. **Check Owner Account** refreshes safe bridge observations. Creating an external Auth user alone does not mark owner active: the matching verified session must claim it. Platform does not enumerate or expose Auth internals. V2 ordinary settings cannot change the reserved owner identity.

Existing Shops remain initialized and cannot be reset by bootstrap/manual claim. Do not reset, re-provision or recreate Client 1.

## State and optional email

Infrastructure pending → paired → SMTP-free reservation/source/config projection → infrastructure ready.

Owner owner_setup_pending → confirmed Auth account created externally → authenticated reserved identity atomically claimed → owner_active → onboarding_pending wizard → onboarding_complete.

**Send optional email invitation** is a secondary, explicit master-admin action available after infrastructure is ready. It alone calls inviteUserByEmail through the Shop's own Auth admin. The optional path converges on the same protected activation helper and canonical owner. It requires functional Shop Auth email delivery and the exact allowed /invite/accept URL; custom SMTP is recommended for reliable production email, not required for manual setup. Sent does not prove inbox delivery.

A definite email rejection records failed; unknown network/5xx/finish outcomes retain the two-minute recovery lease. Optional delivery failure does not undo infrastructure or manual activation. Check Shop Auth after unknown outcomes before requesting another invitation. The scheduler automatically retries only bootstrap, never invitation delivery; cadence is unchanged. For expired invites use supported operator-assisted Shop Auth controls. If an invited account already exists, confirm/setup that same identity directly in the Shop Dashboard for manual recovery instead of creating a duplicate. Do not delete an owner or replace the reservation.

## Deployment and validation

Apply both repositories' full migration chains, including 20260929090000_onboarding_v2.sql and the forward 20261001090000_manual_owner_activation.sql, through the approved release workflow, then deploy matching Edge/frontend versions. Preserve JWT settings and the existing schedule. Historical migrations are not rewritten. See BYO_SUPABASE_ONBOARDING.md and LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md for deployment boundaries and metadata-only retired-credential inventory.

Run all Node suites with node --test tests/*.test.mjs in both repositories, production builds, both diff checks and Platform tests/run-onboarding-local.mjs against disposable loopback PostgreSQL. The cross-repository runner applies full migrations, manual/invite/conflict/ACL/completion fixtures, configured-Shop preservation, metering/ledger regressions and real concurrent invitation/manual claims. Stock PostgreSQL uses minimal Auth and a Vault substitute; hosted Auth, Vault encryption, Management access, cross-account installation, gateway/SMTP/redirect behavior and Cloudflare routing require hosted verification. No production secret values are read by the runner.

Supabase's distinction between direct administrative account creation and email invitation is documented in [Auth users](https://supabase.com/docs/guides/auth/users). Hosted legacy credential inventory/cleanup remains a release operation, not an active V2 dependency.
