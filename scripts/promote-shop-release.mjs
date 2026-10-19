// Owner review utility. This edits only a local source pointer; never deploys.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const args=process.argv.slice(2),root=resolve(import.meta.dirname,'..');
if(args.length!==3||args[0]!=='support-v2'||!/^[a-f0-9]{64}$/.test(args[1])||!['--review','--apply'].includes(args[2]))throw Error('Use: node scripts/promote-shop-release.mjs support-v2 EXACT_SHA256 --review|--apply');
const release=JSON.parse(readFileSync(resolve(root,'supabase/releases/shop-release-support-v2.json'),'utf8'));
const {sha256,...body}=release;
if(sha256!==args[1]||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==sha256)throw Error('Exact reviewed package fingerprint required');
if(release.migrations.length!==34||release.functions.length!==7)throw Error('Unexpected release shape');
const pointer={release_id:'support-v2',sha256};
if(args[2]==='--apply')writeFileSync(resolve(root,'supabase/releases/active-shop-release.json'),JSON.stringify(pointer)+'\n');
console.log(JSON.stringify({local_only:true,applied:args[2]==='--apply',...pointer}));
