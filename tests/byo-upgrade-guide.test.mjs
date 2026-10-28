import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import vm from 'node:vm';
import {spawnSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
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
function runPowerShell51(script){
 const dir=mkdtempSync(join(tmpdir(),'retrasell-guide-stages-2-5-')),file=join(dir,'fixture.ps1');
 try{
  writeFileSync(file,'\uFEFF'+`$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'Windows PowerShell 5.1 required' }
function Expect($Condition, [string] $Message) { if (-not $Condition) { throw $Message } }
try {\n${script}\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`);
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);return result.stdout;
 }finally{
  assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});
 }
}

test('Windows PowerShell 5.1 stage 2 skips existing tools/bucket and installs only missing tools through stubs',()=>{
 const commands=createByoUpgradeGuide(client,context()).stages[1].commands;
 const output=runPowerShell51(`
$script:Available = @{git=$true; node=$true; supabase=$true; scoop=$true}
$script:Calls = @(); $script:NodeVersion = 'v24.1.0'; $script:InstalledPackages=@()
$script:Buckets = @([pscustomobject]@{Name='supabase'; Source='https://github.com/supabase/scoop-bucket.git'})
function Get-Command { param($Name,$ErrorAction) if ($script:Available[$Name]) { [pscustomobject]@{Name=$Name} } }
function Set-ExecutionPolicy { throw 'No policy changes permitted in fixture' }
function Invoke-RestMethod { throw 'No downloads permitted in fixture' }
function Invoke-Expression { throw 'No installers permitted in fixture' }
function git { $global:LASTEXITCODE=0; 'git version 2.50.0.windows.1' }
function node { $global:LASTEXITCODE=0; $script:NodeVersion }
function supabase { $global:LASTEXITCODE=0; '2.50.0' }
function scoop {
 $Call = $args -join ' '; $script:Calls += $Call; $global:LASTEXITCODE=0
 if ($Call -eq 'list') { if (-not $script:InstalledPackages.Count) { $global:LASTEXITCODE=1 }; return ,$script:InstalledPackages }
 if ($Call -eq 'bucket list') { if (-not $script:Buckets.Count) { $global:LASTEXITCODE=2 }; return ,$script:Buckets }
 if ($Call -eq 'bucket add supabase https://github.com/supabase/scoop-bucket.git') {
  Expect (-not $script:Buckets.Count) 'Existing bucket must never be re-added'
  $script:Buckets = @([pscustomobject]@{Name='supabase'; Source='https://github.com/supabase/scoop-bucket.git'}); return
 }
 switch ($Call) {
  'install git' { $script:Available.git=$true }
  'install nodejs-lts' { $script:Available.node=$true }
  'install supabase/supabase' { $script:Available.supabase=$true }
  default { throw "Unexpected Scoop command: $Call" }
 }
}
# All tools already work: both installer blocks must be harmless.
$Existing = @(${commands[1]}\n${commands[2]}) -join [Environment]::NewLine
Expect ($script:Calls.Count -eq 0) 'Existing tools must cause zero Scoop calls'
Expect ($Existing -match 'Scoop installation is unnecessary' -and $Existing -match 'SKIPPED: supabase' -and $Existing -match 'PASS:') 'Existing setup needs SKIPPED/PASS'
$script:Available.scoop=$false
${commands[1]}
$script:Available.scoop=$true
${commands[0]}
# Native Supabase alone is missing; the existing official bucket must be reused.
$script:Available.supabase=$false; $script:Calls=@()
$Reuse = @(${commands[2]}) -join [Environment]::NewLine
Expect (($script:Calls -join '|') -eq 'list|bucket list|install supabase/supabase') 'Reuse must not add/remove the existing bucket or reinstall other tools'
Expect ($Reuse -match 'SKIPPED: official Supabase bucket') 'Existing bucket needs SKIPPED'
# All three tools and the official bucket are missing. Scoop is a stub only.
$script:Available.git=$false; $script:Available.node=$false; $script:Available.supabase=$false; $script:Buckets=@(); $script:Calls=@()
${commands[2]}
Expect (($script:Calls -join '|') -eq 'list|install git|list|install nodejs-lts|list|bucket list|bucket add supabase https://github.com/supabase/scoop-bucket.git|install supabase/supabase') 'Only missing packages/bucket may be installed'
# A package installed in Scoop but absent from PATH needs repair, not another install.
$script:Available.supabase=$false; $script:InstalledPackages=@([pscustomobject]@{Name='supabase'}); $script:Calls=@(); $Failure=''
try { ${commands[2]} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'already installed but supabase is missing from PATH' -and ($script:Calls -join '|') -eq 'list') 'Existing package with a broken PATH must not be reinstalled'
$script:Available.supabase=$true
# An existing old version is rejected, never silently reinstalled.
$script:NodeVersion='v22.1.0'; $script:Calls=@(); $Failure=''
try { ${commands[2]} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'installed Node must be v24' -and $script:Calls.Count -eq 0) 'Old installed Node must stop for repair without installation'
Write-Output 'PASS: focused installation scenarios; no actual installer executed.'`);
 assert.match(output,/PASS: focused installation scenarios/);
});

test('Windows PowerShell 5.1 stage 5 matches exact JSON project IDs and separates access/login/parse failures',()=>{
 const command=createByoUpgradeGuide(client,context()).stages[4].commands[0];
 assert.match(command,new RegExp(`\\$ShopRef = '${ref}'`));assert.match(command,/\$ClientId = 1/);assert.doesNotMatch(command,/Where-Object id|\$Projects = @\(/);
 const output=runPowerShell51(`
$script:Calls=@(); $script:ListExit=0; $script:LoginExit=0; $script:PromptCount=0
$script:Json='[\n {"id":"other-project"},\n {"id":"${ref}"}\n]'
function supabase {
 $Call=$args -join ' '; $script:Calls += $Call
 if ($Call -eq 'projects list --output json') { $global:LASTEXITCODE=$script:ListExit; $script:Json -split [Environment]::NewLine; return }
 if ($Call -eq 'login') { $global:LASTEXITCODE=$script:LoginExit; $script:ListExit=0; return }
 throw "Unexpected Supabase command: $Call"
}
function Read-Host { param($Prompt) $script:PromptCount++; 'LOGIN' }
$Result = @(${command}) -join [Environment]::NewLine
Expect ($Result -match 'PASS: authenticated account lists exact customer Shop ${ref}') 'Multi-project array must match the exact approved project'
Expect (($script:Calls -join '|') -eq 'projects list --output json' -and $script:PromptCount -eq 0) 'Existing access must skip interactive login'
$script:Json='[{"id":"${ref}extra"},{"id":"other-project"}]'; $script:Calls=@(); $Failure=''
try { ${command} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'exact Shop ${ref} is absent' -and $Failure -match 'supabase logout') 'Absent project must fail with account recovery'
Expect (($script:Calls -join '|') -eq 'projects list --output json') 'Absent project must not automatically log in'
$script:Json='[invalid JSON]'; $Failure=''
try { ${command} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'JSON parsing failed') 'Malformed JSON needs a distinct parsing failure'
$script:Json='[{"id":"${ref}"}]'; $script:ListExit=1; $script:Calls=@()
${command}
Expect (($script:Calls -join '|') -eq 'projects list --output json|login|projects list --output json') 'Login must follow a failed list and then recheck exact access'
$script:ListExit=1; $script:LoginExit=1; $Failure=''
try { ${command} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'customer CLI login failed') 'Failed login needs a distinct STOP'
Write-Output 'PASS: focused exact-project, parsing and login scenarios; no provider calls.'`);
 assert.match(output,/PASS: focused exact-project, parsing and login scenarios/);
});
test('ten stages generate exact selected identity, native setup and approval-gated commands without secrets',()=>{
 const c=context(),guide=createByoUpgradeGuide(client,c),html=renderByoUpgradeGuide(client,c,helpers);assert.equal(guide.stages.length,10);assert.equal(guide.blockers.length,0);
 for(const s of guide.stages)for(const key of ['what','where','prerequisite','expected','recovery','complete'])assert.ok(s[key].length>20);
 assert.match(html,/Where/);assert.match(html,/Before you start/);assert.match(html,/Successful result/);assert.match(html,/When to continue/);assert.match(html,/Customer &lt;Shop>/);assert.match(html,/customer-reported/);assert.match(html,/Pending/);assert.doesNotMatch(html,/DO_NOT_RENDER_PRIVATE|npx|verified-customer-support-shop|--apply/);
 assert.match(guide.identity,new RegExp(ref));assert.match(guide.identity,/\$ClientId = 1/);assert.match(guide.identity,new RegExp(platform));
 assert.ok(guideCommands().some(c=>c.includes('--apply')));assert.match(guideCommands().join('\n'),/retrasell-upgrade-99700000/);
 const blocked=approved(context());blocked.workflow.needsRefresh=true;assert.equal(createByoUpgradeGuide(client,blocked).approved,false);
 assert.equal(powershellValue("O'Brien $(Get-Content anything)"),"'O''Brien $(Get-Content anything)'");
 assert.doesNotMatch(guideCommands().join('\n'),/RETRASELL_PLATFORM_SOURCE|npm run release:check|INTERNAL OPERATORS ONLY|\.\.\/orbito/);
 for(const command of [guide.stages[5].commands[0],guide.stages[6].commands[0]]){assert.match(command,/\$ShopRef =/);assert.match(command,/\$ClientId =/);assert.match(command,/\$TargetSha =/);assert.match(command,/LASTEXITCODE/);assert.match(command,/Read-GuideJson/);assert.match(command,/PASS:/);assert.match(command,/STOP:/);}
 assert.match(guide.stages[2].commands[1],/git merge --ff-only/);assert.match(guide.stages[2].commands[1],/working tree is not clean/);
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

test('aligned copy controls retain the whole command with inline non-overlapping feedback',()=>{
 const c=context();c.workflow.draft={'upgrade-guide-stage':{value:'7'}};
 const helperSource=readFileSync(new URL('../src/ui-primitives.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');
 const ctx={esc};vm.createContext(ctx);vm.runInContext(helperSource,ctx);
 const guide=createByoUpgradeGuide(client,c),html=renderByoUpgradeGuide(client,c,{esc,copyValue:ctx.copyValue});
 assert.match(html,/byo-guide-command-heading/);assert.match(html,/class="copy-button guide-copy"/);assert.match(html,/class="guide-copy-feedback" data-copy-feedback aria-live="polite"/);
 const value=html.match(/class="copy-button guide-copy"[^>]*data-copy-value="([^"]*)"/)[1].replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
 assert.equal(value,guide.stages[6].commands[0]);
 const css=readFileSync(new URL('../src/ui-consistency.css',import.meta.url),'utf8');assert.match(css,/\.byo-upgrade-guide \.copy-button\[data-copied=true\]::after\{display:none;content:none\}/);assert.match(css,/white-space:pre;overflow-wrap:normal;overflow:auto/);
});
test('actual upgrade view embeds the guide for approved BYO while retaining current workflow',async()=>{
 const c=approved(context());c.workflow.draft={'upgrade-guide-stage':{value:'10'}};const state={authenticated:true,currentUser:{role:'master_admin'},selectedClient:client,clientData:c.detail,backendInventory:c.inventory,backendUpgrade:{clientId:1,...c.workflow}};
 const ctx={pState:state,pb:{supabaseUrl:c.platformUrl},renderByoUpgradeGuide,hasUpgradePlan,upgradeActionAllowed,...helpers,technicalRows:()=>'',evidenceDetails:()=>'',releaseName:s=>s||'Unknown'};vm.createContext(ctx);
 const src=readFileSync(new URL('../src/upgrade-view.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');vm.runInContext(src,ctx);
 const html=ctx.renderUpgradePanel(client,true);assert.match(html,/Customer CLI instructions/);assert.match(html,/10\. Authorized installation/);assert.match(html,/Download private customer clearance/);assert.match(html,/--apply/);assert.equal(ctx.renderUpgradePanel(client,false),'');
 let guideSource;ctx.renderByoUpgradeGuide=(c,context,h)=>{guideSource=context.source;return renderByoUpgradeGuide(c,context,h);};
 state.backendUpgrade.job.state='completed_reviewed';ctx.renderUpgradePanel(client,true);assert.equal(guideSource,'','History must not become the next reviewed source');state.backendUpgrade.job.state='approved';
 state.selectedClient={...client,id:2};assert.doesNotMatch(ctx.renderUpgradePanel(client,true),/Customer CLI instructions/);
  // Exercise the existing input hook: selecting a source updates commands immediately,
  // while assessment typing does not rerender and disturb the customer's input.
  state.selectedClient=client;state.page='client-detail';let renders=0;ctx.render=()=>renders++;
  const events=readFileSync(new URL('../src/events.js',import.meta.url),'utf8'),hook=events.match(/const rememberUpgrade=event=>\{[\s\S]*?\n  \};/)[0];vm.runInContext(hook+'\nglobalThis.rememberUpgrade=rememberUpgrade;',ctx);
  ctx.rememberUpgrade({type:'change',target:{id:'upgrade-source',value:v6.sha256,matches:()=>true}});assert.equal(renders,1);assert.equal(state.backendUpgrade.draft['upgrade-source'].value,v6.sha256);
  ctx.rememberUpgrade({type:'input',target:{id:'upgrade-assessment',value:'typing',matches:()=>true}});assert.equal(renders,1);
  const savedWorkflow=state.backendUpgrade;state.backendUpgrade=null;
  ctx.rememberUpgrade({type:'change',target:{id:'upgrade-guide-stage',value:'2',matches:()=>true,closest:()=>({dataset:{clientId:'1'}})}});
  assert.equal(state.backendUpgrade.clientId,1);assert.equal(state.backendUpgrade.draft['upgrade-guide-stage'].value,'2');assert.equal(state.backendUpgrade.statusLoaded,undefined);state.backendUpgrade=savedWorkflow;
  ctx.captureView=()=>({role:'master_admin',page:'client-detail'});ctx.viewCurrent=()=>true;ctx.document={querySelectorAll:()=>[]};ctx.notify={error:()=>{}};
  let remoteCalls=0;ctx.pb.rpc=()=>{remoteCalls++;throw Error('Guide browsing must be local');};
  const handler=readFileSync(new URL('../src/backend-upgrade.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');vm.runInContext('(function(){'+handler+';globalThis.handleUpgrade=handleUpgrade;})()',ctx);
  const request=state.backendUpgrade.job.request_id;await ctx.handleUpgrade('upgrade-guide-back',()=>{});assert.equal(state.backendUpgrade.draft['upgrade-guide-stage'].value,'9');assert.equal(state.backendUpgrade.job.request_id,request);assert.equal(remoteCalls,0);
});
