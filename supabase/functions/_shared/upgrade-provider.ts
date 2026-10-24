import {shopUpgradeQuery,migrationEvidenceQuery} from './upgrade-contract.js';
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export function migrationUpgradeSql(m:any){return `begin;set local statement_timeout='25s';select pg_advisory_xact_lock(71390461);do $upgrade$ begin if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)}) then if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)} and name=${literal(m.name)} and encode(extensions.digest(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n'),'sha256'),'hex')=${literal(m.sha256)}) then raise exception 'Original migration source conflict';end if;else execute ${literal(m.sql.replace(/^\s*(begin|commit);\s*$/gmi,''))};insert into supabase_migrations.schema_migrations(version,name,statements)values(${literal(m.version)},${literal(m.name)},array[${literal(m.sql)}]);end if;end $upgrade$;commit;`;}
export function managedUpgradeProvider(ref:string,token:string,transport:typeof fetch=fetch){
 if(!/^[a-z]{20}$/.test(ref)||!token)throw Error('Fixed authorized Shop provider required.');
 const api=async(path:string,body?:any)=>{
  const r=await transport(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  if(!r.ok){await r.body?.cancel();throw Error('Provider request unavailable.');}
  const t=await r.text();if(t.length>2e6)throw Error('Provider evidence exceeds budget.');return t?JSON.parse(t):null;
 };
 const query=(q:string)=>api('/database/query',{query:q});
 return {query,async observe(){
  const project=await api('');if(project.id!==ref)throw Error('Provider target changed.');
  const [rows,migrations,fns,runtimeRows]=await Promise.all([query(shopUpgradeQuery),query(migrationEvidenceQuery),api('/functions'),query('select public.bridge_runtime_preflight() as runtime')]);const shop=rows?.[0];
  if(!Array.isArray(migrations)||migrations.length>500||!Array.isArray(fns)||fns.length>100)throw Error('Bounded provider evidence required.');
  const runtime=runtimeRows?.[0]?.runtime;
  return {shop,migrations,functions:fns.map((f:any)=>({name:f.slug||f.name,present:true,verify_jwt:f.verify_jwt,provider_revision:f.version,source_sha256:null})),origin:'managed-provider-read-only',runtime_ready:runtime?.owner_account==='active'&&Object.keys(runtime?.checks||{}).length>0&&Object.values(runtime.checks).every(x=>x===true)};
 },async migrate(m:any){await query(migrationUpgradeSql(m));const h=await query(migrationEvidenceQuery);if(!h.some((x:any)=>x.version===m.version&&x.name===m.name&&x.sha256===m.sha256))throw Error('Migration acknowledgment not verified.');return {reference:'migration:'+m.version};},
 async deploy(f:any){const form=new FormData();for(const file of f.files)form.append('file',new Blob([file.content],{type:'application/typescript'}),file.path);form.append('metadata',JSON.stringify({name:f.name,entrypoint_path:f.entrypoint,verify_jwt:f.verify_jwt}));const ack=await api('/functions/deploy?slug='+f.name,form);const list=await api('/functions');if(!list.some((g:any)=>(g.slug||g.name)===f.name&&g.verify_jwt===f.verify_jwt))throw Error('Function gateway acknowledgment unavailable.');return {reference:String(ack?.version||'provider-acknowledged')};}};
}
