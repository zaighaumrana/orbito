-- Platform control-plane approval only; the immutable Shop package stays 40/7/10.
-- No customer migration, release pin, upgrade operation, journal or audit is changed.
begin;
set local lock_timeout='5s';
lock table platform_private.approved_shop_releases in share row exclusive mode;

do $$
declare active_release text;
begin
 if exists (
  select 1 from (values
  ('accepted-v1','7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940',true,false,'support-v7','optional','{"bridge":1,"billing":1,"support":0,"config":1}'::jsonb),
  ('support-v2','144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414',true,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v3','f3fb64e51f1d07c536c626acd33b0e05b98b4fe5a22c3a7c3ff1a02a6a9e5bfd',true,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v4','f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f',true,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v5','7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd',false,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v6','64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31',true,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v7','c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada',true,true,null,'optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb)
  ) expected(release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility)
  left join platform_private.approved_shop_releases actual using(release_id)
  where actual.sha256 is distinct from expected.sha256
   or actual.supported is distinct from expected.supported
   or actual.upgrade_policy is distinct from expected.upgrade_policy
   or actual.compatibility is distinct from expected.compatibility
 ) then raise exception 'Historical release fingerprint or support policy conflict; reconcile before promotion';end if;
 if exists(select 1 from platform_private.approved_shop_releases
  where release_id not in ('accepted-v1','support-v2','support-v3','support-v4','support-v5','support-v6','support-v7','support-v8'))
 then raise exception 'Unexpected release catalog entry; do not supersede another promotion';end if;
 if (select count(*) from platform_private.approved_shop_releases where approved_for_new)<>1
 then raise exception 'Exactly one existing fresh-approved release required';end if;
 select release_id into active_release from platform_private.approved_shop_releases where approved_for_new;
 if active_release not in ('support-v7','support-v8')
 then raise exception 'Unexpected active release; do not silently supersede another promotion';end if;
 if exists(select 1 from platform_private.approved_shop_releases where release_id='support-v8'
  and (sha256<>'af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4' or not supported or not approved_for_new or successor is not null
   or upgrade_policy<>'optional' or compatibility<>'{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb))
 then raise exception 'Existing support-v8 fingerprint or approval conflict';end if;
 if exists(select 1 from platform_private.approved_shop_releases where release_id<>'support-v8'
  and (approved_for_new is distinct from (release_id=active_release)
   or successor is distinct from case when release_id=active_release then null
    when supported then active_release else 'support-v7' end))
 then raise exception 'Historical successor or fresh-selection conflict';end if;
end $$;

insert into platform_private.approved_shop_releases
 (release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility)
values ('support-v8','af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4',true,false,null,'optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb)
on conflict(release_id) do nothing;

-- Existing supported installations receive an optional successor, never an upgrade.
-- Unsupported historical releases retain their existing policy and successor.
update platform_private.approved_shop_releases
set approved_for_new=false,successor='support-v8'
where supported and release_id<>'support-v8';
update platform_private.approved_shop_releases
set approved_for_new=true
where release_id='support-v8' and sha256='af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4';

do $$
begin
 if exists (
  select 1 from (values
  ('accepted-v1','7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":0,"config":1}'::jsonb),
  ('support-v2','144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v3','f3fb64e51f1d07c536c626acd33b0e05b98b4fe5a22c3a7c3ff1a02a6a9e5bfd',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v4','f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v5','7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd',false,false,'support-v7','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v6','64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v7','c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada',true,false,'support-v8','optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb),
  ('support-v8','af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4',true,true,null,'optional','{"bridge":1,"billing":1,"support":1,"config":1}'::jsonb)
  ) expected(release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility)
  full join platform_private.approved_shop_releases actual using(release_id)
  where expected.release_id is null or actual.release_id is null
   or actual.sha256 is distinct from expected.sha256
   or actual.supported is distinct from expected.supported
   or actual.approved_for_new is distinct from expected.approved_for_new
   or actual.successor is distinct from expected.successor
   or actual.upgrade_policy is distinct from expected.upgrade_policy
   or actual.compatibility is distinct from expected.compatibility
 ) or (select count(*) from platform_private.approved_shop_releases where approved_for_new)<>1
 then raise exception 'Final approved release catalog invariant failed';end if;
end $$;
commit;
