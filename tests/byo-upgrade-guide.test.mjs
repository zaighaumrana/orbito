import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {createByoUpgradeGuide,renderByoUpgradeGuide,powershellValue} from '../src/byo-upgrade-guide.js';
import {hasUpgradePlan,upgradeActionAllowed} from '../src/upgrade-assessment.js';
const catalog=JSON.parse(readFileSync(new URL('../supabase/releases/approved-shop-releases.json',import.meta.url))),v6=catalog.find(c=>c.release_id==='support-v6'),v7=catalog.find(c=>c.release_id==='support-v7');
const ref='ampwuqwokkbhkizcetsd',platform='ukbhyerxshteyetwomqy',id='99700000-0000-4000-8000-000000000001';
const client={id:1,name:'Customer <Shop>',pairing_mode:'byo',supabase_url:`https://${ref}.supabase.co`,shop_url:'https://customer.example'};
const context=()=>({platformUrl:`https://${platform}.supabase.co`,source:v6.sha256,detail:{clientId:1,operations:{source:{source_id:id}},provisioning:{connection:{project_ref:ref,client_binding:'fixture-1'}},password:'DO_NOT_RENDER_PRIVATE'},inventory:{clientId:1,mode:'byo',project_ref:ref,source_id:id,client_binding:'fixture-1',catalog,stale:false,recorded_upgrade:{release_id:'support-v6',completed_at:'2026-10-24',evidence_strength:'customer-reported'},report:{verified_release:null}},workflow:{}});
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),helpers={esc,copyValue:(text,label)=>`<button data-copy-value="${esc(text)}">${esc(label)}</button>`};
function approved(c){
 const j={client_id:1,project_ref:ref,mode:'byo',source_id:id,client_binding:'fixture-1',request_id:'99700000-0000-4000-8000-000000000002',state:'approved',source_sha256:v6.sha256,target_sha256:v7.sha256,plan_sha256:'a'.repeat(64)};
 j.plan={contract:'retrasell-controlled-upgrade-v1',...j,compatibility:'additive-protocol-1',steps:[{type:'migration',name:'migration:20261025233743',sha256:'b'.repeat(64)}]};c.workflow={job:j,private_clearance:'DO_NOT_RENDER_PRIVATE'};
 return c;
}
export function guideCommands(){return createByoUpgradeGuide(client,approved(context())).stages.flatMap(s=>s.commands);}
test('ten stages generate exact selected identity, native setup and approval-gated commands without secrets',()=>{
 const c=context(),guide=createByoUpgradeGuide(client,c),html=renderByoUpgradeGuide(client,c,helpers);assert.equal(guide.stages.length,10);assert.equal(guide.blockers.length,0);
 for(const s of guide.stages)for(const key of ['what','expected','recovery'])assert.ok(s[key].length>20);
 assert.match(html,/What to do:/);assert.match(html,/Expected result:/);assert.match(html,/If something goes wrong:/);assert.match(html,/Customer &lt;Shop>/);assert.match(html,/customer-reported/);assert.match(html,/Pending/);assert.doesNotMatch(html,/DO_NOT_RENDER_PRIVATE|npx|verified-customer-support-shop|--apply/);
 assert.match(guide.identity,new RegExp(ref));assert.match(guide.identity,/\$ClientId = 1/);assert.match(guide.identity,new RegExp(platform));
 assert.ok(guideCommands().some(c=>c.includes('--apply')));assert.match(guideCommands().join('\n'),/retrasell-upgrade-99700000/);
 const blocked=approved(context());blocked.workflow.needsRefresh=true;assert.equal(createByoUpgradeGuide(client,blocked).approved,false);
 assert.equal(powershellValue("O'Brien $(Get-Content anything)"),"'O''Brien $(Get-Content anything)'");
 for(const command of guideCommands())for(const line of command.split('\n')){
  const match=/^node scripts\/(release-preflight|inspect-backend|upgrade-backend)\.mjs/.exec(line);if(!match)continue;
  const parser=readFileSync(new URL('../../Orbitoshopv2-v1/scripts/'+match[1]+'.mjs',import.meta.url),'utf8');
  for(const flag of line.match(/--[a-z-]+/g)||[])assert.ok(parser.includes("'"+flag+"'"),'Actual CLI parser must accept '+flag);
 }
});
test('missing or stale client binding blocks commands; missing source cannot inherit the v6 receipt',()=>{
 const c=context();c.source='';const unselected=createByoUpgradeGuide(client,c);assert.equal(unselected.stages[6].commands.length,0);
 c.inventory.clientId=2;const stale=renderByoUpgradeGuide({...client,id:3},c,helpers);assert.match(stale,/Load.*client|pairing details/);assert.doesNotMatch(stale,new RegExp(ref));assert.doesNotMatch(stale,/data-copy-value/);
 const other=context();other.inventory.client_binding='different';assert.ok(createByoUpgradeGuide(client,other).blockers.length);
 const missing=context();missing.platformUrl=undefined;assert.ok(createByoUpgradeGuide(client,missing).blockers.length);
});
test('actual upgrade view embeds the guide for approved BYO while retaining current workflow',()=>{
 const c=approved(context()),state={authenticated:true,currentUser:{role:'master_admin'},selectedClient:client,clientData:c.detail,backendInventory:c.inventory,backendUpgrade:{clientId:1,...c.workflow}};
 const ctx={pState:state,pb:{supabaseUrl:c.platformUrl},renderByoUpgradeGuide,hasUpgradePlan,upgradeActionAllowed,...helpers,technicalRows:()=>'',evidenceDetails:()=>'',releaseName:s=>s||'Unknown'};vm.createContext(ctx);
 const src=readFileSync(new URL('../src/upgrade-view.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');vm.runInContext(src,ctx);
 const html=ctx.renderUpgradePanel(client,true);assert.match(html,/Customer CLI instructions/);assert.match(html,/10\. Authorized installation/);assert.match(html,/Download private customer clearance/);assert.match(html,/--apply/);assert.equal(ctx.renderUpgradePanel(client,false),'');
 state.selectedClient={...client,id:2};assert.doesNotMatch(ctx.renderUpgradePanel(client,true),/Customer CLI instructions/);
  // Exercise the existing input hook: selecting a source updates commands immediately,
  // while assessment typing does not rerender and disturb the customer's input.
  state.selectedClient=client;state.page='client-detail';let renders=0;ctx.render=()=>renders++;
  const events=readFileSync(new URL('../src/events.js',import.meta.url),'utf8'),hook=events.match(/const rememberUpgrade=event=>\{[\s\S]*?\n  \};/)[0];vm.runInContext(hook+'\nglobalThis.rememberUpgrade=rememberUpgrade;',ctx);
  ctx.rememberUpgrade({type:'change',target:{id:'upgrade-source',value:v6.sha256,matches:()=>true}});assert.equal(renders,1);assert.equal(state.backendUpgrade.draft['upgrade-source'].value,v6.sha256);
  ctx.rememberUpgrade({type:'input',target:{id:'upgrade-assessment',value:'typing',matches:()=>true}});assert.equal(renders,1);
});
