// Classification is independent of operational access/lifecycle. No mutation here.
export function assessBackend(catalog:any[],packages:Record<string,any>,observation:any){
 const missing:string[]=[],limitations:string[]=[];
 const approved=catalog.find(x=>x.approved_for_new),target=approved&&packages[approved.release_id];
 let migrationRelease:any=null,conflict=observation.database_verification?.status==='drift'||observation.functions?.some((f:any)=>f.source_status==='drift');
 if(conflict)missing.push('independent-source-comparison');
 const history=observation.migrations;
 if(Array.isArray(history)){
  const matches=catalog.filter(c=>{const r=packages[c.release_id];return r&&history.length===r.migrations.length&&history.every((m:any,i:number)=>m.version===r.migrations[i].version&&m.name===r.migrations[i].name&&m.sha256===r.migrations[i].sha256)});
  const exactSources=matches.filter(c=>observation.database_source_match===true&&packages[c.release_id].functions.every((f:any)=>observation.functions?.some((v:any)=>v.name===f.name&&v.present===true&&v.verify_jwt===f.verify_jwt&&v.source_sha256===f.sha256)));
  if(matches.length===1)migrationRelease=matches[0];else if(exactSources.length===1)migrationRelease=exactSources[0];else if(matches.length>1)limitations.push('Migration history matches multiple release packages; deployed source evidence is required');
  else if(matches.length===0&&target&&history.some((m:any,i:number)=>!target.migrations[i]||m.version!==target.migrations[i].version||m.name!==target.migrations[i].name||m.sha256!==target.migrations[i].sha256)){conflict=true;missing.push('migration-provenance-conflict');}
  else limitations.push('migration history is incomplete; no installed release inferred');
 }else limitations.push('migration provenance unavailable');
 const base=migrationRelease&&packages[migrationRelease.release_id],functions=observation.functions;
 let exact=Boolean(base)&&observation.database_source_match===true;if(observation.database_source_match!==true)limitations.push('Current database routine/policy definitions have not been fully compared with the release');
 if(base)for(const f of base.functions){
  const observed=functions?.find((v:any)=>v.name===f.name);
  if(!observed){exact=false;limitations.push('function evidence unavailable: '+f.name);continue;}
  if(observed.present===false||typeof observed.verify_jwt==='boolean'&&observed.verify_jwt!==f.verify_jwt){conflict=true;missing.push('function/gateway: '+f.name);exact=false;}
  if(typeof observed.verify_jwt!=='boolean'){exact=false;limitations.push('gateway setting unavailable: '+f.name);}
  // Provider EZBR hashes are not source-package hashes; presence/version is partial evidence.
  if(observed.source_sha256!==f.sha256){exact=false;limitations.push('deployed source not independently verified: '+f.name);}
 }
 if(!base)exact=false;
 for(const [name,value]of Object.entries(observation.capabilities||{}))if(value===false&&(!['bounded-operational-reads','catalog-icons-and-brands'].includes(name)||base?.requirements?.requirements.some((r:any)=>r.id===name))){missing.push(name);exact=false;if(base?.requirements?.requirements.some((r:any)=>r.id===name))conflict=true;}
 if(!observation.capabilities){exact=false;limitations.push('restricted database capability probe unavailable');}
 if(base?.requirements&&base.requirements.requirements.some((r:any)=>r.id!=='core-runtime'&&!(r.id in (observation.capabilities||{})))){exact=false;limitations.push('required capability evidence incomplete');}
 const verified=exact&&!conflict?{release_id:migrationRelease.release_id,sha256:migrationRelease.sha256}:null;
 const upgrade=migrationRelease&&approved&&migrationRelease.release_id!==approved.release_id?{available:true,release_id:approved.release_id,policy:migrationRelease.upgrade_policy==='required'?'required':'optional',basis:'verified migration history; full source verification is separate'}:{available:false};
 const runtime=observation.runtime,values=Object.values(runtime||{});
 const runtime_health=observation.unreachable?'unknown':runtime?.database_reachable===false?'unhealthy':values.some(v=>v===false)?'degraded':values.length&&values.every(v=>v===true)&&runtime.database_reachable===true&&runtime.edge_functions===true&&runtime.authentication===true?'healthy':'unknown';
 return {compliance:conflict?'drift':!verified?'unable_to_verify':upgrade.available?(upgrade.policy==='required'?'upgrade_required':'upgrade_available'):'up_to_date',runtime_health,verified_release:verified,observed_migration_release:migrationRelease?{release_id:migrationRelease.release_id,sha256:migrationRelease.sha256}:null,evidence:{origin:observation.origin||'unavailable',strength:verified?'exact-source-and-capabilities':'partial',functions:functions||[],capabilities:observation.capabilities||{},...(observation.source_comparison_release?{source_comparison_release:observation.source_comparison_release}:{}),...(observation.database_verification?{database_verification:observation.database_verification}:{})},missing,limitations:[...new Set(limitations.concat(observation.limitations||[]))],upgrade,compatibility:migrationRelease?.compatibility||null};
}
