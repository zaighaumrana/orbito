-- Owner-approved immutable release promotion; no customer pin/job/audit writes.
begin;
lock table platform_private.approved_shop_releases in share row exclusive mode;
do $$
begin
 if exists (
  select 1 from (values
   ('accepted-v1','7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940'),
   ('support-v2','144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414'),
   ('support-v3','f3fb64e51f1d07c536c626acd33b0e05b98b4fe5a22c3a7c3ff1a02a6a9e5bfd'),
   ('support-v4','f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f'),
   ('support-v5','7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd'),
   ('support-v6','64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31')
  ) expected(release_id,sha256)
  left join platform_private.approved_shop_releases actual using(release_id)
  where actual.sha256 is distinct from expected.sha256
 ) then raise exception 'Historical release catalog missing or fingerprint conflict; reconcile before promotion';end if;
 if exists(select 1 from platform_private.approved_shop_releases where release_id='support-v7'
  and sha256<>'c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada')
 then raise exception 'Immutable support-v7 fingerprint conflict';end if;
 if exists(select 1 from platform_private.approved_shop_releases where approved_for_new and release_id not in ('support-v6','support-v7'))
 then raise exception 'Unexpected fresh-approved release; do not silently supersede another promotion';end if;
 if not exists(select 1 from platform_private.approved_shop_releases where release_id='support-v6' and supported)
  or exists(select 1 from platform_private.approved_shop_releases where release_id='support-v5' and supported)
 then raise exception 'Historical support policy conflict';end if;
end $$;

insert into platform_private.approved_shop_releases
 (release_id,sha256,supported,approved_for_new,successor,upgrade_policy,compatibility)
values ('support-v7','c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada',
 true,false,null,'optional','{"bridge":1,"billing":1,"support":1,"config":1}')
on conflict(release_id) do nothing;

update platform_private.approved_shop_releases set approved_for_new=false,successor='support-v7'
where release_id in ('accepted-v1','support-v2','support-v3','support-v4','support-v5','support-v6');
update platform_private.approved_shop_releases
set supported=true,approved_for_new=true,successor=null,upgrade_policy='optional',
 compatibility='{"bridge":1,"billing":1,"support":1,"config":1}'
where release_id='support-v7' and sha256='c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada';

do $$
begin
 if (select count(*) from platform_private.approved_shop_releases where approved_for_new)<>1
 or not exists(select 1 from platform_private.approved_shop_releases where release_id='support-v7' and supported and approved_for_new)
 then raise exception 'Single fresh-approved support-v7 invariant failed';end if;
end $$;
commit;
