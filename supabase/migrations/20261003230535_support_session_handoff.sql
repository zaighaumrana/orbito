begin;
create table platform_private.support_grants (
 id uuid primary key default gen_random_uuid(),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 client_id integer not null references public.clients(id),actor_id uuid not null,
 project_ref text not null,client_binding text not null,source_id uuid not null,
 issued_at timestamptz not null,expires_at timestamptz not null,consumed_at timestamptz,
 check(expires_at=issued_at+interval '90 seconds')
);
create index support_grants_expiry on platform_private.support_grants(expires_at);
alter table platform_private.support_grants enable row level security;
revoke all on platform_private.support_grants from public,anon,authenticated,service_role;

-- Resolve the actor through the existing canonical RBAC function. Restore the
-- calling JWT claim before returning; only service-only RPCs use this helper.
create function platform_private.support_master_identity(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('request.jwt.claim.sub',true); identity jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 begin identity:=public.platform_operator_identity();exception when others then identity:=null;end;
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 if identity->>'auth_user_id' is distinct from p_actor::text or identity->>'role' is distinct from 'master_admin'
  or coalesce(identity->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return null;end if;
 return identity;
end $$;
revoke all on function platform_private.support_master_identity(uuid) from public,anon,authenticated,service_role;

create function public.platform_support_issue(p_client integer,p_actor uuid,p_token_hash text,p_platform_project text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype;s platform_private.shop_credentials%rowtype;b public.bridge_sources%rowtype;g platform_private.support_grants%rowtype;identity jsonb; stamp timestamptz:=clock_timestamp();
begin
 identity:=platform_private.support_master_identity(p_actor);
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
revoke all on function public.platform_support_issue(integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_support_issue(integer,uuid,text,text) to service_role;

create function public.platform_support_consume(p_token_hash text,p_source_hash text,p_client integer,p_project text,p_binding text,p_source uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.bridge_sources%rowtype;c public.clients%rowtype;s platform_private.shop_credentials%rowtype;g platform_private.support_grants%rowtype;identity jsonb;reason text;
begin
 select bs.* into b from public.bridge_sources bs join platform_private.source_credentials sc using(source_id) where sc.secret_sha256=p_source_hash;
 if not found then return jsonb_build_object('ok',false);end if;
 -- Same lock order as lifecycle operations; one concurrent exchange wins.
 select * into strict c from public.clients where id=b.client_id for update;
 select * into s from platform_private.shop_credentials where client_id=c.id;
 select * into g from platform_private.support_grants where token_hash=p_token_hash for update;
 if not found then reason:='unknown';
 elsif g.consumed_at is not null then reason:='replayed';
 elsif g.expires_at<=clock_timestamp() then reason:='expired';
 elsif g.client_id is distinct from p_client or c.id is distinct from p_client or g.project_ref is distinct from p_project or s.project_ref is distinct from p_project
  or c.supabase_url is distinct from 'https://'||p_project||'.supabase.co' or g.client_binding is distinct from p_binding or s.client_binding is distinct from p_binding
  or b.client_binding is distinct from p_binding or g.source_id is distinct from p_source or b.source_id is distinct from p_source then reason:='binding_mismatch';
 elsif c.pairing_mode is distinct from 'managed' or c.onboarding_version is distinct from 2 or s.bridge_call_secret_id is null
  or c.lifecycle_state not in ('Active','Suspended') or c.infrastructure_state in ('destroyed','decommissioned') then reason:='retired';
 else identity:=platform_private.support_master_identity(g.actor_id);if identity is null then reason:='actor_revoked';end if;
 end if;
 if reason is not null then
  insert into public.operator_audit(client_id,actor_id,action,detail) values(c.id,g.actor_id,'support_grant_failed',jsonb_build_object('grant_id',g.id,'reason',reason));
  return jsonb_build_object('ok',false);
 end if;
 update platform_private.support_grants set consumed_at=clock_timestamp() where id=g.id and consumed_at is null;
 insert into public.operator_audit(client_id,actor_id,action,detail) values(c.id,g.actor_id,'support_grant_consumed',jsonb_build_object('grant_id',g.id));
 return jsonb_build_object('ok',true,'contract','orbito-support-handoff-v1','platform_user_id',g.actor_id,'platform_email',identity->>'email','client_id',g.client_id,'project_ref',g.project_ref,'client_binding',g.client_binding,'source_id',g.source_id);
end $$;
revoke all on function public.platform_support_consume(text,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_consume(text,text,integer,text,text,uuid) to service_role;
commit;
