import {validateWorkspace} from './release-parity.mjs';
// Owner review utility. This edits only a local source pointer; never deploys.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const args=process.argv.slice(2),root=resolve(import.meta.dirname,'..');
if(args.length!==3||!/^support-v[0-9]+$/.test(args[0])||!/^[a-f0-9]{64}$/.test(args[1])||!['--review','--apply'].includes(args[2]))throw Error('Use: node scripts/promote-shop-release.mjs APPROVED_RELEASE_ID EXACT_SHA256 --review|--apply');
const catalog=JSON.parse(readFileSync(resolve(root,'supabase/releases/approved-shop-releases.json'),'utf8'));
const approved=catalog.find(r=>r.release_id===args[0]&&r.approved_for_new===true);if(!approved||approved.sha256!==args[1])throw Error('Explicitly approved shared release required');
const release=JSON.parse(readFileSync(resolve(root,'supabase/releases/shop-release-'+args[0]+'.json'),'utf8'));
const {sha256,...body}=release;
if(sha256!==args[1]||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==sha256)throw Error('Exact reviewed package fingerprint required');
if(release.migrations.length!==approved.migrations||release.functions.length!==7)throw Error('Unexpected release shape');
await validateWorkspace();
const pointer={release_id:args[0],sha256};
if(args[2]==='--apply')writeFileSync(resolve(root,'supabase/releases/active-shop-release.json'),JSON.stringify(pointer)+'\n');
console.log(JSON.stringify({local_only:true,applied:args[2]==='--apply',...pointer}));
