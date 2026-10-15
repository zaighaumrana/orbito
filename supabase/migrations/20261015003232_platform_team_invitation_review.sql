-- Forward 16; the CLI commits this SQL and genuine history together.
-- No provider writes, policy enablement, or modification of migrations 1–15.
alter table platform_private.team_operations add column resolution jsonb not null default '{}';

create function public.platform_team_clear_failed_invitation(p_actor uuid,p_request uuid,p_target uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o platform_private.team_operations%rowtype; r public.platform_users%rowtype;
begin
 perform platform_private.team_master(p_actor);
 if not platform_private.session_live(p_actor,p_session) then raise exception 'Live master session required' using errcode='42501';end if;
 if p_request is null or p_target is null then raise exception 'Exact request and target required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,0));
 select * into strict o from platform_private.team_operations where request_id=p_request for update;
 if o.actor_id<>p_actor or o.target_id<>p_target or o.action<>'create' or p_target<>p_request
 then raise exception 'Failed invitation ownership mismatch';end if;
 if o.stage='cancelled' and o.resolution->>'kind'='failed_invitation_cleared' then
  return jsonb_build_object('success',true,'already_cleared',true,'operation_id',p_request);
 end if;
 select * into strict r from public.platform_users where id=p_target for update;
 -- A review must have settled and aged; never clear a live reservation/dispatch.
 -- Late native responses cannot finish a cancelled reservation or grant access.
 if o.stage<>'review_required' or o.updated_at>clock_timestamp()-interval '2 minutes'
  or r.status<>'Pending' or r.auth_user_id is not null or r.suspended_from is not null
  or o.snapshot->>'id' is distinct from r.id::text
  or o.snapshot->>'email' is distinct from r.email or o.requested->>'email' is distinct from r.email
  or o.snapshot->>'name' is distinct from r.name or o.requested->>'name' is distinct from r.name
  or o.snapshot->>'role' is distinct from r.role or o.requested->>'role' is distinct from r.role
  or r.role not in ('portfolio_manager','billing_person')
  or exists(select 1 from platform_private.team_operations where target_id=r.id and request_id<>p_request and stage not in ('completed','cancelled'))
  or exists(select 1 from public.platform_team_archive where id=r.id)
  or exists(select 1 from pg_constraint where contype='f' and confrelid='public.platform_users'::regclass)
 then raise exception 'Failed invitation requires reconciliation; clearance denied';end if;
 -- Soft-deleted identities count as PRESENT too. Missing/unreadable Auth fails.
 if exists(select 1 from auth.users u where lower(trim(u.email))=lower(trim(r.email))
   or u.id=r.auth_user_id or u.id=nullif(o.snapshot->>'auth_user_id','')::uuid
   or u.id=nullif(o.requested->>'auth_user_id','')::uuid
   or (o.requested->>'invite_nonce' is not null and u.raw_user_meta_data->>'retrasell_invite_nonce'=o.requested->>'invite_nonce'))
 then raise exception 'Auth absence not verified; clearance denied';end if;
 perform set_config('platform.team_transition','trusted',true);
 update platform_private.team_operations set stage='cancelled',updated_at=clock_timestamp(),
  resolution=jsonb_build_object('kind','failed_invitation_cleared','by',p_actor,'at',clock_timestamp(),'auth_absence_verified',true)
 where request_id=p_request;
 delete from public.platform_users where id=p_target;
 insert into public.operator_audit(actor_id,action,detail) values(p_actor,'platform_team_clear_failed_invitation',
  jsonb_build_object('operation_id',p_request,'target_id',p_target,'auth_absence_verified',true));
 return jsonb_build_object('success',true,'already_cleared',false,'operation_id',p_request);
end $$;
revoke all on function public.platform_team_clear_failed_invitation(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_team_clear_failed_invitation(uuid,uuid,uuid,uuid) to service_role;

-- Read-only, caller-scoped evidence for an early deletion rejection. Failure of
-- this read must retain UNKNOWN history; never infer absence from a failed lookup.
create function public.platform_team_delete_state(p_request uuid,p_target uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o platform_private.team_operations%rowtype;
begin
 perform platform_private.require_role(array['master_admin']);
 if p_request is null or p_target is null then raise exception 'Exact request and target required';end if;
 select * into o from platform_private.team_operations where request_id=p_request;
 if o.request_id is not null then
  if o.actor_id<>auth.uid() or o.target_id<>p_target or o.action<>'delete' then return jsonb_build_object('state','unverified');end if;
 else
  select * into o from platform_private.team_operations where target_id=p_target and action='delete'
   order by created_at desc,request_id desc limit 1;
 end if;
 if o.request_id is null then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state',o.stage,'operation_id',o.request_id);
end $$;
revoke all on function public.platform_team_delete_state(uuid,uuid) from public,anon,service_role;
grant execute on function public.platform_team_delete_state(uuid,uuid) to authenticated;

-- Own verified identity notice only; never an email/username lookup or authority.
create function public.platform_account_access_notice() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('auth_user_id',u.id,'inactive',exists(select 1 from public.platform_users t
  where t.auth_user_id=u.id and lower(t.email)=lower(u.email) and t.status='Inactive'))
 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
  and not coalesce(u.is_anonymous,false) and exists(select 1 from auth.sessions s
   where s.id=platform_private.caller_session_id() and s.user_id=u.id and (s.not_after is null or s.not_after>now()))
$$;
revoke all on function public.platform_account_access_notice() from public,anon,service_role;
grant execute on function public.platform_account_access_notice() to authenticated;

-- Safe Master-only UI projection. No nonce, provider payload, tokens or private
-- snapshot is returned. Native delivery/expiry cannot be inferred from Auth login.
create or replace function public.platform_team_history() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin']);
 return jsonb_build_object('operations',(select coalesce(jsonb_agg(jsonb_build_object(
  'request_id',request_id,'target_id',target_id,'action',action,'stage',stage,'expires_at',expires_at,
  'clear_after',case when action='create' and stage='review_required' then updated_at+interval '2 minutes' end)),'[]')
  from platform_private.team_operations where stage not in ('completed','cancelled')));
end $$;
