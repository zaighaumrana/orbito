-- Forward-only. See docs/PRODUCTION_BOOTSTRAP.md before fresh install or upgrade.
-- CLI 2.120.0 owns the single transactional batch, including its history INSERT.
-- No authored transaction boundary, transaction=false directive, or statement
-- requiring a pipeline flush belongs here. Run standalone SQL only in an
-- explicit enclosing transaction; tests/production-bootstrap-cli.test.mjs
-- exercises the actual CLI history-write failure and connection-loss boundary.

-- This table may be prepared by the reviewed staging-approval SQL before db push.
-- It never authorizes a browser user, and is consumed atomically by this migration.
create table if not exists platform_private.master_bootstrap_approval (
 singleton boolean primary key default true check(singleton),
 auth_user_id uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 10 and 500),
 approved_at timestamptz not null default clock_timestamp()
);
alter table platform_private.master_bootstrap_approval enable row level security;
revoke all on platform_private.master_bootstrap_approval from public,anon,authenticated,service_role;

do $$
declare candidate uuid; previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if current_user<>'postgres' then raise exception 'Apply as trusted postgres' using errcode='42501'; end if;
 if exists(select 1 from public.platform_config) or exists(select 1 from public.clients)
  or exists(select 1 from public.platform_users) then
  select auth_user_id into candidate from platform_private.master_bootstrap_approval where singleton;
  if candidate is null then raise exception 'Existing installation requires reviewed staging master approval before this migration'; end if;
  if not exists(select 1 from auth.users where id=candidate and email_confirmed_at is not null
   and coalesce(is_anonymous,false)=false and deleted_at is null and (banned_until is null or banned_until<=now())) then
   raise exception 'Approved master must be an existing confirmed, non-anonymous, enabled Auth user';
  end if;
  perform set_config('request.jwt.claim.sub',candidate::text,true);
  if platform_private.operator_role() is distinct from 'master_admin' then
   raise exception 'Approved UUID is not the current staging master; cutover refused' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 elsif exists(select 1 from platform_private.master_bootstrap_approval) then
  raise exception 'Fresh installations bind after configuration initialization, without staging approval';
 end if;
end $$;

create table platform_private.master_identity (
 singleton boolean primary key default true check(singleton),
 auth_user_id uuid not null unique references auth.users(id) on delete restrict,
 revision bigint not null default 1 check(revision>0),
 bound_at timestamptz not null default clock_timestamp(),
 bound_by_database_role text not null
);
alter table platform_private.master_identity enable row level security;
revoke all on platform_private.master_identity from public,anon,authenticated,service_role;

-- Scrub the unused legacy password, remove its default and prevent revival.
alter table public.platform_config alter column admin_password drop default;
alter table public.platform_config alter column admin_username drop default;
update public.platform_config set admin_password=null where admin_password is not null;
alter table public.platform_config add constraint platform_config_singleton check(id=1),
 add constraint platform_config_no_password check(admin_password is null);
revoke insert,delete,truncate on public.platform_config from anon,authenticated;

-- Database-session operation only; no SECURITY DEFINER escalation or public RPC.
create function platform_private.initialize_config(p_alias text,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare existing_alias text;
begin
 if current_user<>'postgres' then raise exception 'Trusted postgres session required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_alias,''))) not between 1 and 160 or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
  raise exception 'Nonempty display alias and audited reason required';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(713901,1);
 select admin_username into existing_alias from public.platform_config where id=1;
 if found then
  if existing_alias is distinct from btrim(p_alias) then raise exception 'Configuration already initialized; preserve its existing alias'; end if;
  return;
 end if;
 insert into public.platform_config(id,admin_username,admin_password) values(1,btrim(p_alias),null);
 insert into public.operator_audit(actor_id,action,detail) values(null,'platform_configuration_initialized',
  jsonb_build_object('database_role',current_user,'reason',btrim(p_reason)));
end $$;
revoke all on function platform_private.initialize_config(text,text) from public,anon,authenticated,service_role;
grant execute on function platform_private.initialize_config(text,text) to postgres;

-- Compare-and-swap rebinding. Repeating a successful target is a no-op; a new
-- target requires the exact previous UUID and a trusted database session.
create function platform_private.bind_master(p_user uuid,p_expected_previous uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare previous uuid;
begin
 if current_user<>'postgres' then raise exception 'Trusted postgres session required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Audited binding reason required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(713901,1);
 if not exists(select 1 from public.platform_config where id=1) then raise exception 'Initialize platform_config(id=1) before binding'; end if;
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null
  and coalesce(is_anonymous,false)=false and deleted_at is null and (banned_until is null or banned_until<=now()) for share;
 if not found then raise exception 'Existing confirmed, non-anonymous, enabled Auth UUID required'; end if;
 select auth_user_id into previous from platform_private.master_identity where singleton for update;
 if previous=p_user then return; end if;
 if previous is distinct from p_expected_previous then raise exception 'Master binding changed or expected previous UUID missing'; end if;
 insert into platform_private.master_identity(singleton,auth_user_id,bound_by_database_role)
 values(true,p_user,current_user)
 on conflict(singleton) do update set auth_user_id=excluded.auth_user_id,revision=platform_private.master_identity.revision+1,
  bound_at=clock_timestamp(),bound_by_database_role=current_user;
 insert into public.operator_audit(actor_id,action,detail) values(null,
  case when previous is null then 'master_identity_bound' else 'master_identity_rebound' end,
  jsonb_build_object('database_role',current_user,'previous_uuid',previous,'bound_uuid',p_user,'reason',btrim(p_reason)));
end $$;
revoke all on function platform_private.bind_master(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function platform_private.bind_master(uuid,uuid,text) to postgres;

-- One shared authority for RLS, role-checked RPCs, Edge identity and support.
-- No email match, browser config, user metadata or platform_users master row.
create or replace function platform_private.operator_role() returns text
language sql stable security definer set search_path='' as $$
 select case when u.id=m.auth_user_id then 'master_admin' else
  (select role from public.platform_users where auth_user_id=u.id and status='Active'
   and role in ('portfolio_manager','billing_person') limit 1) end
 from auth.users u cross join platform_private.master_identity m
 where u.id=auth.uid() and m.singleton and exists(select 1 from public.platform_config where id=1)
  and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
  and exists(select 1 from auth.users master where master.id=m.auth_user_id and master.email_confirmed_at is not null
   and coalesce(master.is_anonymous,false)=false and master.deleted_at is null and (master.banned_until is null or master.banned_until<=now()))
$$;
revoke all on function platform_private.operator_role() from public,anon;
grant execute on function platform_private.operator_role() to authenticated,service_role;

-- Staging continuity is part of this transaction: no intermediate master lockout.
do $$ declare approval platform_private.master_bootstrap_approval%rowtype;
begin
 select * into approval from platform_private.master_bootstrap_approval where singleton;
 if found then
  perform platform_private.bind_master(approval.auth_user_id,null,approval.reason);
  delete from platform_private.master_bootstrap_approval where singleton;
 end if;
end $$;
