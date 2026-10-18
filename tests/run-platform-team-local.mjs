// Owned, labeled PG17 + real GoTrue migrations. No hosted target/env is accepted.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
const nonce=randomBytes(8).toString('hex'),container='orbito-bootstrap-team-'+nonce,network=container+'-network';
const bootstrapOnly=process.argv.length===3 && process.argv[2]==='--bootstrap-only';
const bootstrapBehaviorOnly=process.argv.length===3 && process.argv[2]==='--bootstrap-behavior-only';
const teamDatabaseOnly=process.argv.length===3 && process.argv[2]==='--team-database-only';
const lifecycleBoundariesOnly=process.argv.length===3 && process.argv[2]==='--lifecycle-boundaries-only';
const lifecycleOnly=process.argv.length===3 && process.argv[2]==='--lifecycle-only';
const readsOnly=process.argv.length===3 && process.argv[2]==='--reads-only';
const retirementOnly=process.argv.length===3 && process.argv[2]==='--retirement-only';
const resendOnly=process.argv.length===3 && process.argv[2]==='--resend-only';
const securityOnly=process.argv.length===3 && process.argv[2]==='--pr4-security-only';
const reviewOnly=process.argv.length===3 && process.argv[2]==='--review-only';
assert.ok(process.argv.length===2 || lifecycleOnly || readsOnly || retirementOnly || resendOnly || reviewOnly || securityOnly || bootstrapOnly || bootstrapBehaviorOnly || teamDatabaseOnly || lifecycleBoundariesOnly,'This runner accepts only local suite selectors, never a target or external container');
const password=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex'),label='com.retrasell.team-test='+nonce;
let ownedContainer=false,ownedNetwork=false;
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('SUPABASE_') || key.startsWith('PG') || key.startsWith('ORBITO_BOOTSTRAP_'))delete env[key];
const redact=s=>String(s).replaceAll(password,'[fixture credential]').replaceAll(jwt,'[fixture credential]');
function run(file,args,options={}){const r=spawnSync(file,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16*1024*1024,...options});if(r.error || r.status!==0)throw Error(redact(r.error?.message || r.stderr || r.stdout));return r.stdout.trim();}
// Stream progress so a bounded timeout cannot hide completed/failing subtests.
function runSuite(file,args,options){return new Promise((resolve,reject)=>{
 const child=spawn(file,args,{...options,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>process.stdout.write(redact(chunk)));
 child.stderr.on('data',chunk=>process.stderr.write(redact(chunk)));
 child.on('error',reject);child.on('close',(code,signal)=>code===0?resolve():reject(Error('Native subgroup failed: '+code+' '+signal)));
});}
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
 for(const file of bootstrapOnly || bootstrapBehaviorOnly?['tests/production-bootstrap.test.mjs']:teamDatabaseOnly?['tests/platform-team-database.test.mjs']:securityOnly?['tests/pr4-security-postgres.test.mjs']:readsOnly?['tests/platform-role-reads-postgres.test.mjs']:lifecycleOnly || lifecycleBoundariesOnly || retirementOnly || resendOnly || reviewOnly?['tests/team-lifecycle-postgres.test.mjs']:['tests/production-bootstrap.test.mjs','tests/platform-team-database.test.mjs','tests/team-lifecycle-postgres.test.mjs','tests/platform-role-reads-postgres.test.mjs','tests/pr4-security-postgres.test.mjs']){
  // Full SQL files can exceed three minutes on local Windows/Docker. Bound each
  // child suite at eight minutes; retain individual Docker command deadlines.
  await runSuite(process.execPath,['--test','--test-isolation=none','--test-reporter=spec',...(lifecycleBoundariesOnly?['--test-name-pattern=session claims, Storage/Realtime RLS']:bootstrapBehaviorOnly?['--test-name-pattern=actual lifecycle/provisioning/support SQL']:reviewOnly?['--test-name-pattern=invitation review forward']:resendOnly?['--test-name-pattern=resend reservation']:retirementOnly?['--test-name-pattern=fresh full chain|durable delete|retirement and fresh onboarding|resend reservation']:[]),file],{timeout:480000,env:{...env,ORBITO_BOOTSTRAP_TEST_CONTAINER:container}});
 }
 console.log('PASS: owned local PG17/Auth/Vault fixtures; no hosted Auth/SMTP/gateway validation claimed.');
}finally{
 if(ownedContainer){assert.equal(run('docker',['inspect','-f','{{index .Config.Labels "com.retrasell.team-test"}}',container]),nonce);run('docker',['rm','-f',container]);}
 if(ownedNetwork){assert.equal(run('docker',['network','inspect','-f','{{index .Labels "com.retrasell.team-test"}}',network]),nonce);run('docker',['network','rm',network]);}
}
