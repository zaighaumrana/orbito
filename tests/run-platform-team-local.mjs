// Owned, labeled PG17 + real GoTrue migrations. No hosted target/env is accepted.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const nonce=randomBytes(8).toString('hex'),container='orbito-bootstrap-team-'+nonce,network=container+'-network';
assert.equal(process.argv.length,2,'This runner accepts no target, URL or external container arguments');
const password=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex'),label='com.retrasell.team-test='+nonce;
let ownedContainer=false,ownedNetwork=false;
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('SUPABASE_') || key.startsWith('PG') || key.startsWith('ORBITO_BOOTSTRAP_'))delete env[key];
const redact=s=>String(s).replaceAll(password,'[fixture credential]').replaceAll(jwt,'[fixture credential]');
function run(file,args,options={}){const r=spawnSync(file,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16*1024*1024,...options});if(r.error || r.status!==0)throw Error(redact(r.error?.message || r.stderr || r.stdout));return r.stdout.trim();}
try{
 assert.equal(run('docker',['version','--format','{{.Server.Os}}']),'linux');
 for(const image of ['public.ecr.aws/supabase/postgres:17.6.1.155','public.ecr.aws/supabase/gotrue:v2.197.0'])run('docker',['image','inspect',image]);
 run('docker',['network','create','--label',label,network]);ownedNetwork=true;
 // No published port: tests reach psql ONLY through docker exec.
 run('docker',['run','--rm','-d','--name',container,'--label',label,'--network',network,'-e','POSTGRES_PASSWORD='+password,'public.ecr.aws/supabase/postgres:17.6.1.155']);ownedContainer=true;
 let ready=false;for(let n=0;n<60;n++){
  const r=spawnSync('docker',['exec',container,'pg_isready','-h',container,'-U','postgres'],{encoding:'utf8',windowsHide:true});
  if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));
 }assert.ok(ready,'Disposable PG17 readiness timeout');
 run('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-f','-'],{input:`alter role supabase_auth_admin password '${password}';`});
 run('docker',['run','--rm','--network',network,'-e','GOTRUE_DB_DRIVER=postgres','-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${container}:5432/postgres`,'-e','GOTRUE_SITE_URL=http://localhost:4180','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_JWT_SECRET='+jwt,'public.ecr.aws/supabase/gotrue:v2.197.0','auth','migrate']);
 for(const file of ['tests/production-bootstrap.test.mjs','tests/platform-team-database.test.mjs']){
  console.log(run(process.execPath,['--test',file],{env:{...env,ORBITO_BOOTSTRAP_TEST_CONTAINER:container}}));
 }
 console.log('PASS: owned local PG17/Auth/Vault fixtures; no hosted Auth/SMTP/gateway validation claimed.');
}finally{
 if(ownedContainer){assert.equal(run('docker',['inspect','-f','{{index .Config.Labels "com.retrasell.team-test"}}',container]),nonce);run('docker',['rm','-f',container]);}
 if(ownedNetwork){assert.equal(run('docker',['network','inspect','-f','{{index .Labels "com.retrasell.team-test"}}',network]),nonce);run('docker',['network','rm',network]);}
}
