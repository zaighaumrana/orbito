# Legacy privileged credential cleanup

Internal release procedure, 2026-10-01. This document does not authorize or execute hosted changes. Hosted legacy credential inventory/cleanup remains a release operation. Active V2 code is independent of these retired credentials.

**Never select, retrieve, print, export, paste or log decrypted secret values, encrypted secret payloads, database passwords, API keys or PATs. Never use `SELECT *` on Vault or query `vault.decrypted_secrets` for inventory. Client 1 must not be reset, re-provisioned, rebound or have its owner recreated.**

## Mechanisms identified in this repository

| Mechanism | Current meaning and decision |
| --- | --- |
| `platform_private.shop_credentials.secret_id` -> `vault.secrets.id` | Historical Shop privileged API/service-role credential slot, introduced by `20260926234425_client_provisioning.sql`. Old `credential` provisioning step created/updated the referenced value. New pairing leaves this nullable slot empty and never decrypts it. Historical rows may remain. |
| `platform_private.shop_credential(integer)` / `public.platform_shop_credential(integer)` | Old resolver returned `service_role_key`. V2 replaces the private resolver with project/binding metadata only. The forward manual-activation migration revokes the public resolver from public/anon/authenticated/service_role. |
| `platform_private.provision_step_legacy(uuid,text,jsonb)` | Preserves old cutover operations and historical credential-writing source. Direct execution is revoked from all application roles. The owning wrapper rejects `credential` for every action and restricts V2 actions to completion/failure, isolating them from legacy context/secret operations. Historical migrations are retained. |
| `PLATFORM_SHOP_CREDENTIALS` Edge environment map | Retired client-ID map containing `project_ref` and `service_role_key`. Removed from active JS/Edge resolver. Inventory its **name/digest only**, never fetch or parse the value. Do not recreate it. |
| `orbito_platform_service_role` Vault name | Older scheduler credential mentioned in scheduler operational history. Current schedule uses `orbito_platform_scheduler_secret`. This is Platform privileged material, not automatically a Shop key. Determine external consumers before retirement. |
| `shop_credentials.bridge_secret_id` | **Keep:** active Shop-to-Platform source token, not the retired Shop key. |
| `shop_credentials.bridge_call_secret_id` | **Keep:** active Platform-to-Shop call token. |
| `provision_jobs.secret_id` | A source-token candidate/history reference. **Do not classify it as a Shop service-role credential just because its column is named secret_id.** |
| `provision_jobs.bridge_call_secret_id` | Pending/historical call-token reference. Preserve during recovery/rotation. |
| `PLATFORM_MANAGEMENT_TOKEN` | Platform-owned Management authorization for managed setup. Keep if managed pairing/legacy authorized maintenance is used; never substitute a permanent customer PAT. |
| `PLATFORM_SCHEDULER_SECRET`, Vault `orbito_platform_scheduler_secret`, `orbito_platform_url` | Active shared scheduler authorization and URL metadata. Preserve; do not change cadence. |
| Each project's built-in `SUPABASE_SERVICE_ROLE_KEY` | Own-project server credential; Shop login/Auth/bridge work needs the Shop's own value. Never copy it to Platform. Platform's own built-in server credential is also required. |
| Shop `legacy_auth_credentials` | Existing hashed login migration/support compatibility data, not a Platform Shop privileged key. Excluded from this cleanup. Do not delete identities or hashes as a credential-retention shortcut. |

Historical provisioning calls `vault.create_secret` without a name, so these Vault rows can be unnamed UUIDs. Do not guess names. A label alone does not prove a secret's purpose; pointers, deployed consumers and approved owner records establish purpose. Unknown/orphan records require separate investigation.

## Read-only hosted inventory: metadata only

An authorized release operator may run the following on the **Platform** project after checking the project ref. This development pass did not execute any hosted SQL. Do not include `secret`, `decrypted_secret`, nonce/key material, free-form descriptions, job params, job plans or cron command text in output.

```sql
-- Inventory legacy pointers plus Vault identity/name/timestamps only.
select c.client_id, c.project_ref, c.secret_id as legacy_shop_secret_id,
       v.name, v.created_at, v.updated_at
from platform_private.shop_credentials c
left join vault.secrets v on v.id = c.secret_id
where c.secret_id is not null
order by c.client_id;

-- Protect every active or pending bridge reference from mistaken deletion.
select client_id, bridge_secret_id as source_secret_id,
       bridge_call_secret_id as call_secret_id
from platform_private.shop_credentials
order by client_id;
select request_id, client_id, action, state,
       secret_id as source_candidate_id, bridge_call_secret_id as call_candidate_id
from platform_private.provision_jobs
where secret_id is not null or bridge_call_secret_id is not null;

-- Names/identifiers only, including unnamed and otherwise unreferenced rows.
select id, name, created_at, updated_at from vault.secrets order by created_at, id;

-- Find structural Vault consumers without retrieving contents.
select table_schema, table_name, column_name
from information_schema.key_column_usage
where constraint_name in (
 select constraint_name from information_schema.referential_constraints
 where unique_constraint_schema = 'vault'
);

-- Check retired entry point ACLs, never invoke the retired routines.
select has_function_privilege('service_role',
 'public.platform_shop_credential(integer)', 'EXECUTE') as retired_resolver_callable,
 has_function_privilege('service_role',
 'platform_private.provision_step_legacy(uuid,text,jsonb)', 'EXECUTE') as retired_writer_callable;

-- Check scheduler references without printing cron command/header contents.
select jobid, jobname, schedule, active,
       position('orbito_platform_service_role' in command) > 0 as uses_old_platform_key,
       position('orbito_platform_scheduler_secret' in command) > 0 as uses_current_scheduler
from cron.job;
```

Information-schema visibility is privilege-dependent and does not enumerate dynamic SQL, external integrations or code/config consumers. Also inventory deployed Edge versions, approved secret-manager **names**, CI variable **names**, server environment **names**, old per-Shop schedules and external maintenance tools. Supabase Dashboard secret listings or `supabase secrets list --project-ref PLATFORM_PROJECT_REF` show names/digests; verify CLI help/version and do not use any value-retrieval command. Never dump an environment, `.env` file or JSON credential map. If a platform does not offer a metadata-only listing, stop that inventory step instead of reading values.

## Dependency decision and cleanup order

1. Verify current forward migrations and Edge/frontend versions are deployed together through the approved release process. Confirm the retired public resolver/direct writer grants are absent and V2 uses only bridge-call/source credentials. Re-run local tests before release. Preserve metadata records of versions, IDs, consumer owners and decisions, with restricted access.
2. Identify each legacy `shop_credentials.secret_id` precisely. Compare its UUID against **all** bridge/source/call/job references above and additional consumer inventory. Any overlapping or unresolved record is excluded from deletion until reconciled. Do not delete an unnamed Vault row by age alone.
3. Obtain consumer-owner confirmation that no deployed old code, old schedule, emergency procedure or external integration still needs the entry. If a consumer still requires privileged Shop access, migrate that consumer using an authorized supported boundary before cleanup. Do not reinstate V2 fallbacks.
4. Remove retired `PLATFORM_SHOP_CREDENTIALS` from the Platform environment only after all deployed consumers are independent. Redeployment/propagation and old invocations must be accounted for. Preserve current Management, scheduler and own-project credentials.
5. For each proven-unused historical Vault UUID, clear only its legacy `shop_credentials.secret_id` reference through an operator-reviewed transaction and remove only that exact Vault record after proving there are no remaining consumers/references. Do not delete the connection row, source, job history, ledgers, owner, active bridge credentials or project. No bulk/destructive SQL is supplied here.
6. Retire `orbito_platform_service_role` only if its independent consumer review also passes. Unreferenced/unnamed secrets are a separate investigation; absence of an FK is not proof of disuse.
7. Verify active behavior below, record metadata-only results and close the release task. Client 1 uses ordinary status/bridge/login observations, never onboarding/reset/re-provisioning.

## Rollback and verification

Metadata alone cannot restore deleted secret values. If organizational policy requires rollback retention, use an already approved encrypted secret-management recovery process with named access control and expiry; **do not export values to terminal, chat, logs or these documents**. Otherwise delay deletion until irreversible removal is approved. Before deletion, a retained value/pointer can be kept while consumers are migrated. After deletion, do not roll back to an obsolete runtime that requires retired credentials; recover by rolling forward or by a separately authorized credential reissue to the proper boundary.

After cleanup verify: new managed/BYO pairing; SMTP-free reservation/infrastructure ready; confirmed exact-email manual login; one owner with NULL employee; six-step wizard/completion; explicit optional invite failure with manual path intact; status/module projection; unchanged scheduler cadence/call/source separation; existing Client 1 ordinary login, settings, bridge delivery and ledger observations. Local tests prove runtime independence with absent and synthetic retained legacy pointers. Hosted checks require actual deployment, project authorization and Vault/Edge propagation and were not performed here.
