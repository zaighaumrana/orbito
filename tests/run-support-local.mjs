import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const baseline=process.argv.length===3 && process.argv[2]==='--baseline';
assert.ok(process.argv.length===2 || baseline,'Only --baseline is accepted; no hosted target or existing container');
const nonce=randomBytes(8).toString('hex'),name='orbito-bootstrap-sql-'+nonce,label='com.retrasell.sql-test',password=randomBytes(32).toString('hex');
const run=(args,options={})=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,...options});if(r.status!==0)throw Error(String(r.stderr).replaceAll(password,'[fixture]'));return r.stdout.trim();};
let owned=false;
try {
 assert.equal(run(['version','--format','{{.Server.Os}}']),'linux');
 run(['image','inspect','public.ecr.aws/supabase/postgres:17.6.1.155']);
 run(['run','--rm','-d','--name',name,'--label',label+'='+nonce,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'public.ecr.aws/supabase/postgres:17.6.1.155']);owned=true;
 for(let i=0;i<80;i++){try{run(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{if(i===79)throw Error('PG readiness failed');await new Promise(r=>setTimeout(r,250));}}
 const port=run(['port',name,'5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];if(!port)throw Error('Local port required');
 const psql=process.env.ORBITO_LOCAL_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe',env={...process.env};
 for(const key of Object.keys(env))if(/^(PG|SUPABASE_|ORBITO_SUPPORT_|ORBITO_LOCAL_)/.test(key))delete env[key];
 Object.assign(env,{ORBITO_LOCAL_PSQL:psql,ORBITO_LOCAL_SUPPORT_TEST_PORT:port,PGPASSWORD:password});
 if(baseline)env.ORBITO_SUPPORT_REVIEW_BASELINE='be43f28';
 for(const args of [['--test','tests/support-handoff-postgres.test.mjs']]){
  const r=spawnSync(process.execPath,args,{env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});console.log(String(r.stdout).replaceAll(password,'[fixture]'));if(r.status!==0)throw Error(String(r.stderr).replaceAll(password,'[fixture]'));
 }
} finally {if(owned){if(run(['inspect','-f','{{index .Config.Labels "'+label+'"}}',name])!==nonce)throw Error('Ownership mismatch');run(['rm','-f',name]);}}
