# BYO controlled upgrade eligibility correction

Platform migration `20261024014319_byo_upgrade_unknown_infrastructure.sql` fixes
the unconditional `present` infrastructure requirement in both
`public.platform_upgrade_prepare()` and `platform_private.upgrade_fence()`.
The earlier applied migration remains unchanged.

| Active paired Shop | Infrastructure allowed |
| --- | --- |
| Managed | `present` |
| BYO | `unknown`, `present` |

All other combinations fail closed, including unreachable, destroyed,
decommissioned and inactive BYO clients. This does not change any client's status.
Unknown provider visibility does not prove customer readiness or installed source.

Only the infrastructure predicate changes. Existing canonical authority/session,
pairing, destination/source/target, request identity, plan digest, pending-operation,
approval and clearance requirements remain intact. The shared private fence covers
plan storage, approval, clearance issuance/claim, execution/checkpoints and final
review as well as initial preparation. Actual customer assessment and compatibility
validation remain required by the existing review path. Customer-reported evidence
remains customer-reported; full installed-source verification is not claimed.

No Shop source, immutable release, customer database, existing job, release pin,
Vault record or audit history changes. No frontend or Edge Function deployment is
needed for this correction.

## Owner-only deployment

Run these commands in PowerShell using your existing authorized Supabase login.
The explicit project is the **Platform development** project, never the BYO Shop.
CLI 2.122.0 supports `--skip-vault`; use it to avoid syncing configured Vault secrets.

```powershell
Set-Location -LiteralPath 'C:\Users\ranaz\Desktop\Development\orbito'
npx.cmd --yes supabase@2.122.0 migration list --linked --project-ref ukbhyerxshteyetwomqy
npx.cmd --yes supabase@2.122.0 db push --linked --project-ref ukbhyerxshteyetwomqy --dry-run --skip-vault
```

Stop unless the dry run lists **only**
`20261024014319_byo_upgrade_unknown_infrastructure.sql` as pending. Do not repair
history or use include-all, role or seed flags to force this deployment.

```powershell
npx.cmd --yes supabase@2.122.0 db push --linked --project-ref ukbhyerxshteyetwomqy --skip-vault
npx.cmd --yes supabase@2.122.0 migration list --linked --project-ref ukbhyerxshteyetwomqy
npx.cmd --yes supabase@2.122.0 db query --linked --project-ref ukbhyerxshteyetwomqy --file scripts/verify-byo-upgrade-eligibility.sql
```

The verification query is read-only and never creates/advances an upgrade. Expect
`migration_applied=true`, two functions with all three policy checks and
`security_definer=true`, an empty search path, `anonymous_execute=false` for both,
and `authenticated_execute=true` only for public preparation. Client #1 should
remain Active/BYO/unknown. The BYO job count remains zero until its first successful
review; existing hosted jobs are not rewritten by this migration.

After verification, retry the original authenticated customer assessment review
once through the existing BYO workflow. Preserve its original request identity and
reconcile status if uncertain. Continue the three reviewed v4-to-v6 operations only
through the existing explicit approval and customer-clearance process. Do not
rerun or modify the completed Managed upgrade.

## Focused local verification

`node tests/byo-upgrade-eligibility-native.mjs` uses one disposable, network-isolated
Postgres 17 fixture with synthetic Auth/Vault/customer evidence. It reproduces the
old failure, applies the forward migration, tests both policies and unsafe cases,
and exercises the BYO unknown flow through final review with source limitations
intact. It also proves function bodies differ only at these predicates, privileges
and function metadata remain unchanged, and migration application leaves fixture
clients/jobs/pins/Vault/audit data unchanged. It is not hosted/customer acceptance.
