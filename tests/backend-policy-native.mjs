import assert from 'node:assert/strict';
import {replayApprovedPolicies} from '../scripts/derive-backend-policy-baselines.mjs';
import {compareDatabaseSource,securityCatalogQuery} from '../supabase/functions/_shared/backend-source-verification.ts';

const evidenceIdentity={client_id:9002,source_id:'99100000-0000-4000-8000-000000000002',client_binding:'fixture-only-9002'};
const replay=await replayApprovedPolicies({write:false,onReady:async({sql,packages})=>{
 const release=packages['support-v10'];
 const compare=async()=>{
  const rows=JSON.parse(await sql(securityCatalogQuery(release.requirements.runtime.database.tables)));
  return compareDatabaseSource(release,{identity:evidenceIdentity,routines:[],security:rows},evidenceIdentity);
 };
 const clean=await compare();assert.notEqual(clean.status,'drift');assert.deepEqual(clean.mismatched,[],'real PostgreSQL 17 release baseline must match');
 await sql('grant select on public.device_brands to anon');
 assert.equal((await compare()).status,'drift','real anonymous GRANT must be detected');
 await sql('revoke select on public.device_brands from anon; alter table public.device_brands disable row level security');
 assert.equal((await compare()).status,'drift','real RLS disablement must be detected');
 await sql('alter table public.device_brands enable row level security; drop policy support_consent_guard on public.device_brands');
 assert.equal((await compare()).status,'drift','removing the restrictive Support-consent policy must be detected');
}});
console.log(JSON.stringify({result:replay.result,postgres:replay.server_version,release_count:replay.releases.length,baseline_sha256:replay.baseline_sha256,real_catalog_mutations:['anon SELECT grant','RLS disabled','restrictive Support-consent policy removed'],cleanup:replay.cleaned},null,2));
