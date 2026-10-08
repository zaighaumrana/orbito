-- psql -v master_uuid=VERIFIED_EXISTING_UUID -v reason='Reviewed cutover reason'
-- Apply only to an EXISTING Platform, before the new forward migration.
\set ON_ERROR_STOP on
begin;
select set_config('platform.bootstrap_candidate', :'master_uuid', true),
 set_config('platform.bootstrap_reason', :'reason', true);
do $$ declare candidate uuid:=current_setting('platform.bootstrap_candidate')::uuid;
 previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if current_user<>'postgres' then raise exception 'Trusted postgres session required' using errcode='42501'; end if;
 if to_regclass('platform_private.master_identity') is not null then raise exception 'Already hardened: use governed bind_master instead'; end if;
 if not exists(select 1 from public.platform_config where id=1) then raise exception 'Existing staging configuration required'; end if;
 if not exists(select 1 from auth.users where id=candidate and email_confirmed_at is not null and coalesce(is_anonymous,false)=false
  and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'Confirmed enabled Auth UUID required'; end if;
 perform set_config('request.jwt.claim.sub',candidate::text,true);
 if platform_private.operator_role() is distinct from 'master_admin' then raise exception 'UUID is not the existing master' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $$;
create table if not exists platform_private.master_bootstrap_approval (
 singleton boolean primary key default true check(singleton),
 auth_user_id uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 10 and 500),
 approved_at timestamptz not null default clock_timestamp()
);
alter table platform_private.master_bootstrap_approval enable row level security;
revoke all on platform_private.master_bootstrap_approval from public,anon,authenticated,service_role;
do $$ declare existing uuid;
begin
 select auth_user_id into existing from platform_private.master_bootstrap_approval where singleton for update;
 if found and existing is distinct from current_setting('platform.bootstrap_candidate')::uuid then raise exception 'Different UUID already approved; stop for review'; end if;
 if not found then
  insert into platform_private.master_bootstrap_approval(auth_user_id,reason)
   values(current_setting('platform.bootstrap_candidate')::uuid,btrim(current_setting('platform.bootstrap_reason')));
  insert into public.operator_audit(actor_id,action,detail) values(null,'master_bootstrap_approved',
   jsonb_build_object('database_role',current_user,'approved_uuid',current_setting('platform.bootstrap_candidate')::uuid,'reason',btrim(current_setting('platform.bootstrap_reason'))));
 end if;
end $$;
commit;
