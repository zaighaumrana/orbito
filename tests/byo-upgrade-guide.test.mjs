import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import vm from 'node:vm';
import {spawnSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../../Orbitoshopv2-v1/scripts/upgrade-contract.mjs';
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

async function guideFileFixture(t){
 const root=mkdtempSync(join(tmpdir(),'retrasell-guide-files-'));
 t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
 const privateDir=join(root,'private client (1)'),emptyDir=join(root,'empty private'),downloads=join(root,'chosen download location');
 for(const dir of [privateDir,emptyDir,downloads])mkdirSync(dir);
 const c=approved(context()),j=c.workflow.job;
 const binding={client_id:1,project_ref:ref,source_id:id,client_binding:'fixture-1'};
 const observation={shop:{client_id:1,source_id:id,client_binding:'fixture-1',owner_ready:true,owner_busy:false,invalid_config_receipts:0},runtime_ready:true,migrations:[{version:'20261023000000',name:'fixture',sha256:'b'.repeat(64)}],functions:[{name:'platform-bridge',present:true,verify_jwt:true}]};
 const plan={contract:'retrasell-controlled-upgrade-v1',...binding,source_sha256:v6.sha256,target_sha256:v7.sha256,compatibility:'additive-protocol-1',steps:j.plan.steps,source_evidence:{migrations:observation.migrations,functions:observation.functions}};
 j.plan=plan;j.plan_sha256=await digest(plan);j.customer_expires_at=new Date(Date.now()+3600000).toISOString();
 c.workflow.draft={'upgrade-guide-shop-path':{value:fileURLToPath(new URL('../../Orbitoshopv2-v1',import.meta.url))},'upgrade-guide-private-path':{value:privateDir}};
 const report={contract:'retrasell-byo-upgrade-assessment-v1',...binding,source_sha256:v6.sha256,target_sha256:v7.sha256,observation,plan};
 const clearance={contract:'retrasell-byo-upgrade-clearance-v1',request_id:j.request_id,platform_url:`https://${platform}.supabase.co`,platform_public_key:'synthetic-public-key',plan,plan_sha256:j.plan_sha256,token:'e'.repeat(64)};
 const commands=()=>createByoUpgradeGuide(client,c).stages;
 const q=powershellValue,write=(path,value)=>writeFileSync(path,JSON.stringify(value));
 return {root,privateDir,emptyDir,downloads,c,j,report,clearance,commands,q,write};
}

test('Windows PowerShell 5.1 stage 8 discovers one assessment, requires explicit multiple selection and rejects invalid evidence',async t=>{
 const f=await guideFileFixture(t),{q}=f,a=join(f.privateDir,'upgrade-assessment-a.json'),b=join(f.privateDir,'upgrade-assessment-b.json');
 f.write(a,f.report);f.write(join(f.privateDir,'upgrade-assessment-mismatch.json'),{...f.report,client_id:2});
 writeFileSync(join(f.privateDir,'upgrade-assessment-malformed.json'),'{bad JSON');f.write(join(f.privateDir,'unrelated-clearance.json'),f.clearance);
 f.write(join(f.emptyDir,'upgrade-assessment-wrong.json'),{...f.report,project_ref:'wrong'});
 const discover=f.commands()[7].commands[0];
 f.c.workflow.draft['upgrade-guide-private-path'].value=f.emptyDir;const missing=f.commands()[7].commands[0];
 const output=runPowerShell51(`
$script:Opened=@(); $script:Prompts=@()
function notepad { $script:Opened += $args[0] }
function Read-Host { param($Prompt) $script:Prompts += $Prompt; if ($Prompt -match 'Multiple valid') { '2' } else { 'FRESH' } }
${discover}
Expect ($script:Opened.Count -eq 1 -and $script:Opened[0] -eq ${q(a)}) 'Exactly one valid report must open automatically'
Expect ($script:Prompts.Count -eq 1 -and $script:Prompts[0] -match 'no collection timestamp') 'Untimestamped CLI contract needs explicit freshness acknowledgment'
[IO.File]::Copy(${q(a)},${q(b)},$false)
$script:Prompts=@()
${discover}
Expect ($script:Opened.Count -eq 2 -and $script:Opened[1] -eq ${q(b)}) 'Multiple valid reports must use explicit numbered choice'
Expect ($script:Prompts[0] -match 'Multiple valid') 'Must not blindly select newest report'
$Failure=''
try { ${missing} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'No valid assessment found') 'Mismatched-only folder must fail without opening a file'
Expect ($script:Opened.Count -eq 2) 'Invalid/missing evidence must never open'
Write-Output 'PASS: focused assessment discovery.'`);
 assert.match(output,/REJECTED: upgrade-assessment-malformed/);assert.match(output,/REJECTED: upgrade-assessment-mismatch/);assert.doesNotMatch(output,new RegExp('e'.repeat(64)));
});

test('Windows PowerShell 5.1 stages 9-10 prepare exact clearance without overwrites or journal changes and stop before apply',async t=>{
 const f=await guideFileFixture(t),{q}=f,download=join(f.downloads,'downloaded clearance.json'),dest=join(f.privateDir,`retrasell-upgrade-${f.j.request_id}.json`),journal=join(f.privateDir,'upgrade-journal.json');
 f.write(download,f.clearance);
 f.write(journal,{contract:'retrasell-backend-upgrade-v2',mode:'byo',project:ref,client:1,source:v6.sha256,target:v7.sha256,request_id:f.j.request_id,plan_sha256:f.j.plan_sha256,state:'paused',steps:{}});
 const wrong=join(f.downloads,'wrong-request.json'),fingerprint=join(f.downloads,'wrong-fingerprint.json'),conflict=join(f.downloads,'conflicting-clearance.json');
 f.write(wrong,{...f.clearance,request_id:id});f.write(fingerprint,{...f.clearance,plan_sha256:'a'.repeat(64)});f.write(conflict,{...f.clearance,token:'d'.repeat(64)});
 const stage9=f.commands()[8].commands[0],stage10=f.commands()[9].commands[0];
 f.c.workflow.draft['upgrade-guide-private-path'].value=f.emptyDir;const absent=f.commands()[9].commands[0];
 const output=runPowerShell51(`
$script:NodeExe = (Get-Command node).Source
$script:Download=${q(download)}; $script:Prompts=@(); $script:ApplyCount=0
function Read-Host { param($Prompt) $script:Prompts += $Prompt; if ($Prompt -match 'Full path of the downloaded') { return $script:Download }; return '' }
function node {
 if ($args[0] -eq '--input-type=module') { & $script:NodeExe @args; $global:LASTEXITCODE=$LASTEXITCODE; return }
 if ($args[0] -eq 'scripts/release-preflight.mjs') { $global:LASTEXITCODE=0; return }
 if ($args[0] -eq 'scripts/upgrade-backend.mjs' -and $args -contains '--apply') { $script:ApplyCount++; throw 'TEST: installation boundary intercepted; executor not run' }
 throw 'Unexpected Node command in fixture'
}
$JournalBefore = [IO.File]::ReadAllText(${q(journal)})
${stage9}
Expect ((Test-Path -LiteralPath ${q(dest)}) -and (Test-Path -LiteralPath ${q(download)})) 'Valid clearance must be copied while original download remains'
$DestinationBefore = [IO.File]::ReadAllText(${q(dest)})
$WrittenBefore = (Get-Item -LiteralPath ${q(dest)}).LastWriteTimeUtc
${stage9}
Expect ((Get-Item -LiteralPath ${q(dest)}).LastWriteTimeUtc -eq $WrittenBefore) 'Matching destination must not be replaced'
foreach ($Case in @(@{File=${q(wrong)};Error='wrong clearance request'},@{File=${q(fingerprint)};Error='wrong clearance plan fingerprint'},@{File=${q(conflict)};Error='conflicting existing clearance'},@{File=${q(f.downloads)};Error='directory, not a JSON file'})) {
 $script:Download=$Case.File; $Failure=''
 try { ${stage9} } catch { $Failure=$_.Exception.Message }
 Expect ($Failure -match $Case.Error) ('Expected precise clearance failure: '+$Case.Error)
 Expect ([IO.File]::ReadAllText(${q(dest)}) -ceq $DestinationBefore) 'Invalid/conflicting input must never overwrite destination'
}
$script:Download=''; $script:Prompts=@(); $Failure=''
try { ${absent} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'Private clearance file cannot be found') 'Missing clearance must stop'
Expect ($script:Prompts.Count -eq 1 -and $script:Prompts[0] -match 'downloaded clearance') 'Missing clearance must stop before original-journal prompt'
# A supplied original clearance may be prepared, but requires a separate install invocation.
$script:Download=${q(download)}; $script:Prompts=@(); $Failure=''
try { ${absent} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'clearance prepared only; installation did not start') 'Recovery must never flow automatically into apply'
Expect ($script:Prompts.Count -eq 1 -and $script:ApplyCount -eq 0) 'Preparation cannot ask for journal or invoke installation'
$script:Prompts=@(); $Failure=''
try { ${stage10} } catch { $Failure=$_.Exception.Message }
Expect ($Failure -match 'installation boundary intercepted') 'Valid local prerequisites must reach unchanged explicit executor boundary'
Expect ($script:ApplyCount -eq 1 -and $script:Prompts.Count -eq 1 -and $script:Prompts[0] -match 'Original execution journal') 'Only explicit stage 10 reaches executor after checking journal'
Expect ([IO.File]::ReadAllText(${q(journal)}) -ceq $JournalBefore) 'Original journal must be byte-for-byte preserved'
Write-Output 'PASS: focused private-clearance preparation and preflight; no executor/provider operations.'`);
 assert.match(output,/existing matching valid clearance preserved/);assert.doesNotMatch(output,new RegExp('e'.repeat(64)));
});

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
 const html=ctx.renderUpgradePanel(client,true);assert.match(html,/Customer CLI instructions/);assert.match(html,/10\. Authorized installation/);assert.match(html,/Download private customer clearance/);assert.match(html,/Stage 9, and run its clearance preparation block/);assert.match(html,/misplaced download needs no new request or journal/);assert.match(html,/--apply/);assert.equal(ctx.renderUpgradePanel(client,false),'');
 let guideSource;ctx.renderByoUpgradeGuide=(c,context,h)=>{guideSource=context.source;return renderByoUpgradeGuide(c,context,h);};
 state.backendUpgrade.job.state='completed_reviewed';ctx.renderUpgradePanel(client,true);assert.equal(guideSource,'','History must not become the next reviewed source');state.backendUpgrade.job.state='approved';
 state.selectedClient={...client,id:2};assert.doesNotMatch(ctx.renderUpgradePanel(client,true),/class="evidence-details byo-upgrade-guide"/);
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
