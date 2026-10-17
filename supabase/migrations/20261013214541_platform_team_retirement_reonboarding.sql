-- Forward 15. CLI owns SQL/history atomicity; migrations 13/14 are immutable.
-- Historical employee/Auth UUIDs remain terminal. Only the email may be reused
-- after explicit Master approval of a verified retired predecessor.
drop index public.platform_team_archive_email_unique;
create index platform_team_archive_email_history on public.platform_team_archive(lower(trim(email)),deleted_at desc,id desc);

create function platform_private.team_allow_onboarding(p_email text,p_retired text) returns void
language plpgsql security definer set search_path='' as $$
declare prior public.platform_team_archive%rowtype;
begin
 select * into prior from public.platform_team_archive where lower(trim(email))=lower(trim(p_email)) order by deleted_at desc,id desc limit 1;
 if prior.id is not null then
  if p_retired is null or p_retired::uuid<>prior.id or prior.final_status<>'Auth absence verified'
   or exists(select 1 from public.platform_team_archive a join auth.users u on u.id=a.auth_user_id where lower(trim(a.email))=lower(trim(p_email)))
  then raise exception 'Explicit verified retirement approval required';end if;
 elsif p_retired is not null then raise exception 'Retired predecessor does not match';end if;
 if exists(select 1 from auth.users where lower(trim(email))=lower(trim(p_email))) then raise exception 'Existing Auth identity cannot be adopted';end if;
end $$;
revoke all on function platform_private.team_allow_onboarding(text,text) from public,anon,authenticated,service_role;

create function platform_private.team_delete_identity(p_user uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users where lower(trim(email))=lower(trim(p_email)) and id is distinct from p_user)
  or exists(select 1 from auth.users where id=p_user and (lower(trim(email)) is distinct from lower(trim(p_email)) or deleted_at is not null or coalesce(is_anonymous,false)))
 then raise exception 'Unlinked or inconsistent Auth identity requires review; never adopt or delete by email';end if;
end $$;
revoke all on function platform_private.team_delete_identity(uuid,text) from public,anon,authenticated,service_role;

-- Narrow, checked replacements preserve every other audited command/authorization
-- predicate and existing function ACL. Unexpected deployed source fails closed.
do $$ declare edit record; definition text;begin
 for edit in select * from (values
 ('platform_private.team_guard()',
  'where lower(trim(email))=lower(trim(new.email))', 'where id=new.id',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  '''reason'',''provider_ban''', '''reason'',''provider_ban'',''retired_employee_id''',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'if p_target<>p_request or p_data', 'perform platform_private.team_allow_onboarding(p_data->>''email'',p_data->>''retired_employee_id'');
  if p_target<>p_request or p_data',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'or exists(select 1 from public.platform_team_archive where lower(email)=lower(p_data->>''email''))',
  'or exists(select 1 from public.platform_team_archive where id=p_target)',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'o.action<>''create'' or o.requested<>p_data', 'o.action<>''create'' or (o.requested-''invite_nonce'')<>p_data',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  '''create'',''reserved'',to_jsonb(r),p_data)',
  '''create'',''reserved'',to_jsonb(r),p_data||jsonb_build_object(''invite_nonce'',encode(extensions.gen_random_bytes(32),''hex'')))',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'perform platform_private.team_delete_dependencies(r.auth_user_id);',
  'perform platform_private.team_delete_identity(r.auth_user_id,r.email);
   perform platform_private.team_delete_dependencies(r.auth_user_id);',2),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'update public.platform_users set auth_user_id=u.id where id=r.id;',
  'if u.raw_user_meta_data->>''retrasell_invite_nonce'' is distinct from o.requested->>''invite_nonce''
     or u.created_at is null or u.created_at<o.created_at or u.invited_at is null or u.invited_at<o.created_at
     or exists(select 1 from public.platform_team_archive where auth_user_id=u.id)
    then raise exception ''Fresh invitation identity is not proven; requires reconciliation'';end if;
   update public.platform_users set auth_user_id=u.id where id=r.id;',1),
 ('public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid)',
  'jsonb_build_object(''operation_id'',p_request,''target_id'',p_target,''stage'',o.stage',
  'jsonb_build_object(''operation_id'',p_request,''target_id'',p_target,''predecessor_employee_id'',o.requested->>''retired_employee_id'',''stage'',o.stage',1),
 ('public.platform_team_setup_context()', 'auth_user_id=u.id or lower(email)=lower(u.email)', 'auth_user_id=u.id',1),
 ('public.platform_team_password_step(uuid,uuid,text,uuid)', 'auth_user_id=p_user or lower(email)=lower(r.email)', 'auth_user_id=p_user',1),
 ('platform_private.operator_role()', 'auth_user_id=u.id or lower(email)=lower(u.email)', 'auth_user_id=u.id',1)
 ) as corrections(signature,old_text,new_text,expected_count) loop
  definition:=pg_get_functiondef(edit.signature::regprocedure);
  if (length(definition)-length(replace(definition,edit.old_text,'')))/length(edit.old_text)<>edit.expected_count
   then raise exception 'Unexpected lifecycle definition for %; review before migration',edit.signature;end if;
  execute replace(definition,edit.old_text,edit.new_text);
 end loop;
end $$;

-- A new email dispatch has its own durable ID; no resend of an uncertain request.
alter table platform_private.team_operations drop constraint team_operations_action_check;
alter table platform_private.team_operations add constraint team_operations_action_check
 check(action in ('create','edit','deactivate','reactivate','delete','invite_setup','resend_invite'));
create function public.platform_team_resend_command(p_actor uuid,p_request uuid,p_target uuid,p_step text,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype;u auth.users%rowtype;o platform_private.team_operations%rowtype;fresh boolean=false;
begin
 perform platform_private.team_master(p_actor);
 if not platform_private.session_live(p_actor,p_session) then raise exception 'Live master session required' using errcode='42501';end if;
 if p_request is null or p_target is null or p_step not in ('begin','dispatch','finish','mark_review') or p_step is null then raise exception 'Invalid resend command';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,0));
 select * into strict r from public.platform_users where id=p_target for update;
 select * into u from auth.users where id=r.auth_user_id;
 if r.status<>'Pending' or r.role not in ('portfolio_manager','billing_person') or r.auth_user_id=p_actor
  or u.id is null or lower(trim(u.email)) is distinct from lower(trim(r.email)) or u.deleted_at is not null or coalesce(u.is_anonymous,false)
  or u.banned_until>now() or exists(select 1 from public.platform_team_archive where id=r.id or auth_user_id=u.id)
 then raise exception 'Verified live Pending employee required';end if;
 select * into o from platform_private.team_operations where request_id=p_request for update;
 if o.request_id is not null and (o.actor_id<>p_actor or o.target_id<>p_target or o.action<>'resend_invite') then raise exception 'Conflicting resend identity';end if;
 if p_step='begin' then
  if o.request_id is not null then return to_jsonb(o)||jsonb_build_object('new_operation',false);end if;
  if exists(select 1 from platform_private.team_operations where target_id=r.id and stage not in ('completed','cancelled')) then raise exception 'Outstanding operation requires reconciliation';end if;
  if exists(select 1 from platform_private.team_operations where target_id=r.id and action='resend_invite' and created_at>now()-interval '1 minute') then raise exception 'Wait before requesting another setup email';end if;
  insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot)
   values(p_request,p_actor,p_target,'resend_invite','reserved',to_jsonb(r)) returning * into o;fresh=true;
 elsif o.request_id is null then raise exception 'Reserved resend required';
 elsif p_step='dispatch' and o.stage='reserved' then
  update platform_private.team_operations set stage='provider_dispatched',updated_at=now() where request_id=p_request returning * into o;
 elsif p_step='finish' and o.stage='provider_dispatched' and r.auth_user_id=(o.snapshot->>'auth_user_id')::uuid and r.email=o.snapshot->>'email' then
  update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
 elsif p_step='mark_review' and o.stage not in ('completed','cancelled') then
  update platform_private.team_operations set stage='review_required',updated_at=now() where request_id=p_request returning * into o;
 else raise exception 'Resend stage requires reconciliation';end if;
 insert into public.operator_audit(actor_id,action,detail) values(p_actor,'platform_team_resend_'||p_step,jsonb_build_object('operation_id',p_request,'target_id',p_target));
 return to_jsonb(o)||jsonb_build_object('new_operation',fresh);
end $$;
revoke all on function public.platform_team_resend_command(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_team_resend_command(uuid,uuid,uuid,text,uuid) to service_role;
