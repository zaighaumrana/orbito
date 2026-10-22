begin;
alter table platform_private.support_grants add column consent_id uuid;
alter function public.platform_support_issue(integer,uuid,text,text,uuid) rename to platform_support_issue_preconsent;
alter function public.platform_support_issue_preconsent(integer,uuid,text,text,uuid) set schema platform_private;
revoke all on function platform_private.platform_support_issue_preconsent(integer,uuid,text,text,uuid) from public,anon,authenticated,service_role;
create function public.platform_support_issue(p_client integer,p_actor uuid,p_token_hash text,p_platform_project text,p_session uuid,p_consent uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_consent is null then raise exception 'Owner approval identity required' using errcode='42501';end if;
 result:=platform_private.platform_support_issue_preconsent(p_client,p_actor,p_token_hash,p_platform_project,p_session);
 update platform_private.support_grants set consent_id=p_consent where token_hash=p_token_hash;
 return result;
end $$;
revoke all on function public.platform_support_issue(integer,uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_issue(integer,uuid,text,text,uuid,uuid) to service_role;
alter function public.platform_support_consume(text,text,integer,text,text,uuid) rename to platform_support_consume_preconsent;
alter function public.platform_support_consume_preconsent(text,text,integer,text,text,uuid) set schema platform_private;
revoke all on function platform_private.platform_support_consume_preconsent(text,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
create function public.platform_support_consume(p_token_hash text,p_source_hash text,p_client integer,p_project text,p_binding text,p_source uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare consent uuid;result jsonb;
begin
 select consent_id into consent from platform_private.support_grants where token_hash=p_token_hash;
 if consent is null then return jsonb_build_object('ok',false);end if;
 result:=platform_private.platform_support_consume_preconsent(p_token_hash,p_source_hash,p_client,p_project,p_binding,p_source);
 return result||jsonb_build_object('consent_id',consent);
end $$;
revoke all on function public.platform_support_consume(text,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_support_consume(text,text,integer,text,text,uuid) to service_role;

-- Exact final package entries are inserted only after the completed backend is
-- packaged and verified. Existing job pins are never updated by catalog changes.
create table platform_private.approved_shop_releases(release_id text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'));
alter table platform_private.approved_shop_releases enable row level security;
revoke all on platform_private.approved_shop_releases from public,anon,authenticated,service_role;
insert into platform_private.approved_shop_releases values
 ('accepted-v1','7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940'),
 ('support-v2','144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414'),
 ('support-v3','f3fb64e51f1d07c536c626acd33b0e05b98b4fe5a22c3a7c3ff1a02a6a9e5bfd'),
 ('support-v4','f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f');
create or replace function public.platform_managed_release_pin(p_request uuid,p_release text,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j platform_private.provision_jobs;r platform_private.managed_release_pins;
begin
 perform 1 from public.clients where id=(select client_id from platform_private.provision_jobs where request_id=p_request) for update;
 select * into j from platform_private.provision_jobs where request_id=p_request for update;
 if j.state is distinct from 'running' or j.action<>'managed-setup' then raise exception 'Running managed job required' using errcode='42501';end if;
 select * into r from platform_private.managed_release_pins where request_id=p_request;
 if r.request_id is null then
  if exists(select 1 from platform_private.provision_stages where request_id=p_request)then p_release:='accepted-v1';p_sha256:='7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940';end if;
  if not exists(select 1 from platform_private.approved_shop_releases where release_id=p_release and sha256=p_sha256)then raise exception 'Exact approved release required';end if;
  insert into platform_private.managed_release_pins values(p_request,p_release,p_sha256,now())returning * into r;
  insert into public.operator_audit(client_id,actor_id,action,detail)values(j.client_id,j.actor_id,'managed_release_pinned',jsonb_build_object('request_id',p_request,'release',p_release,'sha256',p_sha256));
 end if;
 return jsonb_build_object('release_id',r.release_id,'sha256',r.release_sha256);
end $$;
commit;
