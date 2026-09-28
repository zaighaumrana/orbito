# Platform to Shop bridge credential: implementation and rollout

Status: Platform code prepared locally on development. No migration, deployment, live secret change, Shop edit or live smoke test was performed.

## Authentication boundaries

| Credential | Direction | Rotation |
|---|---|---|
| PLATFORM_SCHEDULER_SECRET | Platform cron to platform-provision | Existing global Edge/Vault scheduler pair; unchanged |
| PLATFORM_BRIDGE_CALL_SECRET | Platform to one Shop platform-bridge | Separate random per-client credential; provision-call / rotate-call |
| PLATFORM_BRIDGE_SOURCE_SECRET | Shop to Platform event ingestion | Existing source credential and rotate action; unchanged |

Previously dispatch resolved the Shop service-role JWT using shopCredential and sent it as bearer to the Shop. The Shop hash comparison still required identical JWT bytes. Dispatch now resolves only the dedicated call credential and sends Authorization: Bearer with POST {} to the same Shop endpoint. There is no service-role, source-secret or JSON fallback for invocation.

Shop service-role credentials remain in their existing Vault slot and PLATFORM_SHOP_CREDENTIALS fallback for management/config access (including platform-config and provisioning verification). Do not delete or repurpose them. No frontend or Platform gateway configuration changes are required by this follow-up.

## Storage and lifecycle

The one additive migration, 20260928062701_platform_bridge_call_secret.sql, adds bridge_call_secret_id Vault UUID references to platform_private.shop_credentials and provision_jobs. The connection reference is current; the job reference preserves the prepared value across retries. Existing rows start with null references. Existing service-role secret_id and outbound bridge_secret_id retain their meanings. No ledger, source, cutover or event records are rewritten.

Private functions prepare, commit, resolve and record safe health. Their public-schema invoker wrappers follow the existing server RPC pattern: execute is revoked from PUBLIC, anon and authenticated and granted only to service_role. Decrypted credentials are never returned by operator-facing RPCs. Status exposes only connection.bridge_call_configured and existing safe health fields. Private schemas must remain unexposed.

Initial provision additionally generates a cryptographically random 32-byte call credential, prepares it in Vault, checkpoints before the Management API write, sets the Shop Edge secret and commits its reference after success. Existing source setup is unchanged. Verification checks local call-credential readiness, not a live authenticated Shop round trip.

For an already adopted client, the existing platform-provision endpoint accepts these master-authorized actions, with params {} and a fresh UUID request_id:

- provision-call: populate a missing call credential, or reuse the current value when already configured; never recreate the client/source.
- rotate-call: generate and install a new call credential independently of source rotation.

Example request body (the UUID must be generated for the real operation):

```json
{"client_id":1,"request_id":"<fresh UUID>","action":"provision-call","params":{}}
```

Authenticate using the existing signed-in master operator flow; the request contains no generated secret. No new frontend controls are included. Resume a retry with the same request ID, actor, action and parameters. Pending jobs exclude the client from scheduler selection. Uncertain Management API outcomes retain the prepared Vault value; retry installs that same value before committing. A terminated running job requires existing administrator reconciliation, not a new competing operation. Keep old Vault values until separately reviewed for retirement. An in-flight old poll during rotation may fail and retry; it cannot change event identity or cutover.

## Safe diagnostics

Dispatch outcomes contain client_id, ok, code, http_status and diagnostic_saved. Fixed codes distinguish missing_bridge_call_credential, credential_lookup_failed, shop_http_error (including 401/403/500), network_or_timeout, invalid_shop_response, shop_delivery_disabled and ok. Remote bodies, exception text and headers are never included. A missing credential does not invoke fetch.

Diagnostics are saved in private connection health.bridge_call, with checked_at. bridge_sources.last_error remains an ingestion diagnostic. Later verification can replace the health object under the existing workflow; the next poll restores its invocation result. Scheduler selection, poll_attempted_at, groups of five, maximum 20 clients and 15-second invocation timeout are unchanged. Successful Shop JSON must contain enabled:true and a nonnegative integer acknowledged; response size is limited to 16 KiB. Last contact still depends on successful ingestion, not merely the scheduled HTTP status.

## Eventual Client 1 rollout — not executed

1. Review and apply only the new Platform migration after its prerequisites; validate function grants and Vault resolution in a controlled database before production. Do not reapply earlier migrations or run reset scripts.
2. Confirm the existing client is 1, project kxmovywgshyltwusghhj, binding orbito-client-1, source 91fb4957-c2c4-4d6a-8a8a-e4783b302f97, usage_from_sequence 7. The reported Shop last_sequence is 6; inspect it separately without resetting it. Resolve any pending provisioning/config job before backfill.
3. Generate one independent random 32-byte secret (64 hex characters) using a secure administrator tool. Keep it out of browser application code, logs, command history, screenshots and reports.
4. Store that value in Platform Vault, for example named orbito_bridge_call_client_1. Record only its UUID for association. In a trusted administrator transaction, lock client 1 using the existing client-row locking convention, recheck the exact project/binding/source/cutover and pending jobs, and set only the existing shop_credentials.bridge_call_secret_id when it is null. Require exactly one affected row and record a secret-free audit entry. If a reference already exists, reconcile rather than overwrite it. Do not alter secret_id, bridge_secret_id, bridge_sources or accounting.
5. Set the matching PLATFORM_BRIDGE_CALL_SECRET as a Shop Edge Function secret through secure administration in the separate Shop session. Leave PLATFORM_BRIDGE_SOURCE_SECRET untouched.
6. In that separate Shop session, implement and test strict nonempty opaque-bearer authentication with a fixed-length hash comparison. Reject wrong/missing credentials before any bridge operations and remove the legacy service-role invocation fallback. Scope the credential to platform-bridge only; preserve internal service-role database access, RLS, outbox envelopes and duplicate/sequence protections.
7. Deploy that Shop platform-bridge with verify_jwt=false for that function only. The handler must authenticate every operational request itself; never disable gateway verification globally. It must continue accepting POST {} and returning the existing enabled/acknowledged response contract.
8. Deploy updated Platform platform-provision including both shared helpers. Keep the already working PLATFORM_SCHEDULER_SECRET, cron installation and Platform gateway settings unchanged. A coordinated rollout may briefly return safe 401 failures while the two sides differ.
9. Verify cron still returns 200, the Shop invocation returns 200, the per-client outcome is ok:true with code ok, and poll_attempted_at advances. Inspect safe connection health and confirm Platform UI Last contact updates through ingestion. An HTTP 200 scheduler response alone is insufficient.
10. Only after those checks, create the separately authorized Shop sale for BILL/usage smoke testing. Confirm accepted event/sequence behavior and absence of duplicate billing. Preserve cutover 7 and all existing identifiers.

After this bootstrap, provision-call can automate future backfills through the existing Management API instead of manually storing/associating values. New provisioning sets the call secret automatically. rotate-call rotates only this direction. All such operations are future live changes requiring the intended deployment authorization. If rollout fails, leave the client failing closed, reconcile the matching secret/deployment and retry; do not restore the service-role invocation fallback or reset sequence state.

## Files changed by this follow-up

- supabase/functions/platform-provision/index.ts
- supabase/functions/_shared/shop-credentials.ts
- supabase/functions/_shared/bridge-call.ts (new)
- supabase/migrations/20260928062701_platform_bridge_call_secret.sql (new)
- tests/bridge-call.test.mjs (new)
- tests/provision-scheduler.test.mjs (extended scheduler action rejection cases)
- docs/CLIENT_PROVISIONING.md
- docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md
- docs/BRIDGE_CALL_CREDENTIAL.md (this report/checklist)

Existing scheduler config/maintenance/documentation changes in the working tree predate this follow-up and are retained. No Shop, frontend, legal/privacy, paper, entitlement or accounting implementation files changed.

## Validation and limitations

Command: node --test tests/provision-scheduler.test.mjs tests/bridge-call.test.mjs

Result: 40/40 passed. Tests compile and execute the actual TypeScript handler/helpers with mocked RPC/fetch, asserting exact destination, bearer, no service-role fallback, safe diagnostics/no logging, missing credential rejection, scheduler/operator authorization, master-only backfill/rotation ordering and uncertain write recovery. Static migration assertions cover Vault references, service-only grants, retry value reuse and no source/accounting mutations. Fingerprints confirm existing selection migration, ledger/sequence migration, activation and source-rotation sections remain unchanged.

These are mocked handler and static regression checks, not proof of PostgreSQL execution, deployed grants, real Vault access, Management API permissions or Shop acceptance. No standalone Edge typecheck command exists in package.json. No frontend build was needed. SQL runtime validation and live end-to-end smoke testing remain deployment tasks. git diff --check passed after the final documentation changes.

References: [Supabase Vault](https://supabase.com/docs/guides/database/vault), [per-function JWT configuration](https://supabase.com/docs/guides/functions/function-configuration).
