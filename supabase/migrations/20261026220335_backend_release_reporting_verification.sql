-- Read-only release reporting. Preserve jobs, original pins and audit records.
begin;
create or replace function public.platform_backend_inventory_status(p_client integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clients;i platform_private.shop_backend_inventory;b public.bridge_sources;
 ref text;completed jsonb;latest jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 select * into strict c from public.clients where id=p_client and
  (platform_private.operator_role()='master_admin' or lifecycle_state<>'Archived');
 ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');
 select * into b from public.bridge_sources where client_id=p_client;
 select inv.* into i from platform_private.shop_backend_inventory inv where inv.client_id=p_client
  and inv.project_ref=ref and inv.source_id is not distinct from b.source_id
  and inv.client_binding is not distinct from b.client_binding
  and inv.report->'evidence'->>'origin'=case when c.pairing_mode='managed' then 'managed-provider-and-restricted-bridge' else 'restricted-bridge-attestation' end;
 -- A receipt is a dated outcome, never independent evidence of current source.
 select jsonb_build_object(
  'request_id',j.request_id,'release_id',r.release_id,'sha256',j.target_sha256,
  'mode',j.mode,'state',j.state,'completed_at',j.updated_at,
  'reviewed_at',case when j.state='completed_reviewed' then j.updated_at end,
  'evidence_origin',case when j.mode='byo' then 'customer-reported' else 'managed-upgrade-record' end,
  'evidence_strength',case when j.mode='byo' then 'customer-reported' when j.verification->>'evidence_strength' in ('provider-acknowledged-and-read-back','provider-acknowledged','operator-reported') then j.verification->>'evidence_strength' else 'not-recorded' end,
  'verification_origin',case when j.verification->>'origin' in ('managed-provider-read-only','managed-provider','customer-local-cli') then j.verification->>'origin' else 'not-recorded' end,
  'components_verified',j.mode='managed' and j.verification->>'components_verified'='true',
  'recorded_full_source_verified',j.mode='managed' and j.verification->>'full_source_verified'='true')
 into completed
 from platform_private.shop_upgrade_jobs j
 join platform_private.approved_shop_releases r on r.sha256=j.target_sha256
 where j.client_id=c.id and j.project_ref=ref and j.mode=c.pairing_mode
  and b.source_id is not null and b.client_binding is not null
  and j.source_id=b.source_id and j.client_binding=b.client_binding
  and j.state in ('complete','completed_reviewed') and j.unknown_step is null
  and j.plan_sha256~'^[a-f0-9]{64}$'
  and exists(select 1 from platform_private.approved_shop_releases src where src.sha256=j.source_sha256)
  and j.plan->>'target_release'=r.release_id
  and j.plan->>'target_sha256'=j.target_sha256 and j.plan->>'source_sha256'=j.source_sha256
  and j.plan->>'client_id'=c.id::text and j.plan->>'project_ref'=ref
  and j.plan->>'source_id'=b.source_id::text and j.plan->>'client_binding'=b.client_binding
  and j.verification->>'runtime_ready'='true'
  and (case when j.mode='managed' then j.verification->>'components_verified'
       else j.verification->>'components_reported' end)='true'
  and jsonb_typeof(j.plan->'steps')='array'
  and jsonb_array_length(case when jsonb_typeof(j.plan->'steps')='array' then j.plan->'steps' else '[]' end)>0
  and not exists(select 1 from jsonb_array_elements(
   case when jsonb_typeof(j.plan->'steps')='array' then j.plan->'steps' else '[]' end) s
   where coalesce(s->>'name','')='' or coalesce(s->>'sha256','')!~'^[a-f0-9]{64}$'
    or j.steps->(s->>'name')->>'state' is distinct from 'passed'
    or j.steps->(s->>'name')->>'sha256' is distinct from s->>'sha256')
 order by j.updated_at desc,j.created_at desc,j.request_id desc limit 1;
 select jsonb_build_object('request_id',j.request_id,'release_id',r.release_id,
  'sha256',j.target_sha256,'state',j.state,'mode',j.mode,
  'created_at',j.created_at,'updated_at',j.updated_at,
  'has_unknown_step',j.unknown_step is not null,
  'has_failed_steps',exists(select 1 from jsonb_each(case when jsonb_typeof(j.steps)='object' then j.steps else '{}' end) s where s.value->>'state' in ('failed','uncertain')))
 into latest from platform_private.shop_upgrade_jobs j
 left join platform_private.approved_shop_releases r on r.sha256=j.target_sha256
 where j.client_id=c.id and j.project_ref=ref and j.mode=c.pairing_mode
  and b.source_id is not null and b.client_binding is not null
  and j.source_id=b.source_id and j.client_binding=b.client_binding
 order by j.created_at desc,j.updated_at desc,j.request_id desc limit 1;
 return jsonb_build_object('client_id',c.id,'mode',c.pairing_mode,'project_ref',ref,
  'source_id',b.source_id,'client_binding',b.client_binding,
  'recorded_upgrade',completed,'latest_upgrade_operation',latest,
  'historical',(select coalesce(jsonb_agg(jsonb_build_object('release_id',p.release_id,
   'sha256',p.release_sha256,'origin','managed-job-pin','request_id',p.request_id)),'[]')
   from (select p.* from platform_private.managed_release_pins p join platform_private.provision_jobs j using(request_id)
    where j.client_id=p_client order by j.created_at desc limit 20)p),
  'checked_at',i.checked_at,'stale',i.checked_at is null or i.checked_at<now()-interval '1 day',
  'report',i.report,'last_verified',case when c.pairing_mode='managed' then i.last_verified end,
  'catalog',(select coalesce(jsonb_agg(jsonb_build_object('release_id',release_id,'sha256',sha256,
   'supported',supported,'approved_for_new',approved_for_new,'successor',successor,
   'upgrade_policy',upgrade_policy,'compatibility',compatibility)),'[]')
   from platform_private.approved_shop_releases));
end $$;
revoke all on function public.platform_backend_inventory_status(integer) from public,anon,service_role;
grant execute on function public.platform_backend_inventory_status(integer) to authenticated;
commit;
