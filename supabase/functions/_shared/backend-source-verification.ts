import {policyBaselines} from './backend-policy-baselines.ts';
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const normalize=(s:string)=>s.replaceAll('\r\n','\n');
const stableJson=(x:any):string=>Array.isArray(x)?'['+x.map(stableJson).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stableJson(x[k])).join(',')+'}':JSON.stringify(x);
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalize(s)))),b=>b.toString(16).padStart(2,'0')).join('');
export function sqlSourceContract(release:any){
 const definitions=new Map<string,any>(),privileges=new Map<string,Set<string>>();
 for(const migration of release.migrations){
  const sql=normalize(migration.sql);
  for(const m of sql.matchAll(/^\s*create\s+(?:or\s+replace\s+)?function\s+((?:public|app_private)\.\w+)\s*\(([\s\S]*?)\)\s*returns\b([\s\S]*?)\bas\s+(\$[\w]*\$)([\s\S]*?)\4/gim)){
   definitions.set(m[1].toLowerCase(),{body:m[5],language:m[3].match(/\blanguage\s+(\w+)/i)?.[1]?.toLowerCase(),
    security_definer:/\bsecurity\s+definer\b/i.test(m[3]),volatility:/\bimmutable\b/i.test(m[3])?'i':/\bstable\b/i.test(m[3])?'s':'v',
    search_path:/\bset\s+search_path\s*=\s*''/i.test(m[3])?'':null});
  }
  for(const m of sql.matchAll(/\b(revoke|grant)\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([\s\S]*?)\s+(?:from|to)\s+([^;]+);/gi)){
   for(const fn of m[2].matchAll(/((?:public|app_private)\.\w+)\s*\([^)]*\)/gi)){
    const name=fn[1].toLowerCase(),roles=privileges.get(name)||new Set(['public']);
    for(const role of m[3].toLowerCase().split(',').map(x=>x.trim()))if(['public','anon','authenticated','service_role'].includes(role)){if(m[1].toLowerCase()==='grant')roles.add(role);else roles.delete(role)}
    privileges.set(name,roles);
   }
  }
 }
 return {routines:release.requirements?.runtime?.database?.functions||[],tables:release.requirements?.runtime?.database?.tables||[],definitions,privileges};
}
// A SELECT-only catalog snapshot. No session settings or operational rows are changed.
export function securityCatalogQuery(tables:string[]){
 const tableOps="array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]";
 const columnOps="array['INSERT','REFERENCES','SELECT','UPDATE']::text[]";
 const roles="array['public','anon','authenticated','service_role']::text[]";
 const effective=(object:string,ops:string,column=false)=>`(select jsonb_agg(jsonb_build_object('role',role,'privileges',array(select op from unnest(${ops}) op where pg_catalog.${column?'has_column_privilege':'has_table_privilege'}(role,${object},op) order by op),'grant_options',array(select op from unnest(${ops}) op where pg_catalog.${column?'has_column_privilege':'has_table_privilege'}(role,${object},op||' WITH GRANT OPTION') order by op)) order by role) from unnest(${roles}) role)`;
 const acl=(expression:string)=>`(select coalesce(jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'public' else pg_catalog.pg_get_userbyid(x.grantee) end,'grantor',pg_catalog.pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee::regrole::text,x.grantor::regrole::text,x.privilege_type),'[]') from pg_catalog.aclexplode(${expression}) x)`;
 return `select jsonb_build_object('format',1,
 'context',jsonb_build_object('postgres_major',current_setting('server_version_num')::integer/10000,'schemas',pg_catalog.current_schemas(false)),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypassrls',r.rolbypassrls,'inherit',r.rolinherit,
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',g.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by g.rolname),'[]') from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.roleid where m.member=r.oid)) order by r.rolname) from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated','service_role')),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object('name',requested.name,'exists',c.oid is not null,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_catalog.pg_get_userbyid(c.relowner),
 'schema_usage',(select jsonb_agg(jsonb_build_object('role',role,'usage',pg_catalog.has_schema_privilege(role,c.relnamespace,'USAGE'),'grantable',pg_catalog.has_schema_privilege(role,c.relnamespace,'USAGE WITH GRANT OPTION')) order by role) from unnest(${roles}) role),
 'acl',${acl("coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))")},'effective',${effective('c.oid',tableOps)},
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'acl',${acl('a.attacl')},'effective',${effective('c.oid,a.attnum',columnOps,true)}) order by a.attname),'[]') from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'roles',array(select case when role_oid=0 then 'public' else pg_catalog.pg_get_userbyid(role_oid) end from unnest(p.polroles) role_oid order by 1),'permissive',p.polpermissive,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) order by p.polname),'[]') from pg_catalog.pg_policy p where p.polrelid=c.oid)) order by requested.name),'[]') from unnest(array[${tables.map(literal).join(',')}]::text[]) requested(name) left join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(requested.name)))`;
}
export function databaseSourceQuery(release:any){
 const {routines,tables}=sqlSourceContract(release);
 return `select jsonb_build_object(
 'identity',(select jsonb_build_object('client_id',s.platform_client_id,'source_id',b.source_id,'client_binding',b.client_binding) from public.shop_config s cross join app_private.bridge_config b where s.id=1 and b.singleton),
 'routines',(select coalesce(jsonb_agg(jsonb_build_object('signature',r.signature,'body',p.prosrc,'language',l.lanname,'security_definer',p.prosecdef,'volatility',p.provolatile,'settings',p.proconfig,
 'execute',(select jsonb_object_agg(role,pg_catalog.has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))), '[]') from unnest(array[${routines.map(literal).join(',')}]::text[]) r(signature) left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(r.signature) left join pg_catalog.pg_language l on l.oid=p.prolang),
 'security',(${securityCatalogQuery(tables)})) as evidence`;
}
export async function compareDatabaseSource(release:any,evidence:any,identity:any){
 const contract=sqlSourceContract(release),missing:string[]=[],mismatched:string[]=[],matched:string[]=[];
 const actual=evidence?.identity;
 if(!actual||actual.client_id!==identity.client_id||actual.source_id!==identity.source_id||actual.client_binding!==identity.client_binding)
  throw Error('Provider database identity does not match the current client/source/binding');
 for(const signature of contract.routines){
  const name=signature.split('(')[0],expected=contract.definitions.get(name),live=evidence.routines?.find((r:any)=>r.signature===signature);
  if(!expected||!live||typeof live.body!=='string'){missing.push('routine definition: '+signature);continue}
  const settings=live.settings||[],path=settings.find((x:string)=>x.startsWith('search_path='))?.slice(12).replaceAll('"','');
  if(expected.search_path===null){missing.push('approved routine settings: '+signature);continue}
  if(normalize(live.body)!==expected.body||live.language!==expected.language||live.security_definer!==expected.security_definer||live.volatility!==expected.volatility||expected.search_path===null||path!==expected.search_path)mismatched.push('routine definition/settings: '+signature);
  else matched.push('routine: '+signature);
  const roles=contract.privileges.get(name);
  if(!roles)missing.push('approved routine ACL: '+signature);
  else for(const role of ['anon','authenticated','service_role']){
   if(typeof live.execute?.[role]!=='boolean')missing.push('routine permission: '+signature+'/'+role);
   else if(live.execute[role]!==Boolean(roles.has(role)||roles.has('public')))mismatched.push('routine permission: '+signature+'/'+role);
  }
 }
 const releaseKey=release.sha256,baselineRelease=policyBaselines.releases?.[releaseKey];
 if(!baselineRelease){
  missing.push('release-specific PostgreSQL 17 policy/ACL baseline: '+String(release.release_id||releaseKey||'unknown'));
  for(const name of contract.tables){
   const live=evidence.tables?.find((t:any)=>t.name===name);
   if(!live||typeof live.rls!=='boolean'||typeof live.anon_select!=='boolean'||typeof live.authenticated_select!=='boolean')missing.push('private table RLS evidence: '+name);
   else if(live.rls!==true||live.anon_select||live.authenticated_select)mismatched.push('private table default-deny: '+name);
   else matched.push('private table RLS: '+name);
  }
 }else{
  const manifest=await digest(JSON.stringify(release.migrations.map(({version,name,sha256}:any)=>({version,name,sha256}))));
  if(manifest!==baselineRelease.migrations_sha256||JSON.stringify(contract.tables.slice().sort())!==JSON.stringify(baselineRelease.tables.slice().sort())){
   missing.push('release migration/table manifest does not match its immutable security baseline');
  }else{
   const security=evidence.security;
   if(!security||typeof security!=='object')missing.push('PostgreSQL security catalog evidence');
   else{
    if(security.format!==1||security.context?.postgres_major!==policyBaselines.postgres_major||!Array.isArray(security.context?.schemas)||!policyBaselines.contexts.some((x:any)=>JSON.stringify(x)===JSON.stringify(security.context.schemas)))
     missing.push('supported PostgreSQL 17 catalog/search-path context');
    if(!Array.isArray(security.roles)||!Array.isArray(security.tables))missing.push('complete PostgreSQL security catalog roles/tables');
    else if(security.format===1&&security.context?.postgres_major===policyBaselines.postgres_major&&policyBaselines.contexts.some((x:any)=>JSON.stringify(x)===JSON.stringify(security.context.schemas))){
     const expected=Object.keys(policyBaselines.tables).filter(name=>baselineRelease.tables.includes(name)).sort();
     const actualNames=security.tables.map((t:any)=>t?.name).filter((x:any)=>typeof x==='string').sort();
     if(JSON.stringify(actualNames)!==JSON.stringify(expected))missing.push('complete security catalog table set');
     const requiredTableFields=['name','exists','rls','force_rls','owner','schema_usage','acl','effective','columns','policies'];
     const requiredRoleFields=['name','superuser','bypassrls','inherit','memberships'];
     const completeTable=(t:any)=>requiredTableFields.every(k=>Object.hasOwn(t,k))&&Array.isArray(t.schema_usage)&&Array.isArray(t.acl)&&Array.isArray(t.effective)&&Array.isArray(t.columns)&&Array.isArray(t.policies)&&t.columns.every((c:any)=>Object.hasOwn(c,'name')&&Array.isArray(c.acl)&&Array.isArray(c.effective))&&t.policies.every((p:any)=>['name','command','roles','permissive','using','check'].every(k=>Object.hasOwn(p,k))&&Array.isArray(p.roles));
     if(!security.roles.every((r:any)=>r&&requiredRoleFields.every(k=>Object.hasOwn(r,k))&&Array.isArray(r.memberships)))missing.push('complete application role attributes/memberships');
     for(const name of expected){
      const live=security.tables.find((t:any)=>t?.name===name),baseline=policyBaselines.tables[name];
      if(!live||!completeTable(live)){missing.push('complete table/column ACL and policy evidence: '+name);continue}
      if(live.exists!==true){mismatched.push('table existence: '+name);continue}
      if(stableJson(live)!==stableJson(baseline))mismatched.push('PostgreSQL security catalog: '+name);
      else matched.push('PostgreSQL 17 RLS/ACL/policies: '+name);
     }
     if(security.roles.every((r:any)=>r&&requiredRoleFields.every(k=>Object.hasOwn(r,k))&&Array.isArray(r.memberships))){
      if(stableJson(security.roles)!==stableJson(policyBaselines.roles))mismatched.push('PostgreSQL application role attributes/memberships');
      else matched.push('PostgreSQL application role attributes/memberships');
     }
     for(const name of expected){
      const expectedGuard=policyBaselines.tables[name].policies.find((p:any)=>p.name==='support_consent_guard');if(!expectedGuard)continue;
      const live=security.tables.find((t:any)=>t?.name===name),guard=live?.policies?.find((p:any)=>p.name==='support_consent_guard');
      if(expectedGuard.permissive!==false||expectedGuard.command!=='*'||JSON.stringify(expectedGuard.roles)!==JSON.stringify(['authenticated'])||typeof expectedGuard.using!=='string'||expectedGuard.using!=='( SELECT app_private.support_access_allowed() AS support_access_allowed)'||expectedGuard.check!==expectedGuard.using)mismatched.push('approved restrictive Support-consent baseline: '+name);
      else if(!live||!Array.isArray(live.policies))missing.push('restrictive Support-consent policy evidence: '+name);
      else if(!guard)mismatched.push('restrictive Support-consent policy: '+name);
      else if(stableJson(guard)!==stableJson(expectedGuard))mismatched.push('restrictive Support-consent policy: '+name);
      else matched.push('restrictive Support-consent policy: '+name);
     }
    }
   }
  }
 }
 return {status:mismatched.length?'drift':missing.length?'partial':'matched',scope:'declared-runtime-routines-and-private-security',
  matched,missing,mismatched,
  limitations:[missing.length?'Missing or unsupported provider evidence remains incomplete; it is not treated as a security match.':'Full database source equality is not established by this scoped security comparison.']};
}
export async function sourceFiles(response:Response){
 if(!response.ok){await response.body?.cancel();throw Error('Function source download HTTP '+response.status)}
 const reader=response.body?.getReader();if(!reader)throw Error('Function source body missing');
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4*1024*1024){await reader.cancel();throw Error('Function source exceeds 4 MiB budget')}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 const type=response.headers.get('content-type')||'';
 if(!type.toLowerCase().startsWith('multipart/'))throw Error('Decoded multipart source unavailable; binary/bundle bytes are not package-source proof');
 const boundary=type.match(/boundary="?([^";]+)"?/i)?.[1];if(!boundary||boundary.length>150)throw Error('Function source multipart boundary missing');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),parts=text.split('--'+boundary),files:any[]=[];let metadata:any=null;
 if(!text.endsWith('--'+boundary+'--\r\n')&&!text.endsWith('--'+boundary+'--'))throw Error('Incomplete function source multipart');
 for(const part of parts.slice(1,-1)){
  const split=part.indexOf('\r\n\r\n');if(split<0)throw Error('Malformed function source part');
  const headers=part.slice(0,split),content=part.slice(split+4).replace(/\r\n$/,'');
  const filename=headers.match(/^supabase-path:\s*(.+)$/im)?.[1]?.trim()||headers.match(/filename="([^"]+)"/i)?.[1];
  if(filename)files.push({path:filename,content});
  else if(/name="metadata"/i.test(headers)){if(metadata)throw Error('Duplicate source metadata');metadata=JSON.parse(content)}
 }
 if(files.length>100)throw Error('Function file count exceeds budget');
 return {files,entrypoint:metadata?.deno2_entrypoint_path||metadata?.entrypoint_path};
}
function sourcePath(path:string){
 const value=path.startsWith('file://')?new URL(path).pathname:path;
 const clean=decodeURIComponent(value).replaceAll('\\','/');
 if(clean.split('/').includes('..')||clean.includes('\0'))throw Error('Unsafe provider source path');
 return clean;
}
export async function compareFunctionSource(expected:any,download:any,gateway:any){
 const missing:string[]=[],mismatched:string[]=[],seen=new Set<string>();let matched=0;
 const remoteEntry=typeof download.entrypoint==='string'?sourcePath(download.entrypoint):null;
 let prefix:string|null=null;
 if(remoteEntry?.endsWith(expected.entrypoint))prefix=remoteEntry.slice(0,-expected.entrypoint.length);
 else if(remoteEntry)missing.push('entrypoint path cannot be aligned with approved manifest');
 else missing.push('provider entrypoint metadata unavailable');
 for(const file of download.files){
  const path=sourcePath(file.path),key=prefix!==null&&path.startsWith(prefix)?path.slice(prefix.length):path;
  const packaged=expected.files.find((f:any)=>f.path===key);
  if(!packaged){missing.push('unmapped provider source file: '+key.slice(-160));continue}
  if(seen.has(key))throw Error('Duplicate provider source file');seen.add(key);
  if(await digest(file.content)!==packaged.sha256)mismatched.push(key);else matched++;
 }
 for(const file of expected.files)if(!seen.has(file.path))missing.push(file.path);
 const exact=!missing.length&&!mismatched.length&&gateway===expected.verify_jwt;
 return {source_sha256:exact?expected.sha256:null,source_status:mismatched.length||gateway!==expected.verify_jwt?'drift':exact?'matched':'partial',
  source_files:{matched,missing,mismatched},
  ...(gateway!==expected.verify_jwt?{source_limitation:'JWT gateway does not match approved manifest'}:{}),
  ...(!exact&&missing.length?{source_limitation:'Provider did not return every independently comparable packaged source file/entrypoint; omitted files are not reconstructed from the expected package'}:{})};
}
