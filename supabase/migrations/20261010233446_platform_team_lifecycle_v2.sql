-- CLI owns the migration transaction AND history insert. No authored COMMIT.
-- Hosted application is not compatible until the coordinated v2 server rollout.
do $$ begin
 if exists(select 1 from public.platform_users group by auth_user_id having auth_user_id is not null and count(*)>1)
  or exists(select 1 from public.platform_users group by lower(trim(email)) having count(*)>1)
  or exists(select 1 from public.platform_users where status is null or status not in ('Active','Pending','Inactive'))
 then raise exception 'Ambiguous team inventory; resolve through reviewed recovery before migration'; end if;
 if exists(select 1 from pg_constraint where contype='f' and confrelid='public.platform_users'::regclass)
 then raise exception 'New team foreign keys require a retention review'; end if;
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='auth.users'::regclass and n.nspname not in ('auth','storage')
   and t.oid not in ('platform_private.master_identity'::regclass,'platform_private.master_bootstrap_approval'::regclass))
 then raise exception 'Custom Auth references require a retention review'; end if;
end $$;
create unique index platform_users_auth_unique on public.platform_users(auth_user_id) where auth_user_id is not null;
create unique index platform_users_email_unique on public.platform_users(lower(trim(email)));
alter table public.platform_users add column suspended_from text check(suspended_from in ('Active','Pending'));
-- Existing Inactive rows deliberately remain unclassified: the old handler deleted Auth.
alter table public.platform_users add constraint platform_users_status_check check(status in ('Active','Pending','Inactive'));
revoke all on public.platform_users from anon,authenticated;
revoke update(name,email,role,status) on public.platform_users from authenticated;
grant select on public.platform_users to authenticated;
revoke all on public.platform_users from service_role;
grant select on public.platform_users to service_role;
revoke update,delete,truncate,references,trigger,maintain on public.operator_audit from service_role;
drop policy if exists users_admin on public.platform_users;

create table public.platform_team_archive(
 id uuid primary key, auth_user_id uuid unique, name text not null, email text not null,
 role text not null, joined_at timestamptz, deleted_at timestamptz not null default now(),
 deleted_by uuid not null, operation_id uuid not null unique, reason text,
 final_status text not null default 'Auth absence verified' check(final_status='Auth absence verified')
);
create unique index platform_team_archive_email_unique on public.platform_team_archive(lower(trim(email)));
alter table public.platform_team_archive enable row level security;
revoke all on public.platform_team_archive from public,anon,authenticated,service_role;
grant select on public.platform_team_archive to authenticated;
create policy archive_master_read on public.platform_team_archive for select to authenticated using(platform_private.operator_role()='master_admin');

create table platform_private.team_operations(
 request_id uuid primary key, actor_id uuid not null, target_id uuid not null,
 action text not null check(action in ('create','edit','deactivate','reactivate','delete','invite_setup')),
 stage text not null check(stage in ('reserved','provider_dispatched','waiting_password','password_setting','password_saved','auth_delete_dispatched','review_required','completed','cancelled')),
 snapshot jsonb not null, requested jsonb not null default '{}',
 expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index team_one_open_operation on platform_private.team_operations(target_id) where stage not in ('completed','cancelled');
alter table platform_private.team_operations enable row level security;
revoke all on platform_private.team_operations from public,anon,authenticated,service_role;

-- Live provider session ownership is mandatory. Missing/malformed session claims fail closed.
do $$ begin
 if to_regclass('auth.sessions') is null or to_regclass('auth.mfa_amr_claims') is null then raise exception 'Managed Auth session schema required'; end if;
end $$;
alter table public.platform_users add column session_not_before timestamptz;
create function platform_private.caller_session_id() returns uuid language plpgsql stable security definer set search_path='' as $$
begin return (auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then return null; end $$;
revoke all on function platform_private.caller_session_id() from public,anon,authenticated,service_role;
create function platform_private.session_live(p_user uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and s.created_at is not null
  and (s.not_after is null or s.not_after>now())
  and not exists(select 1 from public.platform_users t where t.auth_user_id=p_user and t.session_not_before is not null and s.created_at<=t.session_not_before))
$$;
revoke all on function platform_private.session_live(uuid,uuid) from public,anon,authenticated,service_role;
create table platform_private.team_suspensions(target_id uuid primary key,auth_user_id uuid not null,previous_ban timestamptz,owned_ban timestamptz,completed boolean not null default false);
alter table platform_private.team_suspensions enable row level security;
revoke all on platform_private.team_suspensions from public,anon,authenticated,service_role;
create function platform_private.team_delete_dependencies(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('storage.objects') is null then raise exception 'Storage inventory unavailable; deletion is blocked'; end if;
 if p_user is not null and exists(select 1 from storage.objects s where to_jsonb(s)->>'owner'=p_user::text or to_jsonb(s)->>'owner_id'=p_user::text) then raise exception 'Storage ownership requires reviewed transfer before deletion'; end if;
 if exists(select 1 from pg_constraint where contype='f' and confrelid='public.platform_users'::regclass) then raise exception 'New team references require a retention review'; end if;
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='auth.users'::regclass
   and not (n.nspname='auth' and pg_get_userbyid(t.relowner)='supabase_auth_admin'
    and t.relname in ('identities','sessions','mfa_factors','one_time_tokens','oauth_consents','oauth_authorizations','webauthn_credentials','webauthn_challenges','scim_users','mfa_recovery_code_sets')
    and c.conname=t.relname||'_user_id_fkey'
    and c.conkey=array[(select attnum from pg_attribute where attrelid=t.oid and attname='user_id')]::smallint[])
   and t.oid not in ('platform_private.master_identity'::regclass,'platform_private.master_bootstrap_approval'::regclass))
 then raise exception 'Custom Auth references require a retention review'; end if;
end $$;
revoke all on function platform_private.team_delete_dependencies(uuid) from public,anon,authenticated,service_role;

-- Independent password grants require verified multi-session continuity. Default
-- disabled; rebinding the Master invalidates this separately audited approval.
create table platform_private.password_verification_policy(singleton boolean primary key default true check(singleton),auth_user_id uuid,enabled boolean not null default false);
insert into platform_private.password_verification_policy(singleton) values(true);
alter table platform_private.password_verification_policy enable row level security;
revoke all on platform_private.password_verification_policy from public,anon,authenticated,service_role;
create function platform_private.configure_password_verification(p_master uuid,p_enabled boolean,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'postgres' or p_enabled is null or length(trim(coalesce(p_reason,''))) not between 10 and 500
  or not exists(select 1 from platform_private.master_identity where singleton and auth_user_id=p_master)
 then raise exception 'Trusted current Master continuity approval required' using errcode='42501'; end if;
 update platform_private.password_verification_policy set auth_user_id=p_master,enabled=p_enabled where singleton;
 insert into public.operator_audit(actor_id,action,detail) values(null,'password_verification_policy',jsonb_build_object('master_uuid',p_master,'enabled',p_enabled,'reason',p_reason));
end $$;
revoke all on function platform_private.configure_password_verification(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function platform_private.configure_password_verification(uuid,boolean,text) to postgres;
create function platform_private.password_verification_safe(p_master uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from platform_private.password_verification_policy p join platform_private.master_identity m on m.auth_user_id=p.auth_user_id where p.singleton and p.enabled and p.auth_user_id=p_master)
$$;
revoke all on function platform_private.password_verification_safe(uuid) from public,anon,authenticated,service_role;

create function platform_private.team_master(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from platform_private.master_identity m join auth.users u on u.id=m.auth_user_id
  where m.singleton and u.id=p_actor and u.email_confirmed_at is not null and u.deleted_at is null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())
  and exists(select 1 from public.platform_config where id=1))
 then raise exception 'Master administrator required' using errcode='42501'; end if;
end $$;
revoke all on function platform_private.team_master(uuid) from public,anon,authenticated,service_role;

create function platform_private.team_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('platform.team_transition',true) is distinct from 'trusted' then
  raise exception 'Use audited team lifecycle RPCs' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 if exists(select 1 from public.platform_team_archive where lower(trim(email))=lower(trim(new.email))
  or (auth_user_id is not null and auth_user_id=new.auth_user_id)) then raise exception 'Archived identity is terminal'; end if;
 return new;
end $$;
revoke all on function platform_private.team_guard() from public,anon,authenticated,service_role;
create trigger platform_team_transition_guard before insert or update or delete on public.platform_users for each row execute function platform_private.team_guard();
create function platform_private.immutable_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'History is immutable' using errcode='42501'; end $$;
revoke all on function platform_private.immutable_history() from public,anon,authenticated,service_role;
create trigger platform_team_archive_immutable before update or delete on public.platform_team_archive for each row execute function platform_private.immutable_history();
-- Keep the historical operator_audit_immutable trigger and its original function.

-- One trusted server command boundary. Never persist password/CAPTCHA/token input.
create function public.platform_team_command(p_actor uuid,p_request uuid,p_action text,p_target uuid,p_data jsonb default '{}',p_session uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; o platform_private.team_operations%rowtype; u auth.users%rowtype;
 a text; result jsonb; desired text; fresh boolean=false; had_setup boolean=false;
begin
 perform platform_private.team_master(p_actor);
 if not platform_private.session_live(p_actor,p_session) then raise exception 'Live master session required' using errcode='42501'; end if;
 if p_action in ('begin_delete','dispatch_delete') and not platform_private.password_verification_safe(p_actor) then raise exception 'Password verifier continuity is not approved' using errcode='42501'; end if;
 if p_request is null or p_target is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object'
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','email','role','auth_user_id','reason','provider_ban'))
 then raise exception 'Invalid command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,0));
 select * into o from platform_private.team_operations where request_id=p_request for update;
 if found and (o.actor_id<>p_actor or o.target_id<>p_target) then raise exception 'Conflicting operation identity'; end if;
 perform set_config('platform.team_transition','trusted',true);
 if p_action='begin_create' then
  if o.request_id is not null then
   if o.action<>'create' or o.requested<>p_data then raise exception 'Conflicting retry'; end if;
   return to_jsonb(o)||jsonb_build_object('new_operation',false);
  end if;
  if p_target<>p_request or p_data->>'role' not in ('portfolio_manager','billing_person') or coalesce(trim(p_data->>'name'),'')=''
   or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or exists(select 1 from auth.users where lower(email)=lower(p_data->>'email'))
   or exists(select 1 from public.platform_team_archive where lower(email)=lower(p_data->>'email'))
  then raise exception 'Invitation identity unavailable'; end if;
  insert into public.platform_users(id,name,email,role,status) values(p_target,trim(p_data->>'name'),lower(trim(p_data->>'email')),p_data->>'role','Pending') returning * into r;
  insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot,requested)
   values(p_request,p_actor,p_target,'create','reserved',to_jsonb(r),p_data) returning * into o;
  fresh=true;
 else
  select * into r from public.platform_users where id=p_target for update;
  if r.id is null then
   if o.action='delete' and o.stage='completed' and p_action in ('begin_delete','finish_delete','reconcile_delete') then return to_jsonb(o)||jsonb_build_object('new_operation',false); end if;
   raise exception 'Unique live team account required';
  end if;
  if r.auth_user_id=p_actor or lower(r.email)=(select lower(email) from auth.users where id=p_actor) or r.role not in ('portfolio_manager','billing_person') then raise exception 'Master account is protected'; end if;
  select * into u from auth.users where id=r.auth_user_id;
  if p_action not in ('begin_delete','dispatch_delete','finish_delete','reconcile_delete','mark_review') and
   p_action<>'finish_create' and (u.id is null or u.deleted_at is not null or coalesce(u.is_anonymous,false)
    or (p_action<>'finish_edit' and lower(u.email)<>lower(r.email)) or (p_action not in ('deactivate','begin_reactivate','dispatch_provider','finish_deactivate','finish_reactivate') and u.banned_until is not null and u.banned_until>now()))
  then raise exception 'Linked Auth identity unavailable or blocked; operator review required'; end if;
  if p_action in ('deactivate','begin_reactivate','begin_edit','begin_delete') then
   a=case p_action when 'begin_reactivate' then 'reactivate' when 'begin_edit' then 'edit' when 'begin_delete' then 'delete' else 'deactivate' end;
   if o.request_id is not null then
    if o.action<>a then raise exception 'Conflicting retry'; end if;
    if a='edit' and o.requested<>p_data then raise exception 'Conflicting payload'; end if;
    return to_jsonb(o)||jsonb_build_object('new_operation',false);
   end if;
   -- Deactivation/delete revoke outstanding setup approvals; other conflicts fail closed.
   if a in ('deactivate','delete') then
    select exists(select 1 from platform_private.team_operations where target_id=r.id and action in ('reactivate','invite_setup') and stage not in ('completed','cancelled')) into had_setup;
    update platform_private.team_operations set stage='cancelled',updated_at=now()
     where target_id=r.id and action in ('reactivate','invite_setup') and stage not in ('completed','cancelled');
   end if;
   if exists(select 1 from platform_private.team_operations where target_id=r.id and stage not in ('completed','cancelled')) then raise exception 'Outstanding operation requires reconciliation'; end if;
   if a='deactivate' and r.status not in ('Active','Pending') and not had_setup then raise exception 'Account is already inactive'; end if;
   if a='reactivate' and (r.status<>'Inactive' or r.suspended_from is null) then raise exception 'Legacy inactive identity requires review; never recreate Auth'; end if;
   if a='edit' and r.status<>'Active' then raise exception 'Only Active accounts can be edited'; end if;
   if a='edit' and p_data ? 'email' and (exists(select 1 from public.platform_team_archive where lower(email)=lower(p_data->>'email'))
    or exists(select 1 from public.platform_users where id<>r.id and lower(email)=lower(p_data->>'email'))
    or exists(select 1 from auth.users where id<>r.auth_user_id and lower(email)=lower(p_data->>'email')))
   then raise exception 'Requested email is unavailable'; end if;
   if a='delete' and u.id is not null and (u.deleted_at is not null or coalesce(u.is_anonymous,false) or lower(u.email)<>lower(r.email)) then raise exception 'Deletion identity drift'; end if;
   if a='delete' then
    if r.auth_user_id is null and exists(select 1 from auth.users where lower(email)=lower(r.email))
    then raise exception 'Unlinked Auth identity requires reviewed reconciliation; never adopt or delete by email'; end if;
    perform platform_private.team_delete_dependencies(r.auth_user_id);
   end if;
   insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot,requested,expires_at)
    values(p_request,p_actor,r.id,a,'reserved',to_jsonb(r),p_data,
     null) returning * into o;
   fresh=true;
   if a='reactivate' and not exists(select 1 from platform_private.team_suspensions where target_id=r.id and completed) then raise exception 'Owned completed suspension required; review legacy or incomplete identity'; end if;
   if a='deactivate' then
    insert into platform_private.team_suspensions(target_id,auth_user_id,previous_ban) values(r.id,r.auth_user_id,case when u.banned_until>now() then u.banned_until end)
     on conflict(target_id) do update set auth_user_id=excluded.auth_user_id,previous_ban=excluded.previous_ban,owned_ban=null,completed=false;
   end if;
   if a in ('deactivate','delete') then
    update public.platform_users set suspended_from=case when a='deactivate' then case when r.status='Inactive' then r.suspended_from else r.status end else null end,status='Inactive',session_not_before=clock_timestamp() where id=r.id;
   end if;
  elsif p_action='finish_create' then
   if o.request_id is null or o.action<>'create' or o.stage<>'reserved' or r.auth_user_id is not null then raise exception 'Invitation completion not allowed'; end if;
   select * into strict u from auth.users where id=(p_data->>'auth_user_id')::uuid;
   if u.id=p_actor or u.deleted_at is not null or lower(u.email)<>lower(r.email) then raise exception 'Invitation identity mismatch'; end if;
   update public.platform_users set auth_user_id=u.id where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='dispatch_provider' then
   if o.request_id is null or o.action not in ('deactivate','reactivate') or o.stage<>'reserved' or r.status<>'Inactive' then raise exception 'Provider dispatch not allowed'; end if;
   if o.action='deactivate' and u.banned_until>now() and not exists(select 1 from platform_private.team_suspensions x where x.target_id=r.id and x.previous_ban=u.banned_until)
    then raise exception 'Provider restriction changed before dispatch'; end if;
   if o.action='reactivate' then
    if not exists(select 1 from platform_private.team_suspensions x where x.target_id=r.id and x.auth_user_id=r.auth_user_id and x.completed
      and x.previous_ban is null and x.owned_ban is not null and x.owned_ban=u.banned_until)
    then raise exception 'Independent or changed provider restriction requires review'; end if;
   end if;
   update platform_private.team_operations set stage='provider_dispatched',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='finish_deactivate' then
   if o.request_id is null or o.action<>'deactivate' or o.stage<>'provider_dispatched' or r.status<>'Inactive' or u.banned_until is null or u.banned_until<=now()
    -- GoTrue returns nanoseconds; PostgreSQL stores microseconds. Accept only
    -- this one-microsecond serialization difference, never an arbitrary ban.
    or not coalesce(abs(extract(epoch from ((p_data->>'provider_ban')::timestamptz-u.banned_until)))<=0.000001,false)
    then raise exception 'Provider suspension not verified'; end if;
   update platform_private.team_suspensions set owned_ban=case when previous_ban is null then u.banned_until end,completed=true where target_id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='finish_reactivate' then
   if o.request_id is null or o.action<>'reactivate' or o.stage<>'provider_dispatched' or r.status<>'Inactive' or u.banned_until is not null
    or r.suspended_from not in ('Active','Pending') then raise exception 'Provider restoration not verified'; end if;
   update public.platform_users set status=r.suspended_from,suspended_from=null,session_not_before=clock_timestamp() where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='finish_edit' then
   if o.request_id is null or o.action<>'edit' or o.stage<>'reserved' or r.status<>'Active' then raise exception 'Edit completion not allowed'; end if;
   desired=coalesce(o.requested->>'email',r.email);
   if lower(u.email)<>lower(desired) then raise exception 'Auth email update not verified'; end if;
   update public.platform_users set name=coalesce(o.requested->>'name',name),email=desired,role=coalesce(o.requested->>'role',role) where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='dispatch_delete' then
   if o.request_id is null or o.action<>'delete' or o.stage<>'reserved' or r.status<>'Inactive' then raise exception 'Deletion dispatch not allowed'; end if;
   perform platform_private.team_delete_dependencies(r.auth_user_id);
   update platform_private.team_operations set stage='auth_delete_dispatched',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action in ('finish_delete','reconcile_delete') then
   if o.request_id is null or o.action<>'delete' or o.stage not in ('auth_delete_dispatched','review_required','reserved') or r.status<>'Inactive'
    or exists(select 1 from auth.users where id=r.auth_user_id or lower(email)=lower(r.email)) then raise exception 'Auth absence not verified; do not retry deletion blindly'; end if;
   insert into public.platform_team_archive(id,auth_user_id,name,email,role,joined_at,deleted_by,operation_id,reason)
    values(r.id,r.auth_user_id,r.name,r.email,r.role,r.created_at,p_actor,p_request,o.requested->>'reason');
   delete from public.platform_users where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='mark_review' then
   if o.request_id is null or o.stage in ('completed','cancelled') then raise exception 'No incomplete operation'; end if;
   update platform_private.team_operations set stage='review_required',updated_at=now() where request_id=p_request returning * into o;
  else raise exception 'Unsupported command'; end if;
 end if;
 insert into public.operator_audit(actor_id,action,detail) values(p_actor,'platform_team_'||p_action,
  jsonb_build_object('operation_id',p_request,'target_id',p_target,'stage',o.stage,'previous_role',o.snapshot->>'role','requested_role',o.requested->>'role'));
 return to_jsonb(o)||jsonb_build_object('new_operation',fresh,'previous_ban',(select previous_ban from platform_private.team_suspensions where target_id=p_target),'owned_ban',(select owned_ban from platform_private.team_suspensions where target_id=p_target));
end $$;
revoke all on function public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.platform_team_command(uuid,uuid,text,uuid,jsonb,uuid) to service_role;

create function public.platform_team_setup_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; u auth.users%rowtype; sid uuid=platform_private.caller_session_id();
begin
 select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false)
  and (banned_until is null or banned_until<=now());
 if u.id is null or not platform_private.session_live(u.id,sid) then raise exception 'Verified live Auth session required' using errcode='42501'; end if;
 if exists(select 1 from public.platform_team_archive where auth_user_id=u.id or lower(email)=lower(u.email)) then raise exception 'Archived identity denied'; end if;
 if platform_private.operator_role() is not null then return jsonb_build_object('kind','active','auth_user_id',u.id,'email',u.email,'session_id',sid); end if;
 select * into strict r from public.platform_users where auth_user_id=u.id;
 if lower(r.email)<>lower(u.email) then raise exception 'Restricted identity denied' using errcode='42501'; end if;
 -- Native recovery may set a new password after Reactivate, while OTP sessions
 -- remain denied ordinary Platform authority until a fresh password sign-in.
 if r.status='Active' and r.role in ('portfolio_manager','billing_person')
  and exists(select 1 from auth.mfa_amr_claims where session_id=sid and authentication_method in ('otp','recovery'))
  and exists(select 1 from public.platform_config where id=1)
  and exists(select 1 from platform_private.master_identity m join auth.users master on master.id=m.auth_user_id where m.singleton
   and master.email_confirmed_at is not null and not coalesce(master.is_anonymous,false) and master.deleted_at is null and (master.banned_until is null or master.banned_until<=now())) then
  return jsonb_build_object('kind','active','auth_user_id',u.id,'email',u.email,'session_id',sid);
 end if;
 if r.status<>'Pending' then raise exception 'Restricted identity denied' using errcode='42501'; end if;
 return jsonb_build_object('kind','pending','auth_user_id',u.id,'email',u.email,'session_id',sid);
end $$;
revoke all on function public.platform_team_setup_context() from public,anon;
grant execute on function public.platform_team_setup_context() to authenticated;

create function public.platform_team_password_step(p_user uuid,p_request uuid,p_step text,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; o platform_private.team_operations%rowtype; target uuid;
begin
 select id into strict target from public.platform_users where auth_user_id=p_user;
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 select * into strict r from public.platform_users where auth_user_id=p_user for update;
 if not platform_private.session_live(p_user,p_session) or r.status<>'Pending' or not exists(select 1 from auth.users where id=p_user and lower(email)=lower(r.email) and email_confirmed_at is not null
  and deleted_at is null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now()))
  or exists(select 1 from public.platform_team_archive where auth_user_id=p_user or lower(email)=lower(r.email)) then raise exception 'Verified Pending identity required'; end if;
 select * into o from platform_private.team_operations where request_id=p_request and target_id=r.id for update;
 if p_step='begin' and o.request_id is null then
  if exists(select 1 from platform_private.team_operations where target_id=r.id and stage not in ('completed','cancelled')) then raise exception 'Invitation issuance requires reconciliation'; end if;
  insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot,expires_at)
   values(p_request,p_user,r.id,'invite_setup','password_setting',to_jsonb(r),now()+interval '30 minutes') returning * into o;
 else
  if o.request_id is null or o.action<>'invite_setup' or o.actor_id<>p_user or o.expires_at<=now() then raise exception 'Password setup not authorized or expired'; end if;
  if p_step='begin' and o.stage in ('waiting_password','password_saved') then
   if o.stage<>'password_saved' then update platform_private.team_operations set stage='password_setting',updated_at=now() where request_id=p_request returning * into o; end if;
  elsif p_step in ('saved','failed') and o.stage='password_setting' then
   update platform_private.team_operations set stage=case p_step when 'saved' then 'password_saved' else 'waiting_password' end,updated_at=now() where request_id=p_request returning * into o;
  elsif p_step='finish' and o.stage='password_saved' then
   perform set_config('platform.team_transition','trusted',true);
   update public.platform_users set status='Active',suspended_from=null where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  else raise exception 'Password step not authorized'; end if;
 end if;
 insert into public.operator_audit(actor_id,action,detail) values(p_user,'platform_team_password_'||p_step,jsonb_build_object('operation_id',p_request,'target_id',r.id));
 return jsonb_build_object('success',true,'stage',o.stage);
end $$;
revoke all on function public.platform_team_password_step(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_team_password_step(uuid,uuid,text,uuid) to service_role;
create or replace function platform_private.accept_invite() returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Complete verified password setup through the server'; end $$;
revoke all on function platform_private.accept_invite() from public,anon,authenticated,service_role;
revoke all on function public.platform_accept_invite() from public,anon,authenticated,service_role;
create function public.platform_accept_invite(p_user uuid,p_request uuid,p_session uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.platform_team_password_step(p_user,p_request,'finish',p_session)
$$;
revoke all on function public.platform_accept_invite(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_accept_invite(uuid,uuid,uuid) to service_role;

create function public.platform_team_history() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin']);
 return jsonb_build_object('operations',(select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'target_id',target_id,'action',action,'stage',stage,'expires_at',expires_at)),'[]') from platform_private.team_operations where stage not in ('completed','cancelled')));
end $$;
revoke all on function public.platform_team_history() from public,anon;
grant execute on function public.platform_team_history() to authenticated;

-- Retain UUID authority while denying drift, tombstones and stale JWTs immediately.
create or replace function platform_private.operator_role() returns text language sql stable security definer set search_path='' as $$
 select case when u.id=m.auth_user_id then 'master_admin' else
  (select role from public.platform_users where auth_user_id=u.id and status='Active'
   and lower(email)=lower(u.email)
   and (session_not_before is null or exists(select 1 from auth.mfa_amr_claims where session_id=platform_private.caller_session_id() and authentication_method='password')) and role in ('portfolio_manager','billing_person')) end
 from auth.users u cross join platform_private.master_identity m
 where u.id=auth.uid() and platform_private.session_live(u.id,platform_private.caller_session_id()) and m.singleton and exists(select 1 from public.platform_config where id=1)
  and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=now())
  and not exists(select 1 from public.platform_team_archive where auth_user_id=u.id or lower(email)=lower(u.email))
  and exists(select 1 from auth.users master where master.id=m.auth_user_id and master.email_confirmed_at is not null
   and not coalesce(master.is_anonymous,false) and master.deleted_at is null and (master.banned_until is null or master.banned_until<=now()))
$$;

-- Return only the caller's authorization result, never Auth session inventory.
create function public.platform_session_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('authorized',platform_private.operator_role() is not null,'auth_user_id',auth.uid())
$$;
revoke all on function public.platform_session_status() from public,anon;
grant execute on function public.platform_session_status() to authenticated;
create or replace function public.platform_operator_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text=platform_private.operator_role(); result jsonb;
begin
 if r is null then raise exception 'Operator not authorized' using errcode='42501'; end if;
 select jsonb_build_object('auth_user_id',u.id,'email',u.email,'role',r,'username',case when r='master_admin' then c.admin_username else t.name end,'session_id',platform_private.caller_session_id(),'password_verification_safe',r='master_admin' and platform_private.password_verification_safe(u.id))
 into result from auth.users u cross join public.platform_config c left join public.platform_users t on t.auth_user_id=u.id where u.id=auth.uid() and c.id=1;
 return result;
end $$;
revoke all on function public.platform_operator_identity() from public,anon;
grant execute on function public.platform_operator_identity() to authenticated;
-- Issuance remains service-only: Edge verifies the actual browser Master and
-- passes its canonical owned session, never browser-selected actor/server scope.
-- Exchange validates the recorded capability actor without impersonating a user.
create or replace function platform_private.support_master_identity(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb;
begin
 begin perform platform_private.team_master(p_actor); exception when insufficient_privilege then return null; end;
 if exists(select 1 from public.platform_team_archive a join auth.users u on u.id=p_actor where a.auth_user_id=u.id or lower(a.email)=lower(u.email)) then return null; end if;
 select jsonb_build_object('auth_user_id',u.id,'email',u.email,'role','master_admin') into identity
 from auth.users u where u.id=p_actor and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
 return identity;
end $$;
revoke all on function platform_private.support_master_identity(uuid) from public,anon,authenticated,service_role;

create function public.platform_support_issue(p_client integer,p_actor uuid,p_token_hash text,p_platform_project text,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype;s platform_private.shop_credentials%rowtype;b public.bridge_sources%rowtype;g platform_private.support_grants%rowtype;identity jsonb; stamp timestamptz:=clock_timestamp();
begin
 identity:=platform_private.support_master_identity(p_actor);
 if identity is null or identity->>'auth_user_id' is distinct from p_actor::text or identity->>'role' is distinct from 'master_admin'
  or not platform_private.session_live(p_actor,p_session)
  or coalesce(identity->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception 'Verified master and hashed grant required' using errcode='42501'; end if;
 if identity is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_platform_project is null or p_platform_project !~ '^[a-z]{20}$' then raise exception 'Verified master and hashed grant required' using errcode='42501';end if;
 select * into strict c from public.clients where id=p_client for update;
 select * into s from platform_private.shop_credentials where client_id=p_client;
 select * into b from public.bridge_sources where client_id=p_client;
 if c.pairing_mode<>'managed' or c.onboarding_version<>2 or c.lifecycle_state not in ('Active','Suspended') or c.infrastructure_state in ('destroyed','decommissioned')
  or s.client_id is null or s.project_ref=p_platform_project or c.supabase_url is distinct from 'https://'||s.project_ref||'.supabase.co'
  or s.bridge_call_secret_id is null or b.source_id is null or b.client_binding is distinct from s.client_binding
  or not exists(select 1 from platform_private.source_credentials where source_id=b.source_id)
  or c.shop_url is null or c.shop_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' then raise exception 'Eligible paired managed Shop required';end if;
 insert into platform_private.support_grants(token_hash,client_id,actor_id,project_ref,client_binding,source_id,issued_at,expires_at)
 values(p_token_hash,p_client,p_actor,s.project_ref,s.client_binding,b.source_id,stamp,stamp+interval '90 seconds') returning * into g;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(p_client,p_actor,'support_grant_issued',jsonb_build_object('grant_id',g.id,'expires_at',g.expires_at));
 return jsonb_build_object('shop_url',c.shop_url,'expires_at',g.expires_at);
end $$;
revoke all on function public.platform_support_issue(integer,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.platform_support_issue(integer,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_issue(integer,uuid,text,text,uuid) to service_role;

-- Defense in depth for Platform Storage and private Realtime channels. Existing
-- permissive policies still decide which authorized operators may access objects.
do $$ declare t record; original_role text=current_user; begin
 for t in select c.oid::regclass as relation,c.relowner,c.relrowsecurity from pg_class c
  where c.oid in (to_regclass('storage.objects'),to_regclass('realtime.messages')) loop
  if not t.relrowsecurity then raise exception 'Managed Storage/Realtime RLS prerequisite is missing'; end if;
  if not pg_has_role(current_user,t.relowner,'USAGE') then
   if not pg_has_role(current_user,t.relowner,'SET') then raise exception 'Managed policy owner permission required; run reviewed preflight'; end if;
   execute format('set local role %I',pg_get_userbyid(t.relowner));
  end if;
  execute format('create policy platform_live_operator on %s as restrictive for all to authenticated using (coalesce((public.platform_session_status()->>''authorized'')::boolean,false)) with check (coalesce((public.platform_session_status()->>''authorized'')::boolean,false))',t.relation);
  execute format('set local role %I',original_role);
 end loop;
end $$;
