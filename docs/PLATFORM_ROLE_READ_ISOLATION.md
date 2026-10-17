# Platform employee read isolation — 2026-10-13

## Later hosted acceptance update —2026-10-17

The [final hosted acceptance and conditional merge decision](PR4_HOSTED_ACCEPTANCE_2026-10-17.md)
supersedes earlier current-status statements below:staging has17 migrations;
config12/support5/provision19 source matches541c46d,D1 source drift resolved;
permanent deletion remains disabled;canonical Pages manual deployment56fa2285
serves541c46d. A06 current-password configuration is directly verified enabled,
not a hosted password-change test. Owner UI/API acceptance,independent reads and
partial provider checks remain separately attributed. Merge is conditionally
owner-authorized subject to gates/checks;production remains NO-GO and before-use
Shop/finance/Support/provider obligations remain. Prior reports are historical.


## Migration17 bounded operational extension —2026-10-17

Migration17 is now recorded on staging. Master/Manager additionally receive bounded
generation,pending and desired-entitlement data through `platform_config_intent`,
and `entitlement_intent` generation/pending in `platform_overhaul_status`.
Billing remains denied these operational surfaces. Raw-row ceilings and the
migration14 field matrix remain unchanged;this is not private provisioning exposure.
The matching config/support/frontend contracts are deployed at541c46d source.
Source comparison does not certify hosted Shop synchronization or Support exchange.

## Current superseding status — 2026-10-17

The current reviewed code checkpoint is `27f6abde0274ac6c989664d0b363504b93128d10`
on `feature/platform-team-lifecycle-v2`, Draft PR #4 targeting `development`.
All 14 source/correction commits are committed and pushed; the cumulative code
checkpoint is 131 paths, not the earlier 39/61/62/63-file local inventories.
The definitive [acceptance/deferred-testing register](PR4_ACCEPTANCE_AND_DEFERRED_TESTS.md)
and [120-case ledger](PR4_ACCEPTANCE_CASES.csv) supersede current-status claims below.
The original dated checkpoints and failures remain historical evidence.

Independent final review approved documentation finalization only: F1/F2/F3/N1/N2/N3
are locally corrected and independently verified within their recorded scopes.
Owner-reported employee staging journeys and independent state reads are separate
from local tests. Staging has 16 genuine migrations; source migration 17 is unapplied.
Eight employee bundles are deployed (12 functions total), while newer config/support
corrections and D1 provisioner source drift still require authorized rollout.
The permanent-deletion policy was last independently verified **false**.
Git `development` remains `0dbde676ca57ed1599a295e221d274ef080cac41`;
canonical staging Pages serves ad hoc `d3fc517aabb2b5d09ea939aa56830287b5d89bba`,
not the latest feature corrections. Later correction SHAs were skipped by Cloudflare;
production-branch auto-deploy remains enabled, so a future merge may deploy.
No merge/deployment authorization or whole-Platform production GO follows.

D31–D32/D40: Migration14 is recorded on staging; its effective field/RPC
matrix below remains authoritative. The “local/not deployed” introduction and
future13/14 release plan describe the original 2026-10-13 checkpoint. Do not
replay them against current staging. Owner UI denials, independent local real
SQL/PostgREST negatives and unexecuted hosted raw REST/GraphQL/provider tests
are distinct evidence. Historical Manager/Billing shared raw reads are superseded;
no private provisioning columns become browser-visible. F2/F3 are corrected
locally by17, still requiring coordinated authorized hosted rollout.

## Historical implementation and effective permission matrix


Source baseline: `6ea96cbc6cddda1b07b37646dba7e3456e45d52f`.
Owner explicitly supersedes the inherited shared-read contract. This document
describes the local migration-14 implementation, not deployed permissions.
Keep Draft PR #4 unmerged. **Staging and production remain NO-GO.**

## Effective contract

All browser accounts use PostgreSQL `authenticated`. Granting SELECT on a row
does not hide its columns, and a role-specific browser menu is not authorization.
Raw application rows therefore remain behind canonical **Master-only SELECT RLS**;
employees receive fixed, server-selected JSON projections instead. Master retains
legitimate administration; Vault/Management/service secrets remain server-only,
including for the Master browser. `platform_config` browser access still permits
only `id,admin_username`, now Master-only.

| Surface | Master | Portfolio Manager | Billing Person |
| --- | --- | --- | --- |
| Raw application tables | Existing legitimate rows/columns | No rows | No rows |
| Team | Current profiles/history/archive | Own profile only | Own profile only |
| Client read | Full legitimate record | Current operational fields | Minimum billing fields, including retained billing identity |
| Client writes | Existing direct/RPC authority | Bounded create/edit RPC, prior support/paper/config authority | No client-management writes; existing rate/currency financial RPCs only |
| Support | Contents and resolution | Contents and resolution | Open-ticket aggregate count only |
| Invoice read | Full legitimate ledger | Dates/totals/status summaries for current clients | Financial invoice projection, including archived client ledger records |
| Invoice View/print | Yes | No — owner confirmed this decision | Yes |
| Payment/credit/rate/usage read | Full legitimate ledger | Approved usage/charge/outstanding aggregates only | Explicit financial fields; no employee actor IDs, ingestion metadata or provider bindings |
| Paper/thermal | Existing operations | Operational requests/deliveries and thermal aggregates | No operational contents |
| Provider/provisioning/config history | Master-only | Entitlement flags and minimal unresolved-config request/state only | None |
| Audit/archive/private configuration/secrets | Master administration; secrets server-only | None | None |
| Platform Storage/private channels | Existing permissive policy plus live Master ceiling | None | None |
| Postgres change streams | Application publication membership removed; frontend uses no channels | No application streams | No application streams |

Canonical `operator_role()` from migration 13 is unchanged: protected bound UUID,
confirmed active non-anonymous Auth identity, matching live owned session, current
active/email-matched mapping, archive/deletion/master-disablement and permanent
deactivation/reactivation cutoff/AMR checks. JWT user metadata and requested roles
grant no authority. Pending accounts retain their own setup-only context, not
operational data. Role edits keep the same session; suspension cutoffs stay permanent.

## Column contracts

`platform_private.client_read` exposes Manager `id,name,industry,plan,status,
lifecycle_state,infrastructure_state,shop_url,created_at,onboarding_version,
pairing_mode,currency,currency_symbol,billing_policy,accounting_review_required,
event_rate,inventory_rate,bill_billable,inventory_billable,grace_period_ends_at,
repair_module_enabled,inventory_module_enabled,technician_module_enabled,
live_tracking_enabled,ems_enabled,ems_track_breaks,paper_resupply_enabled,
config_synced_at`. Basic availability and entitlement flags support the existing
operational UI. Owner contact, Supabase URL/anon, desired payloads, provider keys,
project bindings and technical provisioning records are excluded. Manager can
still supply required owner/project inputs when creating a client; they are not
returned as a general read capability. Only Master completes secure Shop setup.

Billing client fields are `id,name,plan,status,lifecycle_state,currency,
currency_symbol,billing_policy,accounting_review_required,event_rate,inventory_rate,
bill_billable,inventory_billable,grace_period_ends_at`. No owner, Shop/provider URL,
industry, infrastructure or provisioning payload. Billing navigation directs to
Billing instead of the forbidden operational Client detail.

Manager invoice summaries contain exactly `id,client_id,period_start,period_end,
created_at,total_due,status,payment_status`. Billing additionally receives actual
invoice dates, rates/counts/charge breakdowns, paid/due dates, fixed/legacy charge
fields, carry/current/remaining amounts needed by the existing preview and print.
Invoice notes, `policy_snapshot,request_id,usage_cutoff` are excluded. Existing
financial mutation RPCs retain their composite return type: excluded columns are
NULL for Billing, with an explicit field list for future-column safety.

Billing payment fields are `id,invoice_id,client_id,amount,payment_method,
payment_date,notes,created_at`; notes are financial context, while `recorded_by`
and `request_id` are excluded. Credits expose the existing financial balance/
clearing fields. Rate history omits notes. Usage exposes only `id,recorded_at,
client_id,module_type,token_count,rate_at_log,is_invoiced,billing_cycle_id` for
BILL/INVENTORY with non-excluded ownership; no event envelope, pricing metadata,
source sequence or thermal raw metadata.

Own account projection contains `id,auth_user_id,name,email,role,status,created_at`.
Support projection contains the eight existing ticket fields. Open-ticket count
is a separate aggregate. Manager sees no archived operational clients/invoices;
Billing retains minimal financial history for archived clients. The versioned
schema requires a non-NULL client foreign key; the populated fixture preserves
that constraint and makes no orphan-record coverage claim. Financial queries
must not silently discard retained records through operational-client filters.

## Complete versioned access-surface inventory

| Surface / indirect path | Enforcement and compatibility |
| --- | --- |
| `clients,usage_logs,billing_cycles,payments,client_credit,pricing_rate_log,platform_config,platform_users,support_tickets,bridge_sources,bridge_events,bridge_failures,billing_projections,paper_requests,paper_supplies,operator_audit,config_jobs` | All 17 inherited `operator_read` policies become Master-only, with a restrictive PUBLIC Master SELECT ceiling so another permissive policy cannot OR around it. Existing Master column grants/RLS stay; no employee raw-row SELECT exception. |
| `platform_team_archive` | Existing Master-only immutable archive policy unchanged. |
| `platform_read_page(text,integer)` | Definer, postgres-owned, empty search path; live role chooses authorized datasets and immutable field lists. 1000-row pagination, validated offset, own profile only; role/UUID/session included in each response. Unsupported/forbidden dataset raises 42501. |
| `platform_usage_summary`, `platform_dashboard_summary` | Approved numeric usage/charge and support-count aggregates. Manager operational aggregates exclude archived/unknown clients; Master/Billing keep complete financial aggregates. |
| `platform_client_operations` | Master previous complete result; Manager fixed paper/thermal/outstanding/availability projection. Billing denied **before platform-config constructs its service client or retrieves credentials**. |
| `platform_overhaul_status` | Master prior config/stage/audit result; Manager unresolved request ID/state only to prevent overlapping writes. Billing denied. No actor/reason/result/history leakage. |
| `platform_provision_status` | Master-only public complete read; private helper EXECUTE closed. Service-only provisioning status/credential/poll/retry APIs retain their existing boundaries. |
| `platform_generate_invoice`, `platform_record_payment` | Existing Master/Billing internal authorization/idempotency/locking/audit preserved; definer public wrappers return sanitized Billing composites. Direct private helper execution denied. |
| `platform_set_rates`, `platform_set_currency`, `platform_paper_action`, `platform_set_paper` | Existing internal role checks preserved; public wrappers become definers before private EXECUTE is revoked. No new role privilege. Manager edit currency is readonly because existing currency RPC already denies Manager. |
| `platform_begin_config` | Existing Master/Manager target/boolean/idempotency protocol; bounded response excludes actor/recovery/result history. Recovery/reconcile/finish remain their original Master/service boundaries. |
| `platform_save_client`, `platform_resolve_ticket` | Bounded replacements for Manager SELECT-dependent direct writes. Exact create/edit field lists; existing binding/default/lifecycle triggers, row locks, role checks and no arbitrary-column update. Billing denied. Support resolution only status/timestamp, no response contents. |
| Private functions | Auth/anon/PUBLIC EXECUTE revoked for every private helper except canonical `operator_role`/`require_role`. Master uses public checked wrappers; bootstrap still trusted-postgres-only. Service rights are retained where previously legitimate. Accidental private-schema API exposure cannot reopen full reads. |
| Team/setup/session identity RPCs | Service-only commands/password steps and Master-only history unchanged. Setup returns caller-only context. `platform_operator_identity` returns own canonical identity; `platform_session_status` adds only own live role/session. |
| Support issuance/exchange | Migration-13 service-only five-argument issuance, real Master session and private canonical capability actor checks unchanged. Old four-argument signature stays revoked. No fabricated user claims or new browser grant issuance. |
| Views/materialized views | None in the versioned application/catalog fixture. Preflight blocks unexpected public/private views; hosted/provider/custom views and functions still need read-only inventory. No owner-bypassing convenience view introduced. |
| GraphQL / exposed-schema drift | Native table access must obey the same grants/RLS; no versioned custom GraphQL resolver. Full hosted GraphQL/exposed schemas and unknown definer APIs remain a separate preflight gate; not certified from local PostgREST. |
| Storage / Realtime | Managed objects must exist and have RLS/owner permissions. Additional restrictive live-Master policy composes with provider policies. Remove all known public/private application tables from `supabase_realtime`; fail on ALL TABLES or schema-level application membership. DELETE notifications cannot be protected by SELECT RLS alone. Public-channel/provider configuration requires hosted review; no application broadcast/subscription workflow exists. |
| Edge Functions | Versioned team/setup/provision/support handlers preserve verified native Auth/canonical Master/service boundaries. `platform-config` uses the revised client-operations boundary; Billing is denied there. `platform-bridge` preserves signed bound-source/scheduler trust. No Edge code/JWT configuration changes in this correction. |

The audit is of versioned source plus disposable populated catalogs, not a claim
that arbitrary unversioned hosted functions/policies have been inventoried.

## Frontend state and failure behavior

Master keeps its complete paginated administrative loader. Manager requests only
clients/support/invoice summaries/own account; Billing requests only clients/
financial usage/invoices/payments/credits/rates/own account. Both get approved
aggregates. Employees skip `platform_config`; no fetch-all/discard-in-JavaScript
approach. Each response verifies canonical UUID/session/role before publication.

A detected canonical role edit synchronously clears cached datasets, client detail,
selected target, modal, navigation/filter, alias and previous authority generation.
The same verified Auth session stays. New datasets are loaded only for the new
role. Failure of native refresh cannot retain the old role's records. Detection
uses the existing session validation events/focus/timer and read refresh; already
delivered information cannot be retroactively made unread. Server permissions
change on subsequent requests regardless of browser detection latency.

Read errors set an explicit unavailable state and render it; they are never an
empty successful financial ledger. Financial actions and dependent forms are
blocked until authorized data is ready. Employee own password Settings remains
available. Confirmed mutation followed by failed refresh closes stale form UI and
reports inability to refresh; it does not claim rollback or resend the mutation.

The Edit Client renderer retains the **actual form/backdrop DOM** only while its
authority, page, client, selection and modal identity remain current. Typed values,
selected options, focus and caret survive Shop reads and routine background
refreshes. Closing/reopening, target switch, role change or logout invalidates
retention. Strict mutation/modal and read/request-generation guards stay intact.

## Reproduction and release gates

`tests/client-modal-browser.mjs --baseline` substitutes exactly the reviewed
6ea96cb renderer; the actual pending Shop read destroys input and exits nonzero.
Current mode uses actual Vite module graph/DOM with synthetic SDK transport,
blocked external traffic, 320/768/1440px. Database tests use populated PG17/real
Auth/Vault schemas and real PostgREST 13.0.8 HTTP/JWT/SQL, not a mocked gateway.
Storage/channel tables in these SQL tests are explicit policy fixtures, not a
claim of full provider-service verification. Local Auth has its separate real
GoTrue provider suite; its SQL adapter and SMTP/CAPTCHA limits remain explicit.

Migration `20261012231226` has no authored BEGIN/COMMIT or non-transactional
statement. CLI 2.120.0 history-failure regressions for fresh and approved staging
fixtures cover both new forward versions, prior-data/identity/grants/publication
rollback and genuine single-row retries. Whole-chain rollback is not promised:
earlier migration commits and historical authored boundaries remain immutable.

Independent review must pass before separately authorized hosted read-only
catalog/configuration/backup preflight. Then coordinate reviewed handler
replacement, migration 13 followed by 14 and the matching frontend in a freeze;
old employee loaders are intentionally incompatible with the new raw-read policy.
Validate actual signed-in Master/Manager/Billing journeys, native mail/CAPTCHA,
current-password/refresh continuity, managed policies/GraphQL/public channels,
account lifecycle and rollback/recovery constraints with approved disposable
accounts. No real employee destruction or automatic migration/deploy is authorized.

Primary references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security),
[Data API grants and policies](https://supabase.com/docs/guides/api/securing-your-api),
[official PostgREST Docker installation](https://github.com/PostgREST/postgrest/blob/main/docs/explanations/install.rst).
