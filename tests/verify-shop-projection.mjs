import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
if (!process.env.PLATFORM_TEST_DB?.endsWith('_check') || !process.env.SHOP_REPO) throw new Error('Set disposable PLATFORM_TEST_DB and read-only SHOP_REPO');
const source = await readFile(path.join(process.env.SHOP_REPO,'supabase/migrations/20260917174024_phase4_platform_bridge.sql'),'utf8');
const start = source.indexOf('create function public.bridge_apply_billing(');
const end = source.indexOf('grant execute on function public.bridge_apply_billing',start);
if(start<0 || end<0) throw new Error('Frozen projection function not found');
const sql = `begin;
create schema app_private;
create table app_private.bridge_config(singleton boolean primary key,source_id uuid);
insert into app_private.bridge_config values(true,'10000000-0000-4000-8000-000000009002');
create table app_private.billing_projection(singleton boolean primary key,source_id uuid,sync_version bigint,payload jsonb,last_synced_at timestamptz default clock_timestamp());
${source.slice(start,end)}
insert into public.clients(id,name,supabase_url,supabase_anon,currency,billing_policy) values(9002,'Projection fixture','https://example.invalid','public','PKR','usage-v1');
select platform_private.publish_billing(9002);
do $$ declare p jsonb; result text; begin
 select payload into p from billing_projections where client_id=9002;
 result:=public.bridge_apply_billing('10000000-0000-4000-8000-000000009002',18,p);
 assert result='applied','actual Shop accepts Platform payload';
 result:=public.bridge_apply_billing('10000000-0000-4000-8000-000000009002',17,jsonb_set(p,'{outstanding_total}','100'));
 assert result='stale','delayed older revision rejected';
 assert (select sync_version from app_private.billing_projection)=18,'new version retained';
 assert public.bridge_apply_billing('10000000-0000-4000-8000-000000009002',18,p)='unchanged','identical replay';
 begin
  perform public.bridge_apply_billing('10000000-0000-4000-8000-000000009002',18,jsonb_set(p,'{outstanding_total}','100'));
  raise exception 'equal version conflict accepted';
 exception when invalid_parameter_value then null; end;
end $$;
rollback;`;
const result=spawnSync(process.env.PSQL || 'psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',process.env.PLATFORM_TEST_DB],{input:sql,encoding:'utf8'});
if(result.status!==0) throw new Error(result.stderr);
console.log('PASS: real frozen Shop billing function accepts payload; version 18 survives delayed 17 and conflicting 18.');
