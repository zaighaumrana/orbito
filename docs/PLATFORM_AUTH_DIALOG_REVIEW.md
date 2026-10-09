# Platform Auth and dialog review — 2026-10-10

Base: development cdf94107201382dbd95e741d59e1923f819973d9.
Branch: fix/platform-auth-and-dialogs. Frontend source only; no hosted writes.

## Confirmed defect and authorization

The owner supplied the sanitized Auth response: code captcha_failed, message
"captcha protection: request disallowed (no captcha_token found)". The password
grant in Change Username omitted options.captchaToken, while normal login includes
it. The former handler mislabeled every failure as an incorrect password. This
response establishes CAPTCHA enforcement for the failing grant; no provider
configuration or credentials were retrieved or changed.

Settings now mounts its own fresh Turnstile challenge. Each submission consumes
the token, blocks overlapping submissions and resets verification on every outcome.
A separate, reused, memory-only Auth client verifies the current password against
the canonical Auth email. It has a distinct storage key, no persistent session,
auto refresh or URL session detection. Installed auth-js only creates a broadcast
channel for persistent clients; this verifier does not broadcast to the login client.
It revokes only its own new verification session with scope local, and fails closed
if cleanup fails. No password or verification token is logged or stored by application
code. CAPTCHA, invalid password, session, authorization, network and rate-limit
failures have distinct safe messages.

The original client verifies Auth identity and platform_operator_identity before
and after verification. Master UUID, role and Auth email must remain consistent;
Manager/Billing cannot use this path. Only admin_username is updated through the
existing RLS boundary. The Auth email and UUID are independent of that alias. A
returned row must confirm id=1 and the requested alias before cache/success changes.
Missing/zero-row/failed updates remain uncertain, with refresh-before-retry guidance.
This is frontend password confirmation, not a new server-enforced reauthentication
policy; existing database and Edge authorization remains authoritative.

Hosted success is UNVERIFIED: no real alias/password/account was changed. The
original browser session storage is preserved by implementation/tests. Provider
session limits (including single-session enforcement), actual CAPTCHA acceptance,
reauth session revocation and original-session refresh continuity require an
owner-authorized hosted check before declaring the deployed bug resolved.

## UI architecture

src/dialogs.js owns an independent body layer that survives app rerenders. Toasts
use textContent, never HTML, have manual dismissal and independent cleanup; error
and warning notifications persist. Untrusted Error objects use a safe generic
message unless the application supplies a reviewed userMessage. Known local
validation strings retain their wording. Credential-shaped strings are redacted.
Uncertain team mutations direct the operator to server audit before another attempt.
Pending invitations retain persistent wait/check guidance rather than false success.

Promise dialogs serialize blocking requests, label their content, trap Tab/Shift+Tab,
move/restore focus, support Escape/Cancel/backdrop dismissal and restore existing
inert state and scroll position settings. Only explicit form submission confirms;
completion is one-shot. A reusable labelled/validated input dialog is included;
there were no native prompts or required prompt workflows to migrate. Session
expiry/logout cancels outstanding decisions. Team removal captures its target,
disables repeat clicks and rechecks canonical master identity after confirmation.
Provisioning keeps the existing whole-form busy guard, request IDs and server retry
state; no activation/rotation request is sent before confirmation. Existing invoice
preview/printing remains unchanged. CSS uses the existing light/dark variables,
responsive modal rules and reduced-motion preference. Shop modal CSS was inspected
read-only; no Shop logic, source or managed-release artifact was modified.

## Complete native-dialog inventory

39 original application-owned calls: 36 alerts, three confirms, zero prompts.
Locations below refer to the reviewed base commit. Complete src JS/HTML and root
HTML search found no other native wrappers. Each call was replaced; current source
contains zero native alert/confirm/prompt invocations.

| Base location | Native call | Original purpose/expression | Replacement |
| --- | --- | --- | --- |
| src/forms.js:35 | alert | 'Read-back has not confirmed the intended change. The operation remains unresolved.') | Blocking acknowledgment |
| src/forms.js:38 | alert | error.message) | Persistent error toast |
| src/forms.js:56 | alert | error.message) | Persistent error toast |
| src/forms.js:57 | alert | 'Break Tracking requires Pro Plus / EMS.') | Persistent error toast |
| src/forms.js:78 | alert | "Error: " + error.message) | Persistent error toast |
| src/forms.js:99 | alert | "Error: " + error.message) | Persistent error toast |
| src/forms.js:136 | alert | "Only Master Admin can add users.") | Persistent error toast |
| src/forms.js:141 | alert | "Error sending invite: " + fnErr.message) | Persistent error toast |
| src/forms.js:142 | alert | "Invite sent. They'll receive an email to set up their account.") | Success toast |
| src/forms.js:150 | alert | "Only Master Admin can edit users.") | Persistent error toast |
| src/forms.js:154 | alert | pwErr) | Persistent error toast |
| src/forms.js:159 | alert | "Team update failed. Review the server audit before retrying: " + fnErr.message) | Persistent error toast |
| src/forms.js:166 | alert | "Passwords don't match.") | Persistent error toast |
| src/forms.js:168 | alert | pwErr) | Persistent error toast |
| src/forms.js:170 | alert | "Error: " + error.message) | Persistent error toast |
| src/forms.js:171 | alert | "Password updated. Please log in again.") | Success toast |
| src/forms.js:183 | alert | "Current password is wrong.") | Persistent error toast |
| src/forms.js:186 | alert | "Error: " + error.message) | Persistent error toast |
| src/forms.js:188 | alert | "Username updated.") | Success toast |
| src/forms.js:194 | alert | "Passwords don't match.") | Persistent error toast |
| src/forms.js:196 | alert | pwErr) | Persistent error toast |
| src/forms.js:198 | alert | "Error: " + error.message) | Persistent error toast |
| src/forms.js:199 | alert | "Password updated. Please log in again.") | Success toast |
| src/events.js:48 | alert | error.message) | Persistent error toast |
| src/events.js:53 | alert | 'Copy is unavailable. Select the displayed value to copy it.') | Persistent error toast |
| src/events.js:349 | alert | "Only Master Admin can remove users.") | Persistent error toast |
| src/events.js:351 | confirm | "Remove this user? They will lose all access immediately.")) return; | Awaited blocking confirmation |
| src/events.js:354 | alert | "Team removal failed. Review the server audit before retrying: " + fnErr.message) | Persistent error toast |
| src/events.js:363 | alert | error.message) | Persistent error toast |
| src/events.js:369 | alert | error.message) | Persistent error toast |
| src/main.js:15 | alert | error.message) | Persistent error toast |
| src/main.js:112 | alert | error.message) | Persistent error toast |
| src/provisioning.js:31 | alert | data.message) | Information / persistent pending-invitation warning |
| src/provisioning.js:41 | alert | error.message) | Persistent error toast |
| src/provisioning.js:117 | confirm | 'Activate bridge billing for this client at the exact Shop sequence captured by the server? Keep Shop writes paused until success.')) return; | Awaited blocking confirmation |
| src/provisioning.js:119 | confirm | 'Rotate the bridge secret server-side? Delivery may pause until this operation completes.')) return; | Awaited blocking confirmation |
| src/provisioning.js:132 | alert | error.message) | Persistent error toast |
| src/billing.js:247 | alert | "Pop-up blocked. Please allow pop-ups for this site and try again.") | Persistent error toast |
| src/local-preview.js:38 | alert | 'Read-only sample preview. This action becomes available against the deployed Platform backend.') | Information / persistent pending-invitation warning |

Intentional browser-managed UI remains: invoice print/print-preview window and
printer/PDF chooser; provider CAPTCHA; browser password-manager UI; clipboard
permission/security restrictions; setup-file download/save UI. None is an
application alert, confirm or prompt. No custom 404 or routing change.

## Validation and limitations

PASS: 193 local cases across 13 relevant suites (174 existing plus 19 focused
Auth/dialog cases), including server-handler security doubles. Real source handlers
execute against explicit synthetic Auth/DOM/transport fixtures. Tests cover fresh
and expired CAPTCHA, correct/incorrect password, stale session, ordinary roles,
identity drift, cleanup failure, failed/zero-row alias writes, duplicate submissions,
password flows, invitation/edit/removal, lifecycle suspend/reactivate, billing print
cancellation, provisioning retries, unresolved acknowledgment, queue/keyboard/focus,
toast dismissal, theme markup/CSS and token generation cleanup.

PASS: npm run build with all four public settings overridden by synthetic values,
output outside Git removed after validation; application and changed-test syntax;
whitespace; unchanged circular-import components; unchanged 12 migrations, Edge
Functions, Shop release artifact, public routing, packages and environment files.
Sensitive-value review includes new source/docs/tests and staged additions.
Existing Vite CJS Node API deprecation and Node experimental TypeScript-strip warning
remain. No warning suppression or package changes.

Initial local runs failed on fixture extraction/missing new dialog dependencies;
fixtures were corrected and affected cases rerun successfully. The optional
production-bootstrap database suite was attempted and FAILED before executing its
groups because ORBITO_BOOTSTRAP_TEST_CONTAINER is unset. No disposable database was
created; no database result is claimed. Other opt-in database/CLI/Shop restore suites
are SKIP for this frontend scope, not presumed passes.

SKIP: actual browser, accessibility/password-manager and desktop/mobile layout
checks: browser automation initialization fails with kernel-assets os error 3.
SKIP: hosted login/alias/password/team writes, email delivery, session-limit behavior,
lifecycle/billing/provisioning writes and changed-frontend routing verification;
not deployed and no real writes authorized. Mocks are not hosted validation.

## Review and later owner-authorized smoke

Push only this feature branch using the approved [CF-Pages-Skip] commit prefix and
open a draft PR to development. Do not merge/deploy. A later authorized merge must
omit the skip prefix if deployment is intended. The skip instruction is documented
provider behavior; actual Cloudflare deployment inventory is unavailable through
current connectors, so no provider-verified exclusion is claimed.

After separate deployment/test authorization: confirm login/logout and read-only
Clients/Team/Billing/Settings; test fresh CAPTCHA username confirmation using an
approved account, wrong password and expired CAPTCHA without update/success; verify
original-session refresh after reauthentication; exercise master/own password and
team invitation/edit/removal only with separately approved disposable accounts;
cancel every destructive dialog; confirm server-side Manager/Billing denial;
check invoice cancel/print, original provisioning request resume, error toasts,
keyboard/screen-reader navigation, light/dark themes and 320/768/1440px layouts.
Do not modify the owner's credentials as a casual smoke test.

References: [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
[Supabase signout scopes](https://supabase.com/docs/guides/auth/signout),
[WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[Cloudflare Git skip prefixes](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
