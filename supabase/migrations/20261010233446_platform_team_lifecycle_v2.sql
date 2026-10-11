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
 stage text not null check(stage in ('reserved','waiting_password','password_setting','password_saved','auth_delete_dispatched','review_required','completed','cancelled')),
 snapshot jsonb not null, requested jsonb not null default '{}', proof_digest text,
 expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index team_one_open_operation on platform_private.team_operations(target_id) where stage not in ('completed','cancelled');
alter table platform_private.team_operations enable row level security;
revoke all on platform_private.team_operations from public,anon,authenticated,service_role;

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
create function public.platform_team_command(p_actor uuid,p_request uuid,p_action text,p_target uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; o platform_private.team_operations%rowtype; u auth.users%rowtype;
 a text; result jsonb; desired text; fresh boolean=false; had_setup boolean=false;
begin
 perform platform_private.team_master(p_actor);
 if p_request is null or p_target is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object'
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','email','role','auth_user_id','proof_digest','reason'))
 then raise exception 'Invalid command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,0));
 select * into o from platform_private.team_operations where request_id=p_request for update;
 if found and (o.actor_id<>p_actor or o.target_id<>p_target) then raise exception 'Conflicting operation identity'; end if;
 perform set_config('platform.team_transition','trusted',true);
 if p_action='begin_create' then
  if o.request_id is not null then
   if o.action<>'create' or o.requested<>p_data then raise exception 'Conflicting retry'; end if;
   return (to_jsonb(o)-'proof_digest')||jsonb_build_object('new_operation',false);
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
   if o.action='delete' and o.stage='completed' and p_action in ('begin_delete','finish_delete','reconcile_delete') then return (to_jsonb(o)-'proof_digest')||jsonb_build_object('new_operation',false); end if;
   raise exception 'Unique live team account required';
  end if;
  if r.auth_user_id=p_actor or lower(r.email)=(select lower(email) from auth.users where id=p_actor) or r.role not in ('portfolio_manager','billing_person') then raise exception 'Master account is protected'; end if;
  select * into u from auth.users where id=r.auth_user_id;
  if p_action not in ('begin_delete','dispatch_delete','finish_delete','reconcile_delete','mark_review') and
   p_action<>'finish_create' and (u.id is null or u.deleted_at is not null or coalesce(u.is_anonymous,false)
    or (p_action<>'finish_edit' and lower(u.email)<>lower(r.email)) or (u.banned_until is not null and u.banned_until>now()))
  then raise exception 'Linked Auth identity unavailable or blocked; operator review required'; end if;
  if p_action in ('deactivate','begin_reactivate','begin_edit','begin_delete') then
   a=case p_action when 'begin_reactivate' then 'reactivate' when 'begin_edit' then 'edit' when 'begin_delete' then 'delete' else 'deactivate' end;
   if o.request_id is not null then
    if o.action<>a then raise exception 'Conflicting retry'; end if;
    if a='edit' and o.requested<>p_data then raise exception 'Conflicting payload'; end if;
    return (to_jsonb(o)-'proof_digest')||jsonb_build_object('new_operation',false);
   end if;
   -- Deactivation/delete revoke outstanding setup approvals; other conflicts fail closed.
   if a in ('deactivate','delete') then
    select exists(select 1 from platform_private.team_operations where target_id=r.id and action in ('reactivate','invite_setup') and stage not in ('completed','cancelled')) into had_setup;
    update platform_private.team_operations set stage='cancelled',proof_digest=null,updated_at=now()
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
    if to_regclass('storage.objects') is null then raise exception 'Storage inventory unavailable; deletion is blocked'; end if;
    if exists(select 1 from storage.objects s where to_jsonb(s)->>'owner'=r.auth_user_id::text or to_jsonb(s)->>'owner_id'=r.auth_user_id::text)
    then raise exception 'Storage ownership requires reviewed transfer before deletion'; end if;
    if exists(select 1 from pg_constraint where contype='f' and confrelid='public.platform_users'::regclass)
    then raise exception 'New team references require a retention review'; end if;
   end if;
   insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot,requested,expires_at)
    values(p_request,p_actor,r.id,a,case when a='deactivate' then 'completed' else 'reserved' end,to_jsonb(r),p_data,
     case when a='reactivate' then now()+interval '30 minutes' end) returning * into o;
   fresh=true;
   if a in ('deactivate','delete') then
    update public.platform_users set suspended_from=case when a='deactivate' then case when r.status='Inactive' then r.suspended_from else r.status end else null end,status='Inactive' where id=r.id;
   end if;
  elsif p_action='finish_create' then
   if o.request_id is null or o.action<>'create' or o.stage<>'reserved' or r.auth_user_id is not null then raise exception 'Invitation completion not allowed'; end if;
   select * into strict u from auth.users where id=(p_data->>'auth_user_id')::uuid;
   if u.id=p_actor or u.deleted_at is not null or lower(u.email)<>lower(r.email) then raise exception 'Invitation identity mismatch'; end if;
   update public.platform_users set auth_user_id=u.id where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='issue_recovery' then
   if o.request_id is null or o.action<>'reactivate' or o.stage<>'reserved' or o.expires_at<=now() or r.status<>'Inactive'
    or coalesce(p_data->>'proof_digest','') !~ '^[a-f0-9]{64}$' then raise exception 'Recovery issue not allowed'; end if;
   update platform_private.team_operations set stage='waiting_password',proof_digest=p_data->>'proof_digest',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='finish_edit' then
   if o.request_id is null or o.action<>'edit' or o.stage<>'reserved' or r.status<>'Active' then raise exception 'Edit completion not allowed'; end if;
   desired=coalesce(o.requested->>'email',r.email);
   if lower(u.email)<>lower(desired) then raise exception 'Auth email update not verified'; end if;
   update public.platform_users set name=coalesce(o.requested->>'name',name),email=desired,role=coalesce(o.requested->>'role',role) where id=r.id;
   update platform_private.team_operations set stage='completed',updated_at=now() where request_id=p_request returning * into o;
  elsif p_action='dispatch_delete' then
   if o.request_id is null or o.action<>'delete' or o.stage<>'reserved' or r.status<>'Inactive' then raise exception 'Deletion dispatch not allowed'; end if;
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
 return (to_jsonb(o)-'proof_digest')||jsonb_build_object('new_operation',fresh);
end $$;
revoke all on function public.platform_team_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_team_command(uuid,uuid,text,uuid,jsonb) to service_role;

create function public.platform_team_setup_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; u auth.users%rowtype;
begin
 select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false)
  and (banned_until is null or banned_until<=now());
 if u.id is null then raise exception 'Verified Auth identity required'; end if;
 if exists(select 1 from public.platform_team_archive where auth_user_id=u.id or lower(email)=lower(u.email)) then raise exception 'Archived identity denied'; end if;
 if platform_private.operator_role()='master_admin' then return jsonb_build_object('kind','active','auth_user_id',u.id,'email',u.email); end if;
 select * into strict r from public.platform_users where auth_user_id=u.id;
 if lower(r.email)<>lower(u.email) then raise exception 'Identity drift'; end if;
 return jsonb_build_object('kind',lower(r.status),'auth_user_id',u.id,'email',u.email,
  'reactivation_pending',exists(select 1 from platform_private.team_operations where target_id=r.id and action='reactivate' and stage in ('waiting_password','password_setting','password_saved') and expires_at>now()));
end $$;
revoke all on function public.platform_team_setup_context() from public,anon;
grant execute on function public.platform_team_setup_context() to authenticated;

create function public.platform_team_password_step(p_user uuid,p_request uuid,p_step text,p_digest text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.platform_users%rowtype; o platform_private.team_operations%rowtype; target uuid;
begin
 select id into strict target from public.platform_users where auth_user_id=p_user;
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 select * into strict r from public.platform_users where auth_user_id=p_user for update;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(r.email) and email_confirmed_at is not null
  and deleted_at is null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now()))
  or exists(select 1 from public.platform_team_archive where auth_user_id=p_user or lower(email)=lower(r.email)) then raise exception 'Verified live identity required'; end if;
 select * into o from platform_private.team_operations where request_id=p_request and target_id=r.id for update;
 if p_step='begin' then
  if r.status='Pending' and o.request_id is null then
   if exists(select 1 from platform_private.team_operations where target_id=r.id and stage not in ('completed','cancelled')) then raise exception 'Invitation is still being issued or needs reconciliation'; end if;
   insert into platform_private.team_operations(request_id,actor_id,target_id,action,stage,snapshot,expires_at)
    values(p_request,p_user,r.id,'invite_setup','password_setting',to_jsonb(r),now()+interval '30 minutes') returning * into o;
  elsif o.target_id=r.id and o.stage in ('waiting_password','password_saved') and o.expires_at>now()
   and ((o.action='reactivate' and r.status='Inactive' and o.proof_digest=p_digest and p_digest is not null)
    or (o.action='invite_setup' and r.status='Pending' and o.actor_id=p_user)) then
   if o.stage<>'password_saved' then update platform_private.team_operations set stage='password_setting',updated_at=now() where request_id=p_request returning * into o; end if;
  else raise exception 'Password setup is not authorized or has expired'; end if;
 elsif p_step in ('saved','failed') then
  if o.request_id is null or o.target_id<>r.id or o.stage<>'password_setting' or o.expires_at<=now()
   or not ((o.action='invite_setup' and r.status='Pending' and o.actor_id=p_user)
    or (o.action='reactivate' and r.status='Inactive' and o.proof_digest=p_digest and p_digest is not null))
  then raise exception 'Password outcome is not authorized'; end if;
  update platform_private.team_operations set stage=case p_step when 'saved' then 'password_saved' else 'waiting_password' end,updated_at=now() where request_id=p_request returning * into o;
 elsif p_step='finish' then
  if o.target_id<>r.id or o.stage<>'password_saved' or o.expires_at<=now()
   or not ((o.action='invite_setup' and r.status='Pending' and o.actor_id=p_user)
    or (o.action='reactivate' and r.status='Inactive' and o.proof_digest=p_digest and p_digest is not null))
   or o.request_id is null then raise exception 'Password completion is not authorized'; end if;
  perform set_config('platform.team_transition','trusted',true);
  -- A formerly Pending account completes onboarding through this same verified password step.
  update public.platform_users set status='Active',suspended_from=null where id=r.id;
  update platform_private.team_operations set stage='completed',proof_digest=null,updated_at=now() where request_id=p_request returning * into o;
 else raise exception 'Unsupported password step'; end if;
 insert into public.operator_audit(actor_id,action,detail) values(p_user,'platform_team_password_'||p_step,jsonb_build_object('operation_id',p_request,'target_id',r.id));
 return jsonb_build_object('success',true,'stage',o.stage);
end $$;
revoke all on function public.platform_team_password_step(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_team_password_step(uuid,uuid,text,text) to service_role;
-- Close the historical JWT-only activation bypass. The server checks password update first.
create or replace function platform_private.accept_invite() returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Complete verified password setup through the server'; end $$;
revoke all on function platform_private.accept_invite() from public,anon,authenticated,service_role;
revoke all on function public.platform_accept_invite() from public,anon,authenticated,service_role;
create function public.platform_accept_invite(p_user uuid,p_request uuid,p_digest text default null) returns jsonb language sql security definer set search_path='' as $$
 select public.platform_team_password_step(p_user,p_request,'finish',p_digest)
$$;
revoke all on function public.platform_accept_invite(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_accept_invite(uuid,uuid,text) to service_role;

create function public.platform_team_history() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform platform_private.require_role(array['master_admin']);
 return jsonb_build_object('operations',(select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'target_id',target_id,'action',action,'stage',stage,'expires_at',expires_at)),'[]') from platform_private.team_operations where stage not in ('completed','cancelled')));
end $$;
revoke all on function public.platform_team_history() from public,anon;
grant execute on function public.platform_team_history() to authenticated;

-- Trusted hook/gateway lookup; not a public email-enumeration RPC.
create function public.platform_team_email_context(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users%rowtype; r public.platform_users%rowtype;
begin
 if exists(select 1 from public.platform_team_archive where lower(email)=lower(trim(p_email))) then return jsonb_build_object('kind','archived'); end if;
 select * into u from auth.users where lower(email)=lower(trim(p_email)) and deleted_at is null;
 if u.id is null or coalesce(u.is_anonymous,false) or (u.banned_until is not null and u.banned_until>now()) then return jsonb_build_object('kind','unknown'); end if;
 if exists(select 1 from platform_private.master_identity where auth_user_id=u.id) and u.email_confirmed_at is not null then return jsonb_build_object('kind','active','auth_user_id',u.id,'email',u.email); end if;
 select * into r from public.platform_users where auth_user_id=u.id and lower(email)=lower(u.email);
 return jsonb_build_object('kind',coalesce(lower(r.status),'unknown'),'auth_user_id',u.id,'email',u.email);
end $$;
revoke all on function public.platform_team_email_context(text) from public,anon,authenticated;
grant execute on function public.platform_team_email_context(text) to service_role;

create table platform_private.team_recovery_rate(key_digest text primary key,window_start timestamptz not null,attempts integer not null);
alter table platform_private.team_recovery_rate enable row level security;
revoke all on platform_private.team_recovery_rate from public,anon,authenticated,service_role;
create function public.platform_team_recovery_limit(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid rate key'; end if;
 insert into platform_private.team_recovery_rate values(p_key,now(),1) on conflict(key_digest) do update
  set window_start=case when team_recovery_rate.window_start<now()-interval '15 minutes' then now() else team_recovery_rate.window_start end,
  attempts=case when team_recovery_rate.window_start<now()-interval '15 minutes' then 1 else team_recovery_rate.attempts+1 end returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.platform_team_recovery_limit(text) from public,anon,authenticated;
grant execute on function public.platform_team_recovery_limit(text) to service_role;

create function public.platform_team_recovery_audit(p_request uuid,p_outcome text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_request is null or p_outcome not in ('issued','failed','cancelled') then raise exception 'Invalid recovery outcome'; end if;
 insert into public.operator_audit(actor_id,action,detail) values(null,'platform_recovery_'||p_outcome,jsonb_build_object('request_id',p_request));
 return true;
end $$;
revoke all on function public.platform_team_recovery_audit(uuid,text) from public,anon,authenticated;
grant execute on function public.platform_team_recovery_audit(uuid,text) to service_role;

-- Retain UUID authority while denying drift, tombstones and stale JWTs immediately.
create or replace function platform_private.operator_role() returns text language sql stable security definer set search_path='' as $$
 select case when u.id=m.auth_user_id then 'master_admin' else
  (select role from public.platform_users where auth_user_id=u.id and status='Active'
   and lower(email)=lower(u.email) and role in ('portfolio_manager','billing_person')) end
 from auth.users u cross join platform_private.master_identity m
 where u.id=auth.uid() and m.singleton and exists(select 1 from public.platform_config where id=1)
  and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=now())
  and not exists(select 1 from public.platform_team_archive where auth_user_id=u.id or lower(email)=lower(u.email))
  and exists(select 1 from auth.users master where master.id=m.auth_user_id and master.email_confirmed_at is not null
   and not coalesce(master.is_anonymous,false) and master.deleted_at is null and (master.banned_until is null or master.banned_until<=now()))
$$;
