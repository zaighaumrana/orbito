// Read-only, exact-target Platform preflight. Never applies/repairs a migration.
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,mkdtempSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const closurePreflightQuery=`select jsonb_build_object(
 'platform_schema',to_regclass('platform_private.master_identity') is not null,
 'closure_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20261022184736'),
 'clients',(select count(*) from public.clients),'tickets',(select count(*) from public.support_tickets),
 'jobs',(select count(*) from platform_private.provision_jobs),'pins',(select count(*) from platform_private.managed_release_pins),
 'anonymous_closed',not has_table_privilege('anon','public.support_tickets','INSERT') and not has_any_column_privilege('anon','public.support_tickets','INSERT')
 and not has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE') and not has_sequence_privilege('anon','public.support_tickets_id_seq','SELECT') and not has_sequence_privilege('anon','public.support_tickets_id_seq','UPDATE')
 and not exists(select 1 from pg_policies where schemaname='public' and tablename='support_tickets' and cmd in('INSERT','ALL') and ('anon'=any(roles) or 'public'=any(roles)))) as assessment`;
export function classifyClosure(a){
 if(a.platform_schema!==true)throw Error('Exact Platform schema required; never run this closure on a Shop.');
 if(a.closure_applied)return a.anonymous_closed?'already-applied-and-closed':'SECURITY-REVIEW-REQUIRED';
 if(['clients','tickets','jobs','pins'].some(k=>Number(a[k])>0))return 'BLOCKED-POPULATED-TARGET-ADOPTION-REQUIRED';
 return 'EMPTY-TARGET-ELIGIBLE-OWNER-REVIEW-REQUIRED';
}
export function closurePreflight(argv,run=(cli,args)=>{const r=spawnSync(cli,args,{encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:2e6});if(r.status!==0)throw Error('Exact-target read-only inspection failed; provider output suppressed.');return r.stdout;}){
 const o={};for(let n=0;n<argv.length;n++){if(!['--project-ref','--cli'].includes(argv[n])||!argv[n+1]||o[argv[n]])throw Error('Use --project-ref EXACT_PLATFORM_REF --cli NATIVE_CLI');o[argv[n]]=argv[++n];}
 if(!/^[a-z]{20}$/.test(o['--project-ref']||'')||!o['--cli']||/\.(cmd|bat|ps1)$/i.test(o['--cli']))throw Error('Exact reviewed Platform and native CLI required.');
 if(!JSON.parse(run(o['--cli'],['projects','list','--output','json'])).some(p=>p.id===o['--project-ref']))throw Error('Exact customer authorization required.');
 const dir=mkdtempSync(join(tmpdir(),'retrasell-closure-')),file=join(dir,'read.sql');
 try{writeFileSync(file,closurePreflightQuery,{mode:0o600});const rows=JSON.parse(run(o['--cli'],['db','query','--linked','--project-ref',o['--project-ref'],'--file',file,'--output-format','json']));const a=(Array.isArray(rows)?rows:rows.rows)?.[0]?.assessment;return {project_ref:o['--project-ref'],...a,decision:classifyClosure(a)};}finally{unlinkSync(file);rmdirSync(dir);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(closurePreflight(process.argv.slice(2)),null,2));}catch{console.error('Closure preflight stopped. No SQL was applied. Review exact Platform target, authorization and existing schema.');process.exitCode=1;}
