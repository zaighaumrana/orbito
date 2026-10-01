# Managed and client-owned Supabase onboarding

Manual owner activation is the default. Runtime uses per-Shop bridge tokens independently of organization/account ownership. Customers never provide Platform a Supabase account password, service-role/secret API key, DB password or permanent PAT.

| Credential | Boundary | Location |
| --- | --- | --- |
| PLATFORM_SCHEDULER_SECRET | cron → Platform provisioner | Platform only; matching scheduler Vault entry |
| PLATFORM_BRIDGE_CALL_SECRET | Platform → one Shop operations | Platform Vault and that Shop Edge secrets |
| PLATFORM_BRIDGE_SOURCE_SECRET | Shop → Platform ingestion | Shop Edge secrets, Platform Vault/source hash |
| PLATFORM_BRIDGE_ENDPOINT | Non-secret ingestion address | Shop Edge settings |
| Shop SUPABASE_SERVICE_ROLE_KEY | Shop server → own DB/Auth | Shop only; never submitted to Platform |
| PLATFORM_MANAGEMENT_TOKEN | Authorized managed setup | Platform server; Platform-owned authorization |

These credentials stay separate. Bridge tokens are sensitive and long-lived but do not grant database administration. No owner password flows through Platform.

## Deployment prerequisites

Deploy both complete migration chains, including the V2 and manual-activation forward migrations, via the approved workflow. A GitHub connection alone does not prove deployment. Deploy the six Shop Edge Functions: login, account-admin, verify-pin, password-reset-request, public-track, platform-bridge. Preserve config.toml gateway settings: only platform-bridge opts out of gateway JWT verification and validates the opaque call token itself before DB/Auth work. Preserve Turnstile and existing own-project credentials. Deploy matching Platform functions/frontend and the Shop frontend with its own public/anon key. Existing Shops need the updated bridge config operations before switching the Platform caller. Preserve the shared scheduler cadence.

Use HTTPS at the Shop origin root and SPA fallback for /onboarding and, if optional invitations are enabled, /invite/accept. Custom SMTP and invitation redirect configuration are optional email requirements, not requirements for the default manual owner setup.

## Managed pairing

Platform Management authorization must cover the target Shop project. Choose Managed then **Pair managed Shop**. Platform installs the call token, source token and endpoint, then starts SMTP-free bootstrap/reservation. Access rejection requires correcting Platform's authorization or choosing BYO; never supply a foreign privileged key. Retry preserves generated tokens and owner identity.

## BYO pairing and manual owner creation

1. Choose Client-owned/BYO. The customer temporarily grants an authorized operator project access or follows setup through screen sharing. Never collect their Supabase login password. Their own local CLI authorization remains with them.
2. A Platform master administrator selects **Download BYO pairing file**. The sensitive orbito-shop-pairing.env contains exactly two secrets, PLATFORM_BRIDGE_CALL_SECRET and PLATFORM_BRIDGE_SOURCE_SECRET, plus the non-secret PLATFORM_BRIDGE_ENDPOINT. Response is no-store; the file is not put in HTML, logs, browser storage, analytics, query strings or permanent client/job data. Intended token copies remain in Platform Vault and Shop secrets.
3. An authorized Shop project operator confirms the project ref and CLI command help, then installs locally:

   ```sh
   supabase secrets set --project-ref SHOP_PROJECT_REF --env-file orbito-shop-pairing.env
   ```

   Never send local CLI authorization/PATs to Platform. If transfer is needed, use an approved secure channel. Securely remove the pairing file afterward; keep it out of Git/chat/logs/backups. The app cannot erase downloaded copies. Re-downloading reuses the tokens; it is not an expiring credential or rotation.
4. Select **Provision Shop / Reserve owner**. The Shop reserves immutable owner identity and enables bridge infrastructure without an Auth email request. Platform registers/projects through the existing billing control plane. Watch Infrastructure Ready / Owner Setup Pending manual activation.
5. In the Shop Supabase Dashboard → Authentication → Users, create the exact reserved owner email, password and confirmed email after verifying intended ownership. Password entry stays directly in Shop Auth administration. Securely give account access to the owner outside Platform, then remove temporary project permissions.
6. The owner logs in normally. Verified confirmed exact-email Auth identity atomically claims the one canonical Business Owner with employee_id NULL and enters the six-step wizard. Select **Check Owner Account** to refresh Platform's safe observations after login/completion; an external account not yet claimed still reports pending.

Wrong/unconfirmed users cannot claim ownership. An existing canonical owner cannot be replaced. Existing initialized Shops, including Client 1, must not be reset/re-provisioned. Ordinary V2 settings cannot edit owner identity.

## Optional invitation

Explicitly choose **Send optional email invitation** after infrastructure is ready. Configure functional Shop Auth email delivery and exact allowed HTTPS /invite/accept redirect; custom SMTP is recommended for reliable optional email. Default Supabase mail restrictions/rate limits and provider delivery must be verified for that project. No SMTP secret belongs in Platform records or application code. An unallowed redirect may fall back to Site URL per [Supabase Auth documentation](https://supabase.com/docs/guides/auth/users).

Auth acceptance is not inbox delivery. Invitation acceptance verifies reserved UUID/email, canonical owner and suspension before establishing a password through the authenticated Shop Auth session. Both setup paths use the same owner mapping. Definite rejection leaves infrastructure ready and manual setup available. Unknown Auth outcomes keep a two-minute lease and must be checked in Shop Auth before another request. No automatic email resend/scheduler invitation retry exists. If Auth already created the invitation identity, use that same account for operator-assisted manual recovery; never create a duplicate or replace the owner. Expired invitation recovery stays manual.

Hosted Auth behavior, optional SMTP/redirects, Vault encryption/grants, Management scopes, Edge propagation, cross-account BYO installation and Cloudflare SPA routing remain unproven locally. Hosted legacy credential inventory/cleanup remains a release operation; follow LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md without reading decrypted values. Active V2 requires none of the historical privileged Shop credentials. No hosted project or legal worktree was accessed or changed during this work.
