// Shared with Shop scripts/upgrade-contract.mjs. Pure, bounded, non-secret contracts.
export const upgradeContract='retrasell-controlled-upgrade-v1';
export const shopUpgradeQuery=`select s.platform_client_id as client_id,b.source_id,b.client_binding,
 s.onboarding_version=2 and s.onboarding_completed_at is not null and not s.suspended
 and (public.bridge_runtime_preflight()->>'owner_account')='active' as owner_ready,
 o.lease_id is not null and o.lease_until>now() as owner_busy,
 (select count(*) from app_private.config_requests where result is null) as invalid_config_receipts
 from public.shop_config s cross join app_private.bridge_config b
 left join app_private.owner_bootstrap o on o.singleton where s.id=1 and b.singleton`;
export const migrationEvidenceQuery="select version,name,encode(extensions.digest(replace(array_to_string(statements,E'\\n'),E'\\r\\n',E'\\n'),'sha256'),'hex') as sha256 from supabase_migrations.schema_migrations order by version";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))))),n=>n.toString(16).padStart(2,'0')).join('');}
export function requireShopReady(observation,target){
 const s=observation?.shop;
 if(!s||s.client_id!==target.client_id||s.source_id!==target.source_id||s.client_binding!==target.client_binding||s.owner_ready!==true||s.owner_busy!==false||Number(s.invalid_config_receipts)!==0)throw Error('Shop owner, source, binding or pending configuration requires reconciliation.');
}
export function makeUpgradePlan(source,target,sourcePolicy,targetPolicy,observation,identity){
 if(!sourcePolicy?.supported||!targetPolicy?.supported||!targetPolicy.approved_for_new||source.sha256===target.sha256)throw Error('Distinct approved supported source and fresh target required.');
 if(!sourcePolicy.compatibility||['bridge','billing','support','config'].some(k=>sourcePolicy.compatibility[k]!==targetPolicy.compatibility?.[k]))throw Error('Protocol transition requires a separate reviewed maintenance procedure.');
 requireShopReady(observation,identity);
 const history=observation.migrations;
 if(!Array.isArray(history)||history.length!==source.migrations.length||history.some((h,i)=>['version','name','sha256'].some(k=>h[k]!==source.migrations[i][k])))throw Error('Exact source migration provenance required; historical pins alone are insufficient.');
 if(source.migrations.some((m,i)=>['version','name','sha256'].some(k=>m[k]!==target.migrations[i]?.[k])))throw Error('Approved additive migration prefix required.');
 if(!Array.isArray(observation.functions)||target.functions.some(f=>!observation.functions.some(g=>g.name===f.name&&g.present===true&&g.verify_jwt===f.verify_jwt)))throw Error('Missing function or conflicting gateway requires explicit repair review.');
 const missing=target.migrations.slice(history.length),changed=target.functions.filter(f=>source.functions.find(g=>g.name===f.name)?.sha256!==f.sha256);
 return {contract:upgradeContract,...identity,source_sha256:source.sha256,target_sha256:target.sha256,source_release:sourcePolicy.release_id,target_release:targetPolicy.release_id,
  evidence_origin:observation.origin,source_fully_verified:observation.database_source_match===true&&source.functions.every(f=>observation.functions.some(g=>g.name===f.name&&g.source_sha256===f.sha256)),
  compatibility:'additive-protocol-1',maintenance_required:false,notification:'not-required-for-compatible-plan',
  steps:[...missing.map(m=>({name:'migration:'+m.version,sha256:m.sha256,type:'migration'})),...changed.map(f=>({name:'function:'+f.name,sha256:f.sha256,type:'function'}))],
  source_evidence:{migrations:history,functions:observation.functions},limitations:['Ledger provenance does not prove unchanged live SQL definitions.','Provider presence/revision is not independent deployed-source verification.','No owner, secrets, pairing, original provisioning pin or application data is replaced.']};
}
export function verifyUpgradeResult(target,observation,identity){
 requireShopReady(observation,identity);
 if(observation.migrations?.length!==target.migrations.length||target.migrations.some((m,i)=>['version','name','sha256'].some(k=>observation.migrations[i]?.[k]!==m[k])))throw Error('Final migration provenance incomplete.');
 if(target.functions.some(f=>!observation.functions?.some(g=>g.name===f.name&&g.present===true&&g.verify_jwt===f.verify_jwt)))throw Error('Final function/gateway evidence incomplete.');
 if(observation.runtime_ready!==true)throw Error('Final runtime readiness is not established.');
 return {components_verified:true,runtime_ready:true,full_source_verified:observation.database_source_match===true&&target.functions.every(f=>observation.functions.some(g=>g.name===f.name&&g.source_sha256===f.sha256)),origin:observation.origin,limitations:['Runtime and provenance checks are separate from full deployed-source comparison.']};
}
export function requireUpgradeProgress(target,plan,history,steps={}){
 const expected=plan.source_evidence.migrations.length+plan.steps.filter(s=>s.type==='migration'&&steps[s.name]?.state==='passed').length;
 if(!Array.isArray(history)||history.length!==expected||history.some((m,i)=>['version','name','sha256'].some(k=>m[k]!==target.migrations[i]?.[k])))throw Error('Current SQL provenance differs from the original reviewed checkpoints; reconcile before another write.');
}
