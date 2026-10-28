const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const normalize=(s:string)=>s.replaceAll('\r\n','\n');
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
export function databaseSourceQuery(release:any){
 const {routines,tables}=sqlSourceContract(release);
 return `select jsonb_build_object(
 'identity',(select jsonb_build_object('client_id',s.platform_client_id,'source_id',b.source_id,'client_binding',b.client_binding) from public.shop_config s cross join app_private.bridge_config b where s.id=1 and b.singleton),
 'routines',(select coalesce(jsonb_agg(jsonb_build_object('signature',r.signature,'body',p.prosrc,'language',l.lanname,'security_definer',p.prosecdef,'volatility',p.provolatile,'settings',p.proconfig,
 'execute',(select jsonb_object_agg(role,pg_catalog.has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))), '[]') from unnest(array[${routines.map(literal).join(',')}]::text[]) r(signature) left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(r.signature) left join pg_catalog.pg_language l on l.oid=p.prolang),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'rls',c.relrowsecurity,'anon_select',pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),'authenticated_select',pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT'),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid))),'[]') from pg_catalog.pg_policy p where p.polrelid=c.oid))), '[]') from unnest(array[${tables.map(literal).join(',')}]::text[]) r(name) left join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(r.name))) as evidence`;
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
 for(const name of contract.tables){
  const live=evidence.tables?.find((t:any)=>t.name===name);
  if(!live||live.rls==null){missing.push('private table security: '+name);continue}
  if(live.rls!==true||live.anon_select!==false||live.authenticated_select!==false)mismatched.push('private table RLS/permissions: '+name);
  else matched.push('private RLS/permissions: '+name);
  const source=release.migrations.map((m:any)=>m.sql).join('\n');
  const hasPackagedPolicy=new RegExp('(?:create|alter)\\s+policy\\s+[^;]+\\bon\\s+'+name.replace('.','\\.')+'\\b','i').test(source);
  if(hasPackagedPolicy||!Array.isArray(live.policies))missing.push('canonical policy expression baseline: '+name);
  else if(live.policies.length)mismatched.push('unexpected private policy: '+name);
  else matched.push('default-deny policies: '+name);
 }
 return {status:mismatched.length?'drift':'partial',scope:'declared-runtime-routines-and-private-security',
  matched,missing,mismatched,
  limitations:['All schema objects and policy/ACL expressions are not represented by a canonical catalog baseline in this immutable release; scoped comparisons do not establish full database source equality.']};
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
 return {source_sha256:exact?expected.sha256:null,source_status:mismatched.length?'drift':exact?'matched':'partial',
  source_files:{matched,missing,mismatched},
  ...(gateway!==expected.verify_jwt?{source_limitation:'JWT gateway does not match approved manifest'}:{}),
  ...(!exact&&missing.length?{source_limitation:'Provider did not return every independently comparable packaged source file/entrypoint; omitted files are not reconstructed from the expected package'}:{})};
}
