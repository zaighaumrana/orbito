// Explicit public build input. Reads no .env and never accepts server secrets.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'vite';
const args=process.argv.slice(2),root=resolve(import.meta.dirname,'..');
if(![4,5].includes(args.length)||args[0]!=='--config'||args[2]!=='--project-ref'||!/^[a-z]{20}$/.test(args[3])||(args[4]&&args[4]!=='--verify-dist'))throw Error('Use --config EXPLICIT_PUBLIC_JSON --project-ref EXACT_REF [--verify-dist]');
const config=JSON.parse(readFileSync(resolve(args[1]),'utf8'));
const platform=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).name==='retailos-platform';
const keys=platform?['VITE_PLATFORM_URL','VITE_PLATFORM_ANON','VITE_TURNSTILE_KEY']:['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'];
const allowed=[...keys,...(platform?['VITE_PLATFORM_AUTH_EMAIL']:[])];
if(Object.keys(config).some(k=>!allowed.includes(k))||keys.some(k=>typeof config[k]!=='string'||!config[k].trim()||/[\r\n]/.test(config[k])))throw Error('Only the documented public browser fields are accepted');
if(config[keys[0]]!==`https://${args[3]}.supabase.co`)throw Error('Public build project differs from the reviewed target');
let claims;try{claims=JSON.parse(Buffer.from(config[keys[1]].split('.')[1],'base64url').toString())}catch{throw Error('Public legacy anon JWT required')}
if(claims.role!=='anon'||claims.ref!==args[3]||!Number.isFinite(claims.exp)||claims.exp<Date.now()/1000)throw Error('Wrong, expired or privileged public key');
const fingerprint=createHash('sha256').update(JSON.stringify(Object.fromEntries(allowed.filter(k=>config[k]).sort().map(k=>[k,config[k]])))).digest('hex');
const digestDist=()=>{const walk=dir=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):e.name==='retrasell-build.json'?[]:[resolve(dir,e.name)]);const hash=createHash('sha256');for(const file of walk(resolve(root,'dist'))){hash.update(file.slice(resolve(root,'dist').length).replaceAll('\\','/'));hash.update(readFileSync(file));}return hash.digest('hex')};
if(args[4]==='--verify-dist'){
 const saved=JSON.parse(readFileSync(resolve(root,'dist/retrasell-build.json'),'utf8'));
 if(saved.project_ref!==args[3]||saved.public_config_sha256!==fingerprint||saved.assets_sha256!==digestDist())throw Error('Compiled dist differs from the reviewed public configuration or asset digest. Rebuild before upload.');
 console.log('PASS: compiled public target and asset digest verified');process.exit(0);
}
// Remove inherited Vite values too; only the explicit reviewed public input wins.
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
Object.assign(process.env,config,{RETRASELL_CLEAN_PUBLIC_BUILD:'1'});
await build({root,envDir:false,configFile:resolve(root,'vite.config.js')});
writeFileSync(resolve(root,'dist/retrasell-build.json'),JSON.stringify({project_ref:args[3],public_config_sha256:fingerprint,assets_sha256:digestDist(),turnstile_site_key:config[keys[2]],built_at:new Date().toISOString()})+'\n');
console.log('PASS: clean explicit public build for '+args[3]+'; configuration fingerprint '+fingerprint);
