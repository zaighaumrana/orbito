begin;
-- The earlier forward grant is retained. RLS still permits only master/portfolio
-- operators; DELETE remains unavailable. Column-sensitive changes use audited RPCs.
grant select,insert,update on public.clients to authenticated;
revoke delete on public.clients from anon,authenticated;

create function platform_private.guard_direct_client_update() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and
  to_jsonb(new)-array['name','industry','plan','shop_url','currency_symbol','pairing_mode']
  is distinct from to_jsonb(old)-array['name','industry','plan','shop_url','currency_symbol','pairing_mode'] then
  raise exception 'Use authorized configuration, currency or billing operations' using errcode='42501';
 end if;
 return new;
end $$;
-- Runs before the existing defaults trigger derives module flags from the plan.
create trigger aa_client_direct_update before update on public.clients
 for each row execute function platform_private.guard_direct_client_update();
revoke all on function platform_private.guard_direct_client_update() from public,anon,authenticated;

-- Canonical role comes from the existing server identity, never a build-time email.
create function public.platform_operator_identity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text; u public.platform_users%rowtype; e text; display text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 r:=platform_private.operator_role();
 if r is null then raise exception 'Operator not authorized' using errcode='42501'; end if;
 select email into strict e from auth.users where id=auth.uid();
 if r='master_admin' then
  select admin_username into display from public.platform_config where id=1;
 else
  select * into strict u from public.platform_users where auth_user_id=auth.uid() and status='Active';
  display:=u.name;
 end if;
 return jsonb_build_object('auth_user_id',auth.uid(),'role',r,'email',e,'username',display,
  'userId',u.id,'isMember',r<>'master_admin');
end $$;
revoke all on function public.platform_operator_identity() from public,anon;
grant execute on function public.platform_operator_identity() to authenticated;
create or replace function public.platform_onboarding_step(p_request uuid,p_step text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs%rowtype; c public.clients%rowtype;
 s platform_private.shop_credentials%rowtype; ref text; v uuid; src uuid; payload jsonb; checks jsonb; ready boolean;
begin
 select * into strict j from platform_private.provision_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state<>'running' or j.action not in ('pair-shop','bootstrap-shop','onboarding-status','invite-owner') then raise exception 'Invalid onboarding job'; end if;
 select * into s from platform_private.shop_credentials where client_id=j.client_id for update;
 if p_step='prepare' then
  if c.onboarding_version<>2 then raise exception 'Existing clients use existing verification/cutover workflow'; end if;
  if j.action='invite-owner' and coalesce(s.health->>'infrastructure','')<>'ready' then raise exception 'Provision infrastructure before requesting an optional invitation'; end if;
  ref:=substring(c.supabase_url from '^https://([a-z]{20})\.supabase\.co$');
  if ref is null then raise exception 'Shop project required'; end if;
  if s.client_id is null then
   if j.action<>'pair-shop' then raise exception 'Pair Shop first'; end if;
   insert into platform_private.shop_credentials(client_id,project_ref,client_binding)
    values(c.id,ref,'orbito-client-'||c.id) returning * into s;
  end if;
  if s.project_ref<>ref then raise exception 'Shop destination cannot be reassigned'; end if;
  if s.bridge_call_secret_id is null then
   v:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'));
   update platform_private.shop_credentials set bridge_call_secret_id=v where client_id=c.id;
  end if;
  if s.bridge_secret_id is null then
   v:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'));
   update platform_private.shop_credentials set bridge_secret_id=v where client_id=c.id;
  end if;
  select * into s from platform_private.shop_credentials where client_id=c.id;
  payload:=j.plan->'bootstrap';
  if payload is null then
   -- The first bootstrap payload is immutable across retries and later status calls.
   select plan->'bootstrap' into payload from platform_private.provision_jobs
    where client_id=c.id and action='bootstrap-shop' and plan ? 'bootstrap' order by created_at limit 1;
   if payload is null then payload:=jsonb_build_object('request_id',p_request,'platform_client_id',c.id,'client_binding',s.client_binding,
    'business_name',c.name,'owner_name',c.owner_name,'owner_email',c.owner_email,'billing_currency',c.currency,
    'shop_url',c.shop_url,'modules',c.desired_entitlements,'paper_resupply_enabled',c.paper_resupply_enabled,'onboarding_version',2); end if;
   update platform_private.provision_jobs set plan=plan||jsonb_build_object('bootstrap',payload) where request_id=p_request;
  end if;
  return jsonb_build_object('project_ref',ref,'pairing_mode',c.pairing_mode,'payload',payload,
   'call_secret',(select decrypted_secret from vault.decrypted_secrets where id=s.bridge_call_secret_id),
   'source_secret',(select decrypted_secret from vault.decrypted_secrets where id=s.bridge_secret_id));
 elsif p_step='paired' then
  update platform_private.shop_credentials set health=health||jsonb_build_object('connection',p_data->>'connection','owner_invite',coalesce(health->>'owner_invite','owner_invite_not_started'),'owner_setup',coalesce(health->>'owner_setup','owner_setup_pending'),'infrastructure',coalesce(health->>'infrastructure','pending'),'onboarding',coalesce(health->>'onboarding','onboarding_pending')) where client_id=c.id;
 elsif p_step='registered' then
  src:=(p_data->>'source_id')::uuid;
  if src is null or p_data->>'client_binding' is distinct from s.client_binding then raise exception 'Shop source binding mismatch'; end if;
  if exists(select 1 from public.bridge_sources where client_id=c.id and (source_id<>src or client_binding<>s.client_binding)) then raise exception 'Source conflict'; end if;
  insert into public.bridge_sources(source_id,client_id,client_binding,enabled,usage_from_sequence,cutover_note)
   values(src,c.id,s.client_binding,true,1,'New Shop onboarding V2; no legacy usage') on conflict(client_id) do nothing;
  insert into platform_private.source_credentials(source_id,secret_sha256)
   select src,encode(extensions.digest(decrypted_secret,'sha256'),'hex') from vault.decrypted_secrets where id=s.bridge_secret_id
   on conflict(source_id) do nothing;
  perform platform_private.publish_billing(c.id);
 elsif p_step='health' then
  if coalesce(p_data->>'owner_setup','') not in ('owner_setup_pending','owner_active')
   or coalesce(p_data->>'infrastructure','') not in ('pending','ready')
   or coalesce(p_data->>'owner_invite','') not in ('owner_invite_not_started','owner_invite_sent','owner_invite_accepted','owner_invite_failed')
   or coalesce(p_data->>'onboarding','') not in ('onboarding_pending','onboarding_complete')
   or jsonb_typeof(p_data->'config') is distinct from 'object'
   or not ((p_data->'config') ?& array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended'])
   or (p_data->'config')-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended']<>'{}'
   then raise exception 'Invalid diagnostic'; end if;
  if exists(select 1 from jsonb_each(p_data->'config') where jsonb_typeof(value)<>'boolean') then raise exception 'Boolean diagnostics required'; end if;
  if p_data->>'client_binding' is distinct from s.client_binding and coalesce(p_data->'checks'->>'owner_reservation','false')='true' then raise exception 'Shop binding mismatch'; end if;
  select jsonb_object_agg(k,coalesce(p_data->>'contract','')='orbito-onboarding-runtime-v1' and coalesce(p_data->'checks'->k,'false')='true'::jsonb) into checks
   from unnest(array['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication']) k;
  ready:=not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb) and p_data->>'client_binding'=s.client_binding
   and coalesce(p_data->>'owner_account','missing')<>'conflict'
   and exists(select 1 from public.bridge_sources bs where bs.client_id=c.id and bs.client_binding=s.client_binding and bs.enabled and bs.source_id::text=p_data->>'source_id');
  if coalesce(p_data->>'owner_account','missing') not in ('missing','unconfirmed','ready','active','conflict') then raise exception 'Invalid owner diagnostic'; end if;
  update platform_private.shop_credentials set verified_at=now(),health=health-'error'||jsonb_build_object(
   'connection','Connected','config_access',case when checks->>'database_reachable'='true' then 'Reachable' else 'Pending' end,'bridge_call_configured',true,
   'owner_setup',p_data->>'owner_setup','infrastructure',case when ready then 'ready' else 'pending' end,'checks',checks,'owner_account',coalesce(p_data->>'owner_account','missing'),'owner_invite',p_data->>'owner_invite','onboarding',p_data->>'onboarding','shop_config',p_data->'config',
   'billing_projection',case when checks->>'config_projection'='true' then 'Ready' else 'Pending' end)
   where client_id=c.id;
 else raise exception 'Unsupported onboarding step'; end if;
 return '{}'::jsonb;
end $$;
commit;
