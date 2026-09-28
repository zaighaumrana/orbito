-- ONE-TIME Platform infrastructure setup; never run on a Shop project.
-- Enable pg_cron and pg_net first. Store these two named secrets in Platform Vault:
-- orbito_platform_url: the Platform https://<project_ref>.supabase.co URL
-- orbito_platform_scheduler_secret: the same high-entropy value as Edge PLATFORM_SCHEDULER_SECRET
-- No secret values are included here or in the scheduled SQL.
begin;
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron')
  or not exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Enable pg_cron and pg_net on the Platform first';
 end if;
 if not exists(select 1 from vault.secrets where name='orbito_platform_url')
  or not exists(select 1 from vault.secrets where name='orbito_platform_scheduler_secret') then
  raise exception 'Store the two named Platform scheduler secrets in Vault first';
 end if;
end $$;
select cron.schedule('orbito-platform-bridge','* * * * *',$schedule$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='orbito_platform_url') || '/functions/v1/platform-provision',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
   (select decrypted_secret from vault.decrypted_secrets where name='orbito_platform_scheduler_secret')),
  body := '{"action":"dispatch"}'::jsonb,
  timeout_milliseconds := 90000
 );
$schedule$);
commit;
