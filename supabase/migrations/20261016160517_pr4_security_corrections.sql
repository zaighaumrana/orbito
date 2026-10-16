-- Forward 17. CLI owns SQL + history atomicity. Never copy editable Shop URLs
-- into support approvals. Existing pairs require an explicit new Master approval.
do $$ begin
 if exists(select 1 from public.config_jobs where state in ('sending','uncertain')) then
  raise exception 'Resolve outstanding configuration operations before migration 17';
 end if;
end $$;

-- F1: only an actual email change is subject to the historical-email veto.
-- Live/Auth collisions are still checked even for unchanged email submissions.
do $patch$ declare definition text; old_text text := $old$exists(select 1 from public.platform_team_archive where lower(email)=lower(p_data->>'email'))$old$;begin
 definition:=pg_get_functiondef('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
  raise exception 'Unexpected team edit definition; migration 17 requires reviewed predecessor';end if;
 definition:=replace(definition,old_text,$new$((lower(trim(p_data->>'email')) is distinct from lower(trim(r.email)) or u.email_confirmed_at is null) and exists(select 1 from public.platform_team_archive where lower(trim(email))=lower(trim(p_data->>'email'))))$new$);
 -- Normalize all three edit comparisons consistently, without changing UUID guards.
 definition:=replace(definition,'lower(email)=lower(p_data->>''email'')','lower(trim(email))=lower(trim(p_data->>''email''))');
 execute definition;
end $patch$;

-- F2: this record is distinct from public/business URL and deployment inputs.
create table platform_private.support_destinations(
 client_id integer primary key references public.clients(id),
 origin text not null check(origin ~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$'),
 project_ref text not null, client_binding text not null, source_id uuid not null,
 master_revision bigint not null, revision uuid not null, approved_by uuid not null, approved_at timestamptz not null,
 reason text not null check(length(trim(reason)) between 10 and 500)
);
alter table platform_private.support_destinations enable row level security;
revoke all on platform_private.support_destinations from public,anon,authenticated,service_role;
alter table platform_private.support_grants add column destination_revision uuid;

create function public.platform_approve_support_destination(p_client integer,p_origin text,p_project text,p_binding text,p_source uuid,p_expected uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients;s platform_private.shop_credentials;b public.bridge_sources;d platform_private.support_destinations;prior jsonb;
begin
 perform platform_private.require_role(array['master_admin']);
 if p_origin is null or p_origin !~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$'
  or p_project is null or p_binding is null or p_source is null or length(trim(coalesce(p_reason,''))) not between 10 and 500
 then raise exception 'Exact origin, pairing and explicit approval reason required';end if;
 if substring(p_origin from ':([0-9]+)$')::integer not between 1 and 65535 or substring(p_origin from ':([0-9]+)$')::integer=443 then raise exception 'Canonical HTTPS origin required; omit default port';end if;
 select * into strict c from public.clients where id=p_client for update;
 select * into s from platform_private.shop_credentials where client_id=p_client;
 select * into b from public.bridge_sources where client_id=p_client;
 if c.pairing_mode<>'managed' or c.onboarding_version<>2 or c.lifecycle_state not in ('Active','Suspended')
  or c.infrastructure_state in ('destroyed','decommissioned') or s.project_ref is distinct from p_project
  or c.supabase_url is distinct from 'https://'||p_project||'.supabase.co' or s.client_binding is distinct from p_binding
  or b.source_id is distinct from p_source or b.client_binding is distinct from p_binding or s.bridge_call_secret_id is null
  or not exists(select 1 from platform_private.source_credentials where source_id=p_source)
 then raise exception 'Verified current managed pairing required';end if;
 select * into d from platform_private.support_destinations where client_id=p_client for update;
 if d.revision is distinct from p_expected then raise exception 'Support approval changed; review the current pairing again';end if;
 prior:=to_jsonb(d);
 insert into platform_private.support_destinations values(p_client,p_origin,p_project,p_binding,p_source,(select revision from platform_private.master_identity where singleton),gen_random_uuid(),auth.uid(),clock_timestamp(),trim(p_reason))
 on conflict(client_id) do update set origin=excluded.origin,project_ref=excluded.project_ref,client_binding=excluded.client_binding,
  source_id=excluded.source_id,master_revision=excluded.master_revision,revision=excluded.revision,approved_by=excluded.approved_by,approved_at=excluded.approved_at,reason=excluded.reason
 returning * into d;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,auth.uid(),'support_destination_approved',
  jsonb_build_object('origin',d.origin,'revision',d.revision,'project_ref',d.project_ref,'source_id',d.source_id,'client_binding',d.client_binding,'reason',d.reason,'previous',prior));
 return to_jsonb(d)-'reason';
end $$;
revoke all on function public.platform_approve_support_destination(integer,text,text,text,uuid,uuid,text) from public,anon,service_role;
grant execute on function public.platform_approve_support_destination(integer,text,text,text,uuid,uuid,text) to authenticated;

create function platform_private.support_destination(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d platform_private.support_destinations;
begin
 select a.* into d from platform_private.support_destinations a join public.clients c on c.id=a.client_id
 join platform_private.shop_credentials s on s.client_id=c.id join public.bridge_sources b on b.client_id=c.id
 cross join platform_private.master_identity m
 where c.id=p_client and c.onboarding_version=2 and c.pairing_mode='managed'
  and c.lifecycle_state in ('Active','Suspended') and c.infrastructure_state not in ('destroyed','decommissioned')
  and m.singleton and a.approved_by=m.auth_user_id and a.master_revision=m.revision
  and s.project_ref=a.project_ref and c.supabase_url='https://'||a.project_ref||'.supabase.co'
  and s.client_binding=a.client_binding and b.client_binding=a.client_binding and b.source_id=a.source_id
  and s.bridge_call_secret_id is not null and exists(select 1 from platform_private.source_credentials where source_id=b.source_id);
 if d.client_id is null then raise exception 'Explicit current Master-approved support destination required';end if;
 return jsonb_build_object('client_id',d.client_id,'origin',d.origin,'project_ref',d.project_ref,
  'client_binding',d.client_binding,'source_id',d.source_id,'revision',d.revision);
end $$;
revoke all on function platform_private.support_destination(integer) from public,anon,authenticated,service_role;
create function public.platform_support_destination(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform platform_private.require_role(array['master_admin']);return platform_private.support_destination(p_client);
end $$;
revoke all on function public.platform_support_destination(integer) from public,anon,service_role;
grant execute on function public.platform_support_destination(integer) to authenticated;

-- A stale approval must remain reviewable by the current Master for explicit
-- compare-and-set reapproval, without authorizing handoff to that stale record.
create function public.platform_support_destination_review(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d platform_private.support_destinations;s platform_private.shop_credentials;b public.bridge_sources;
begin
 perform platform_private.require_role(array['master_admin']);
 if not exists(select 1 from public.clients where id=p_client) then raise exception 'Client unavailable';end if;
 select * into d from platform_private.support_destinations where client_id=p_client;
 select * into s from platform_private.shop_credentials where client_id=p_client;
 select * into b from public.bridge_sources where client_id=p_client;
 return jsonb_build_object('approval',to_jsonb(d),'current_pairing',jsonb_build_object('project_ref',s.project_ref,'client_binding',s.client_binding,'source_id',b.source_id));
end $$;
revoke all on function public.platform_support_destination_review(integer) from public,anon,service_role;
grant execute on function public.platform_support_destination_review(integer) to authenticated;

-- Preserve all audited issue/consume checks; add the protected destination fence.
alter function public.platform_support_issue(integer,uuid,text,text,uuid) rename to platform_support_issue_pre17;
alter function public.platform_support_issue_pre17(integer,uuid,text,text,uuid) set schema platform_private;
do $patch$ declare definition text;old_text text:=$old$or c.shop_url is null or c.shop_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$'$old$;begin
 definition:=pg_get_functiondef('platform_private.platform_support_issue_pre17(integer,uuid,text,text,uuid)'::regprocedure);
 if position(old_text in definition)=0 then raise exception 'Unexpected legacy support URL predicate';end if;
 execute replace(definition,old_text,'');
end $patch$;
create function public.platform_support_issue(p_client integer,p_actor uuid,p_token_hash text,p_platform_project text,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; result jsonb;
begin
 perform 1 from public.clients where id=p_client for update;
 d:=platform_private.support_destination(p_client);
 result:=platform_private.platform_support_issue_pre17(p_client,p_actor,p_token_hash,p_platform_project,p_session);
 update platform_private.support_grants set destination_revision=(d->>'revision')::uuid where token_hash=p_token_hash;
 return result||jsonb_build_object('shop_url',d->>'origin','destination',d);
end $$;
revoke all on function platform_private.platform_support_issue_pre17(integer,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.platform_support_issue(integer,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_issue(integer,uuid,text,text,uuid) to service_role;

alter function public.platform_support_consume(text,text,integer,text,text,uuid) rename to platform_support_consume_pre17;
alter function public.platform_support_consume_pre17(text,text,integer,text,text,uuid) set schema platform_private;
create function public.platform_support_consume(p_token_hash text,p_source_hash text,p_client integer,p_project text,p_binding text,p_source uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; revision uuid;
begin
 perform 1 from public.clients where id=p_client for update;
 begin d:=platform_private.support_destination(p_client);exception when raise_exception then return jsonb_build_object('ok',false);end;
 select destination_revision into revision from platform_private.support_grants where token_hash=p_token_hash;
 if revision is null or revision is distinct from (d->>'revision')::uuid then return jsonb_build_object('ok',false);end if;
 return platform_private.platform_support_consume_pre17(p_token_hash,p_source_hash,p_client,p_project,p_binding,p_source);
end $$;
revoke all on function platform_private.platform_support_consume_pre17(text,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.platform_support_consume(text,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_consume(text,text,integer,text,text,uuid) to service_role;

-- F3: commercial intent survives the gap between plan save and remote dispatch.
alter table public.clients add column entitlement_generation bigint not null default 0,
 add column entitlements_pending boolean not null default false;
alter table public.config_jobs add column intent_generation bigint;
create function platform_private.guard_entitlement_intent() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.onboarding_version=2 and (new.plan is distinct from old.plan or new.inventory_billable is distinct from old.inventory_billable
  or new.ems_track_breaks is distinct from old.ems_track_breaks) then
  if new.plan is not distinct from old.plan and new.inventory_billable is not distinct from old.inventory_billable
   and exists(select 1 from public.config_jobs where client_id=new.id and request_id::text=current_setting('platform.config_completion',true) and state in ('sending','uncertain') and intent_generation=old.entitlement_generation) then return new;end if;
  if exists(select 1 from public.config_jobs where client_id=new.id and state in ('sending','uncertain')) then
   raise exception 'Configuration operation unresolved; reconcile its recorded request before changing plan or addons';end if;
  new.entitlement_generation:=old.entitlement_generation+1;new.entitlements_pending:=true;new.config_synced_at:=null;
 end if;return new;
end $$;
revoke all on function platform_private.guard_entitlement_intent() from public,anon,authenticated,service_role;
create trigger zz_entitlement_intent before update on public.clients for each row execute function platform_private.guard_entitlement_intent();

alter function platform_private.begin_config(integer,uuid,jsonb) rename to begin_config_pre17;
create function platform_private.begin_config(p_client integer,p_request uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients; j jsonb; expected jsonb;
begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 select * into strict c from public.clients where id=p_client for update;
 expected:=public.platform_plan_entitlements(c.plan,c.inventory_billable,c.ems_track_breaks);
 if c.entitlements_pending and p_changes-'suspended'<>'{}'::jsonb and not coalesce(p_changes @> expected,false) then
  raise exception 'Latest commercial entitlement intent must be reconciled before custom configuration';end if;
 j:=platform_private.begin_config_pre17(p_client,p_request,p_changes);
 if (j->>'dispatch')::boolean then update public.config_jobs set intent_generation=c.entitlement_generation where request_id=p_request;end if;
 return j||jsonb_build_object('intent_generation',c.entitlement_generation);
end $$;
revoke all on function platform_private.begin_config_pre17(integer,uuid,jsonb),platform_private.begin_config_v1(integer,uuid,jsonb),platform_private.begin_config(integer,uuid,jsonb) from public,anon,authenticated,service_role;

alter function platform_private.finish_config(uuid,text,jsonb) rename to finish_config_pre17;
create function platform_private.finish_config(p_request uuid,p_state text,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.config_jobs;c public.clients; expected jsonb;
begin
 select * into strict j from public.config_jobs where request_id=p_request;
 select * into strict c from public.clients where id=j.client_id for update;
 select * into strict j from public.config_jobs where request_id=p_request for update;
 if j.state not in ('sending','uncertain') then return;end if;
 expected:=public.platform_plan_entitlements(c.plan,c.inventory_billable,c.ems_track_breaks);
 if j.intent_generation is distinct from c.entitlement_generation then
  update public.config_jobs set state='uncertain',updated_at=clock_timestamp(),result=jsonb_build_object('resolution','stale_intent','remote_outcome','unknown') where request_id=p_request;
  return;
 end if;
 if p_state='applied' and c.entitlements_pending and j.changes-'suspended'<>'{}'::jsonb and not coalesce(p_result @> expected,false) then
  raise exception 'Latest commercial entitlement intent is not verified';end if;
 perform set_config('platform.config_completion',p_request::text,true);
 perform platform_private.finish_config_pre17(p_request,p_state,p_result);
 if p_state='applied' and (select state='applied' from public.config_jobs where request_id=p_request) then
  update public.clients set entitlements_pending=entitlements_pending and not coalesce(p_result @> expected,false),
   config_synced_at=case when entitlements_pending and not coalesce(p_result @> expected,false) then null else config_synced_at end
   where id=c.id and entitlement_generation=j.intent_generation;
 end if;
end $$;
revoke all on function platform_private.finish_config_pre17(uuid,text,jsonb),platform_private.finish_config_v1(uuid,text,jsonb),platform_private.finish_config(uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Do not turn an unknown remote write into a terminal failure to unlock a plan.
do $patch$ declare definition text;begin
 definition:=pg_get_functiondef('public.platform_config_recovery(integer,uuid,text,text)'::regprocedure);
 if position('if p_action=''close'' then' in definition)=0 then raise exception 'Unexpected recovery definition';end if;
 execute replace(definition,'if p_action=''close'' then','if p_action=''close'' then raise exception ''Unknown remote configuration requires verified read-back; cannot close blindly'';');
end $patch$;

-- Expose only safe current intent to authorized operational callers for recovery.
create function public.platform_config_intent(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients;begin
 perform platform_private.require_role(array['master_admin','portfolio_manager']);
 select * into strict c from public.clients where id=p_client and lifecycle_state<>'Archived' and infrastructure_state not in ('destroyed','decommissioned');
 return jsonb_build_object('generation',c.entitlement_generation,'pending',c.entitlements_pending,
  'changes',public.platform_plan_entitlements(c.plan,c.inventory_billable,c.ems_track_breaks));
end $$;
revoke all on function public.platform_config_intent(integer) from public,anon,service_role;
grant execute on function public.platform_config_intent(integer) to authenticated;

alter function public.platform_overhaul_status(integer) rename to platform_overhaul_status_pre17;
alter function public.platform_overhaul_status_pre17(integer) set schema platform_private;
create function public.platform_overhaul_status(p_client integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 result:=platform_private.platform_overhaul_status_pre17(p_client);
 return result||jsonb_build_object('entitlement_intent',(select jsonb_build_object('generation',entitlement_generation,'pending',entitlements_pending) from public.clients where id=p_client));
end $$;
revoke all on function platform_private.platform_overhaul_status_pre17(integer) from public,anon,authenticated,service_role;
revoke all on function public.platform_overhaul_status(integer) from public,anon,service_role;
grant execute on function public.platform_overhaul_status(integer) to authenticated;

create function public.platform_config_finish_result(p_request uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',j.state,'intent_current',j.intent_generation=c.entitlement_generation and (not c.entitlements_pending or j.changes-'suspended'='{}'::jsonb),'entitlements_pending',c.entitlements_pending)
 from public.config_jobs j join public.clients c on c.id=j.client_id where j.request_id=p_request
$$;
revoke all on function public.platform_config_finish_result(uuid) from public,anon,authenticated;
grant execute on function public.platform_config_finish_result(uuid) to service_role;

-- Keep private implementation closed; the existing service-only public wrapper
-- now performs the owner transition instead of exposing private EXECUTE.
alter function public.platform_finish_config(uuid,text,jsonb) security definer;
