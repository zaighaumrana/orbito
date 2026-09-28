# Shared scheduler authentication fix

Local implementation only; nothing was deployed and no live database was queried or changed.

## Cause and change

The previous handler compared the incoming scheduler JWT with the exact bytes of its runtime SUPABASE_SERVICE_ROLE_KEY. Valid service-role claims do not establish byte equality with that environment value. A mismatch fell through to auth.getUser(), which authenticates users rather than this scheduled service request, producing the reported 401 “Sign in required”. This path is confirmed in source and reproduced with local mocked handler tests; no live secret comparison was performed.

The scheduler now reads PLATFORM_SCHEDULER_SECRET, hashes it and the Bearer token, compares every digest character and requires both values to be nonempty. Only the exact JSON object {"action":"dispatch"} is accepted on a match; extra fields, invalid JSON and all provisioning actions are rejected. Wrong/missing values fall through to existing auth.getUser() and master-admin RPC authorization. SUPABASE_SERVICE_ROLE_KEY still backs internal database operations but is never an authentication fallback for the scheduler.

Only platform-provision changes to verify_jwt=false. This lets its non-JWT scheduler secret reach the handler; it does not remove handler authentication. Other functions and Shop code are unchanged. There is no new migration or billing/event/cutover change.

## Manual rollout

Use a password manager or cryptographically secure generator to create at least 32 random bytes (for example 64 hex characters). Use the **same value** for Edge PLATFORM_SCHEDULER_SECRET and Vault orbito_platform_scheduler_secret. This pair is Platform-wide, created once, not once per Shop. Never paste the value into chat, commit it, print it, put it in VITE variables, or store it in browser state. The old Vault orbito_platform_service_role is no longer required by the shared scheduler; retain it unless you separately establish that nothing else needs it.

1. Create a private temporary env file **outside the repository**, containing one line:

```dotenv
PLATFORM_SCHEDULER_SECRET=<YOUR_GENERATED_VALUE>
```

2. From the Orbito repository, with the Supabase CLI authenticated, review help and upload that file. Replace the example path with your private file path:

```powershell
supabase secrets set --help
supabase functions deploy --help
supabase secrets set --project-ref ukbhyerxshteyetwomqy --env-file "C:\secure\orbito-scheduler.env"
```

Alternatively use Platform Edge Function Secrets in the dashboard. Do not expose the value through CLI arguments. Securely remove the temporary file after setting the secret. No secret file is included in this repository.

3. Create/update the matching Vault secret on **Platform** as a database administrator. Prefer Vault's secret editor for entering the value. The equivalent SQL is below; replace the placeholder privately, never save a populated copy to the repository or shared query snippets:

```sql
do $setup$
declare
  secret_id uuid;
  scheduler_value text := 'REPLACE_WITH_THE_SAME_GENERATED_VALUE';
begin
  if scheduler_value = 'REPLACE_WITH_THE_SAME_GENERATED_VALUE'
     or length(scheduler_value) < 43 or scheduler_value ~ '[[:space:]]' then
    raise exception 'Supply a high-entropy scheduler value without whitespace';
  end if;
  select id into secret_id from vault.secrets
    where name = 'orbito_platform_scheduler_secret';
  if secret_id is null then
    perform vault.create_secret(scheduler_value, 'orbito_platform_scheduler_secret',
      'Platform-wide shared dispatcher credential');
  else
    perform vault.update_secret(secret_id, scheduler_value);
  end if;
end
$setup$;
```

This SQL produces no secret result rows. As with any administrative secret-entry SQL, use a trusted private session; do not enable statement/parameter logging of the populated query. The existing orbito_platform_url Vault value stays unchanged.

4. Deploy only this function with gateway JWT verification disabled:

```powershell
supabase functions deploy platform-provision --project-ref ukbhyerxshteyetwomqy --no-verify-jwt
```

5. Reinstall the same named shared schedule by running the entire checked-in **supabase/maintenance/install_platform_bridge_schedule.sql** in the Platform SQL editor, or from psql while connected to Platform:

```sql
\i supabase/maintenance/install_platform_bridge_schedule.sql
```

The `\i` line is a psql command, not SQL-editor syntax. The installer's core SQL is:

```sql
select cron.schedule('orbito-platform-bridge', '* * * * *', $schedule$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'orbito_platform_url') || '/functions/v1/platform-provision',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                    where name = 'orbito_platform_scheduler_secret')),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 90000
  );
$schedule$);
```

Run as the same database owner used for the existing named job: cron.schedule updates that user's existing named job. Inspect the queries below to ensure only one shared job exists. No per-Shop schedule is added. A brief 401 interval during the function/schedule switchover is expected; finish both steps together.

## Verification queries (manual, after deployment)

Confirm secret presence without selecting decrypted values:

```sql
select name, updated_at
from vault.secrets
where name in ('orbito_platform_url', 'orbito_platform_scheduler_secret');

select jobid, jobname, schedule, active, username,
       position('orbito_platform_scheduler_secret' in command) > 0 as uses_scheduler_secret,
       position('orbito_platform_service_role' in command) > 0 as uses_old_credential
from cron.job
where jobname = 'orbito-platform-bridge';
```

Expect one active job with '* * * * *', uses_scheduler_secret=true, uses_old_credential=false. After the next minute:

```sql
select r.jobid, r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname = 'orbito-platform-bridge'
order by r.start_time desc limit 5;

select id, status_code, timed_out, error_msg, created, content
from net._http_response
where created > now() - interval '10 minutes'
order by id desc limit 20;

select client_id, enabled, last_received_at, last_error
from public.bridge_sources
where enabled order by client_id;
```

Cron success only means the HTTP request was queued. Inspect the matching recent pg_net HTTP response (the response table can also contain other jobs): dispatch should return 200 with an outcomes array, not “Sign in required”. An empty outcomes array is valid when no client is eligible. Any ok=false entries are separate Shop-delivery issues; inspect those clients' contact/error status. These queries do not expose request headers or secrets. The function's gateway setting must also show JWT verification disabled after deployment.

## Local validation and changed files

Run the focused tests with `node --test tests/provision-scheduler.test.mjs`. They execute the real TypeScript handler transformed with the already installed esbuild, mock Supabase boundaries, and forbid network calls. They cover correct/wrong/missing/empty credentials, no service-role fallback, strict dispatch-only payloads, all five prohibited provisioning actions, operator authorization and secret-free success/error responses. No hosted integration claim is made.

Changed runtime files: supabase/functions/platform-provision/index.ts, supabase/config.toml and supabase/maintenance/install_platform_bridge_schedule.sql. Added tests/provision-scheduler.test.mjs. Updated docs/CLIENT_PROVISIONING.md and docs/PLATFORM_MODERNIZATION_IMPLEMENTATION.md; added this runbook. No frontend or migration changes.

References: [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration), [CLI](https://supabase.com/docs/reference/cli/supabase-secrets-set), [Vault](https://supabase.com/docs/guides/database/vault).

Validation result (2026-09-28): 22/22 focused handler tests passed; production build passed (Vite 5.4.21, 65 modules; existing nonfatal CJS/chunk warnings); git diff --check passed. Tests use mocked Supabase boundaries and make no hosted calls. Nothing deployed, committed or pushed; no live database changes.
