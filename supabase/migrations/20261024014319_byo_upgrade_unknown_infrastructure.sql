-- Platform-only BYO eligibility correction. No client/job/pin/secret data is changed.
-- Managed requires present; an Active paired BYO target may be unknown or present.
-- Unknown provider visibility is not customer CLI evidence or installed-source proof.
-- CREATE OR REPLACE preserves existing ownership, signatures and EXECUTE ACLs.
begin;

create or replace function platform_private.upgrade_fence(p_request uuid) returns platform_private.shop_upgrade_jobs language plpgsql security definer set search_path='' as $$
declare j platform_private.shop_upgrade_jobs;c public.clients;b public.bridge_sources;begin
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.shop_upgrade_jobs where request_id=p_request for update;
 perform platform_private.team_master(j.actor_id);
 select * into b from public.bridge_sources where client_id=j.client_id;
 if not platform_private.session_live(j.actor_id,j.session_id) or c.lifecycle_state<>'Active' or not coalesce(
   (c.pairing_mode='managed' and c.infrastructure_state='present')
   or (c.pairing_mode='byo' and c.infrastructure_state in('unknown','present')), false)
 or c.pairing_mode<>j.mode or c.supabase_url is distinct from 'https://'||j.project_ref||'.supabase.co'
 or b.source_id is distinct from j.source_id or b.client_binding is distinct from j.client_binding then raise exception 'Upgrade authority or original destination changed' using errcode='42501';end if;
 perform platform_private.upgrade_blockers(j.client_id,j.request_id);
 return j;
end$$;

create or replace function public.platform_upgrade_prepare(p_client integer,p_request uuid,p_source text,p_target text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients;b public.bridge_sources;j platform_private.shop_upgrade_jobs;begin
 perform platform_private.require_role(array['master_admin']);
 select * into strict c from public.clients where id=p_client for update;
 select * into b from public.bridge_sources where client_id=p_client;
 if c.lifecycle_state<>'Active' or not coalesce(
   (c.pairing_mode='managed' and c.infrastructure_state='present')
   or (c.pairing_mode='byo' and c.infrastructure_state in('unknown','present')), false) or c.pairing_mode not in('managed','byo') or b.source_id is null or b.client_binding is null or c.supabase_url !~ '^https://[a-z]{20}\.supabase\.co$' or p_request is null then raise exception 'Exact eligible paired Shop required';end if;
 perform platform_private.upgrade_blockers(p_client,p_request);
 if not exists(select 1 from platform_private.approved_shop_releases where sha256=p_source and supported)
 or not exists(select 1 from platform_private.approved_shop_releases where sha256=p_target and supported and approved_for_new) or p_source=p_target then raise exception 'Distinct approved source and target required';end if;
 select * into j from platform_private.shop_upgrade_jobs where request_id=p_request;
 if found then
  if j.client_id<>p_client or j.source_sha256<>p_source or j.target_sha256<>p_target or j.actor_id<>auth.uid() then raise exception 'Original upgrade identity conflict';end if;
 else
  insert into platform_private.shop_upgrade_jobs(request_id,client_id,mode,project_ref,source_id,client_binding,source_sha256,target_sha256,actor_id,session_id)
  values(p_request,p_client,c.pairing_mode,substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$'),b.source_id,b.client_binding,p_source,p_target,auth.uid(),platform_private.caller_session_id()) returning * into j;
  insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'upgrade_review_started',jsonb_build_object('request_id',p_request,'source',p_source,'target',p_target));
 end if;
 return to_jsonb(j)-array['customer_token_hash','invocation'];
end$$;

commit;
