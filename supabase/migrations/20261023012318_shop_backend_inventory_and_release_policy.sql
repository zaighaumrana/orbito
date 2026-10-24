-- Platform read-only detection records, independent of runtime/lifecycle state.
alter table platform_private.approved_shop_releases add column supported boolean not null default true,add column approved_for_new boolean not null default false,add column successor text,add column upgrade_policy text not null default 'optional' check(upgrade_policy in ('optional','required')),add column compatibility jsonb not null default '{"bridge":1,"billing":1,"support":1,"config":1}';
create table platform_private.shop_backend_inventory(
 client_id integer primary key references public.clients(id),project_ref text not null,source_id uuid,client_binding text,
 invocation uuid,actor_id uuid,session_id uuid,attempted_at timestamptz,checked_at timestamptz,
 report jsonb,last_verified jsonb
);
alter table platform_private.shop_backend_inventory enable row level security;
revoke all on platform_private.shop_backend_inventory from public,anon,authenticated,service_role;
create function public.platform_backend_inventory_status(p_client integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clients;i platform_private.shop_backend_inventory;b public.bridge_sources;ref text;begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 select * into strict c from public.clients where id=p_client and (platform_private.operator_role()='master_admin' or lifecycle_state<>'Archived');
 ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');
 select * into b from public.bridge_sources where client_id=p_client;
 select * into i from platform_private.shop_backend_inventory where client_id=p_client and project_ref=ref and source_id is not distinct from b.source_id and client_binding is not distinct from b.client_binding;
 return jsonb_build_object('client_id',c.id,'mode',c.pairing_mode,'project_ref',ref,'source_id',b.source_id,'client_binding',b.client_binding,
 'historical',(select coalesce(jsonb_agg(jsonb_build_object('release_id',p.release_id,'sha256',p.release_sha256,'origin','managed-job-pin','request_id',p.request_id)),'[]') from (select p.* from platform_private.managed_release_pins p join platform_private.provision_jobs j using(request_id) where j.client_id=p_client order by j.created_at desc limit 20)p),
 'checked_at',i.checked_at,'stale',i.checked_at is null or i.checked_at<now()-interval '1 day','report',i.report,'last_verified',i.last_verified,
 'catalog',(select coalesce(jsonb_agg(jsonb_build_object('release_id',release_id,'sha256',sha256,'supported',supported,'approved_for_new',approved_for_new,'successor',successor,'upgrade_policy',upgrade_policy,'compatibility',compatibility)),'[]') from platform_private.approved_shop_releases));
end $$;
create function public.platform_backend_inventory_begin(p_client integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients;b public.bridge_sources;i platform_private.shop_backend_inventory;ref text;nonce uuid:=gen_random_uuid();begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict c from public.clients where id=p_client and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned') for update;
 ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');if ref is null then raise exception 'Exact Shop project required';end if;
 select * into b from public.bridge_sources where client_id=p_client;
 select * into i from platform_private.shop_backend_inventory where client_id=p_client for update;
 if i.attempted_at>now()-interval '30 seconds' then raise exception 'Wait before another diagnostic refresh' using errcode='PT429';end if;
 insert into platform_private.shop_backend_inventory(client_id,project_ref,source_id,client_binding,invocation,actor_id,session_id,attempted_at)values(p_client,ref,b.source_id,b.client_binding,nonce,auth.uid(),platform_private.caller_session_id(),now()) on conflict(client_id) do update set project_ref=excluded.project_ref,source_id=excluded.source_id,client_binding=excluded.client_binding,invocation=excluded.invocation,actor_id=excluded.actor_id,session_id=excluded.session_id,attempted_at=excluded.attempted_at,report=case when shop_backend_inventory.project_ref=excluded.project_ref and shop_backend_inventory.source_id is not distinct from excluded.source_id and shop_backend_inventory.client_binding is not distinct from excluded.client_binding then shop_backend_inventory.report else null end,last_verified=case when shop_backend_inventory.project_ref=excluded.project_ref and shop_backend_inventory.source_id is not distinct from excluded.source_id and shop_backend_inventory.client_binding is not distinct from excluded.client_binding then shop_backend_inventory.last_verified else null end,checked_at=case when shop_backend_inventory.project_ref=excluded.project_ref and shop_backend_inventory.source_id is not distinct from excluded.source_id and shop_backend_inventory.client_binding is not distinct from excluded.client_binding then shop_backend_inventory.checked_at else null end;
 return public.platform_backend_inventory_status(p_client)||jsonb_build_object('invocation',nonce);
end $$;
create function public.platform_backend_inventory_finish(p_client integer,p_invocation uuid,p_report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare i platform_private.shop_backend_inventory;c public.clients;b public.bridge_sources;begin
 select * into strict c from public.clients where id=p_client for update;
 select * into strict i from platform_private.shop_backend_inventory where client_id=p_client for update;
 select * into b from public.bridge_sources where client_id=p_client;
 perform platform_private.team_master(i.actor_id);
 if not platform_private.session_live(i.actor_id,i.session_id) or i.invocation is distinct from p_invocation or p_invocation is null or i.attempted_at<now()-interval '2 minutes' or c.lifecycle_state='Archived' or c.infrastructure_state in ('destroyed','decommissioned') or c.supabase_url is distinct from 'https://'||i.project_ref||'.supabase.co' or i.source_id is distinct from b.source_id or i.client_binding is distinct from b.client_binding then raise exception 'Diagnostic ownership/target changed' using errcode='42501';end if;
 if p_report is null or jsonb_typeof(p_report)<>'object' or not (p_report?&array['compliance','runtime_health','evidence','missing','limitations','verified_release','upgrade']) or octet_length(p_report::text)>48000 or p_report-array['compliance','runtime_health','verified_release','observed_migration_release','evidence','missing','limitations','upgrade','compatibility']<>'{}' or p_report->>'compliance' not in ('up_to_date','upgrade_available','upgrade_required','unable_to_verify','drift') or p_report->>'runtime_health' not in ('healthy','degraded','unhealthy','unknown') then raise exception 'Invalid diagnostic report';end if;
 if i.report is distinct from p_report then insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,i.actor_id,'backend_inventory_changed',jsonb_build_object('compliance',p_report->'compliance','runtime_health',p_report->'runtime_health','origin',p_report->'evidence'->'origin'));end if;
 update platform_private.shop_backend_inventory set report=p_report,checked_at=now(),invocation=null,last_verified=case when p_report->'verified_release' is not null and p_report->'verified_release'<>'null'::jsonb then jsonb_build_object('release',p_report->'verified_release','verified_at',now(),'evidence',p_report->'evidence'->'origin') else last_verified end where client_id=p_client;
end $$;
revoke all on function public.platform_backend_inventory_status(integer),public.platform_backend_inventory_begin(integer) from public,anon,service_role;
grant execute on function public.platform_backend_inventory_status(integer),public.platform_backend_inventory_begin(integer) to authenticated;
revoke all on function public.platform_backend_inventory_finish(integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_backend_inventory_finish(integer,uuid,jsonb) to service_role;

-- Read-only authoritative receipt lookup; absence is NOT proof of failed commit.
create function public.platform_financial_outcome(p_kind text,p_request uuid,p_target bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=platform_private.operator_role();i public.billing_cycles;p public.payments;begin
 perform platform_private.require_role(array['master_admin','billing_person']);
 if p_kind='invoice' then select * into i from public.billing_cycles where request_id=p_request and client_id=p_target;return jsonb_build_object('applied',found,'state',case when found then 'applied' else 'not_observed' end,'record',case when found then platform_private.invoice_read(i,r) end);
 elsif p_kind='payment' then select * into p from public.payments where request_id=p_request and invoice_id=p_target;return jsonb_build_object('applied',found,'state',case when found then 'applied' else 'not_observed' end,'record',case when found then platform_private.payment_read(p) end);end if;
 raise exception 'Exact financial identity required';
end $$;
revoke all on function public.platform_financial_outcome(text,uuid,bigint) from public,anon,service_role;
grant execute on function public.platform_financial_outcome(text,uuid,bigint) to authenticated;
-- Final immutable catalog insertion is added only after Shop backend commit/build.

-- New approved source package only; old artifacts and job pins are untouched.
insert into platform_private.approved_shop_releases(release_id,sha256,supported,approved_for_new,upgrade_policy,compatibility) values('support-v5','7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd',false,false,'optional','{"bridge":1,"billing":1,"support":1,"config":1}');
update platform_private.approved_shop_releases set approved_for_new=false,successor='support-v6',upgrade_policy='optional' where release_id<>'support-v6';
update platform_private.approved_shop_releases set compatibility='{"bridge":1,"billing":1,"support":0,"config":1}' where release_id='accepted-v1';

-- The corrected final backend is v6. The local v5 candidate was never installed.
insert into platform_private.approved_shop_releases(release_id,sha256,supported,approved_for_new,upgrade_policy,compatibility) values('support-v6','64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31',true,true,'optional','{"bridge":1,"billing":1,"support":1,"config":1}');
