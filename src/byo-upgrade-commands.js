// Complete PowerShell blocks. Each runs in its own scope and restores its inputs.
export const powershellValue=value=>"'"+String(value).replaceAll("'","''")+"'";
const block=body=>`& {\n$ErrorActionPreference = 'Stop'\n${body.trim()}\n}`;
const checked=(command,message)=>`${command}\nif ($LASTEXITCODE -ne 0) { throw ${powershellValue('STOP: '+message)} }`;
export function upgradeGuideCommands(c){
 const q=powershellValue;
 const identity=`$ShopRef = ${q(c.ref)}\n$ClientId = ${c.clientId}\n$PlatformRef = ${q(c.platform)}\n$TargetSha = ${q(c.target)}\n$ExpectedSourceId = ${q(c.sourceId)}\n$ExpectedBinding = ${q(c.binding)}`;
 const repo=`$Repo = ${c.shopPath?q(c.shopPath):"Read-Host 'Full Shop folder path only (example C:\\Users\\ExampleUser\\Desktop\\Development\\Orbitoshopv2-v1); no cd or Set-Location'"}
if ([string]::IsNullOrWhiteSpace($Repo) -or $Repo -match '^\\s*(cd|Set-Location)\\s') { throw 'STOP: paste the directory path only, not a command.' }
$Repo = $Repo.Trim().Trim('"')
if (-not (Test-Path -LiteralPath $Repo -PathType Container)) { throw 'STOP: Shop folder not found. Check the complete path, including spaces/parentheses.' }
Set-Location -LiteralPath $Repo
$Repo = (Get-Location).Path`;
 const files=`foreach ($File in @('scripts/release-preflight.mjs','scripts/inspect-backend.mjs','scripts/upgrade-backend.mjs')) {
 if (-not (Test-Path -LiteralPath (Join-Path $Repo $File) -PathType Leaf)) { throw 'STOP: required Shop script missing. Use stage 3 safe fast-forward recovery, then retry this whole block.' }
}`;
 const privateFolder=`${c.privatePath?`$Private = ${q(c.privatePath)}`:`$DefaultPrivate = Join-Path $env:USERPROFILE ${q('RetraSell-BYO-Private/client-'+c.clientId+'-'+c.targetRelease)}
$Private = Read-Host "Original final client folder (Enter = $DefaultPrivate); restore your prior location if different"
if ([string]::IsNullOrWhiteSpace($Private)) { $Private = $DefaultPrivate }`}
$Private = $Private.Trim().Trim('"')
if (-not [IO.Path]::IsPathRooted($Private) -or $Private.StartsWith('\\\\')) { throw 'STOP: use an absolute local private folder, not a relative/network path.' }
$Private = [IO.Path]::GetFullPath($Private)
foreach ($Synced in @($env:OneDrive,$env:OneDriveCommercial,$env:OneDriveConsumer)) {
 if ($Synced -and ($Private -eq $Synced -or $Private.StartsWith($Synced.TrimEnd('\\')+'\\',[StringComparison]::OrdinalIgnoreCase))) { throw 'STOP: use a private folder outside synced/shared directories.' }
}
$Cursor = [IO.DirectoryInfo]$Private
while ($Cursor) {
 if (Test-Path -LiteralPath (Join-Path $Cursor.FullName '.git')) { throw 'STOP: private files must stay outside Git repositories.' }
 $Cursor = $Cursor.Parent
}
New-Item -ItemType Directory -Path $Private -Force | Out-Null`;
 const readJson=`function Read-GuideJson($File,$Kind) {
 if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "STOP: $Kind file was not created or cannot be found. Keep original files; correct the path." }
 try { return Get-Content -Raw -LiteralPath $File | ConvertFrom-Json } catch { throw "STOP: $Kind JSON is unreadable. Inspect it privately; do not replace the journal or clearance." }
}`;
 const source=c.source?`$FromSha = ${q(c.source)}`:'';
 const journal=`$Original = $null
$Journal = Join-Path $Private 'upgrade-journal.json'
$OriginalJournal = Read-Host 'Original journal path if different (Enter reuses upgrade-journal.json). For an attempted v7 upgrade, always restore its original journal'
if (-not [string]::IsNullOrWhiteSpace($OriginalJournal)) {
 $Journal = $OriginalJournal.Trim().Trim('"')
 if (-not (Test-Path -LiteralPath $Journal -PathType Leaf)) { throw 'STOP: original journal not found. Locate it; do not create a replacement.' }
}
if (Test-Path -LiteralPath $Journal) {
 $Original = Read-GuideJson $Journal 'Original journal'
 if ($Original.contract -ne 'retrasell-backend-upgrade-v2' -or $Original.mode -ne 'byo' -or $Original.project -ne $ShopRef -or $Original.client -ne $ClientId -or $Original.source -ne $FromSha -or $Original.target -ne $TargetSha) { throw 'STOP: this journal belongs to another source/target or Shop. Preserve it and reconcile the original operation.' }
}
# No journal is created or overwritten here. Review mode only writes its new assessment.`;
 const preflight=checked('node scripts/release-preflight.mjs --expected-sha $TargetSha | Out-Null','release preflight failed. Restore the reviewed Shop source; do not regenerate v7.');
 const unique=(variable,prefix)=>`$${variable} = Join-Path $Private ('${prefix}-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')`;
 const reportIdentity=`function Assert-GuideIdentity($Report) {
 if ($Report.project_ref -ne $ShopRef -or $Report.client_id -ne $ClientId -or $Report.source_id -ne $ExpectedSourceId -or $Report.client_binding -ne $ExpectedBinding) { throw 'STOP: report identity/binding differs from this selected Shop. Do not submit it.' }
}`;
 const assessmentCheck=`Assert-GuideIdentity $Report
if ($Report.contract -ne 'retrasell-byo-upgrade-assessment-v1' -or $Report.source_sha256 -ne $FromSha -or $Report.target_sha256 -ne $TargetSha) { throw 'STOP: assessment contract or source/target differs. Preserve the report and reconcile it.' }
$Plan = $Report.plan
if ($Plan.contract -ne 'retrasell-controlled-upgrade-v1' -or $Plan.compatibility -ne 'additive-protocol-1' -or $Plan.project_ref -ne $ShopRef -or $Plan.client_id -ne $ClientId -or $Plan.source_id -ne $ExpectedSourceId -or $Plan.client_binding -ne $ExpectedBinding -or $Plan.source_sha256 -ne $FromSha -or $Plan.target_sha256 -ne $TargetSha -or @($Plan.steps).Count -lt 1) { throw 'STOP: assessment plan does not match this exact approved source/target/binding.' }
foreach ($Step in $Plan.steps) { if ($Step.type -notin @('migration','function') -or $Step.sha256 -notmatch '^[a-f0-9]{64}$' -or -not $Step.name) { throw 'STOP: incomplete planned-step evidence.' } }
if ($Report.observation.shop.client_id -ne $ClientId -or $Report.observation.shop.source_id -ne $ExpectedSourceId -or $Report.observation.shop.client_binding -ne $ExpectedBinding -or $Report.observation.shop.owner_ready -ne $true -or $Report.observation.runtime_ready -ne $true -or @($Report.observation.migrations).Count -lt 1 -or @($Report.observation.functions).Count -lt 1) { throw 'STOP: current customer observation/readiness is incomplete or mismatched.' }`;
 const inventory=(suffix)=>block(`${identity}\n${repo}\n${files}\n${privateFolder}\n${readJson}\n${reportIdentity}\n${preflight}\n${unique('Inventory','inventory-'+suffix)}
${checked('node scripts/inspect-backend.mjs --project-ref $ShopRef --client-id $ClientId --report $Inventory | Out-Null','inventory failed; no successful inventory is established. Correct the reported identity/access/path problem and retry this whole block with a new report name.')}
$Report = Read-GuideJson $Inventory 'Inventory'
Assert-GuideIdentity $Report
if ($Report.read_only -ne $true -or -not $Report.evidence) { throw 'STOP: inventory report is incomplete or not the read-only contract.' }
if ($Report.compliance -eq 'drift') { throw 'STOP: inventory found drift. Retain the report and reconcile before assessment.' }
Write-Output "PASS: inventory saved and identity checked: $Inventory"
Write-Output ('Review limitations: '+(@($Report.limitations) -join '; '))
Write-Output "Compliance: $($Report.compliance). Independent source: $($Report.verified_release.release_id). Empty/pending is NOT installation verification; review limitations before continuing."`);
 const update=block(`${repo}
$Origin = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $Origin -notmatch 'github\\.com[:/]zaighaumrana/Orbitoshopv2-v1(?:\\.git)?$') { throw 'STOP: this is not the approved Shop repository.' }
$Branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $Branch -ne 'feature/shop-modernization-m2') { throw 'STOP: branch differs. Ask the owner to review it; do not force-switch.' }
$Dirty = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $Dirty) { throw 'STOP: working tree is not clean. Preserve changes and ask for review; no pull/reset was performed.' }
${checked('git fetch origin feature/shop-modernization-m2','fetch failed. Check Git authentication/network, preserve this checkout.')}
${checked('git merge-base --is-ancestor HEAD origin/feature/shop-modernization-m2','local commits diverge from the reviewed branch. Stop for owner review; never reset or force-pull.')}
${checked('git merge --ff-only origin/feature/shop-modernization-m2','fast-forward failed. Stop for review; preserve local work.')}
${files}
Write-Output 'PASS: clean M2 Shop branch fast-forwarded; all required scripts exist.'`);
 const assessment=c.source?block(`${identity}\n${source}\n${repo}\n${files}\n${privateFolder}\n${readJson}\n${reportIdentity}\n${journal}\n${preflight}\n${unique('Assessment','upgrade-assessment')}
${checked('node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --report $Assessment --review | Out-Null','assessment failed. No successful assessment exists; correct the named input/access/provenance problem before retrying the whole block.')}
$Report = Read-GuideJson $Assessment 'Assessment'
${assessmentCheck}
$Sql = @($Plan.steps | Where-Object type -eq 'migration').Count
$Functions = @($Plan.steps | Where-Object type -eq 'function').Count
Write-Output "PASS: read-only assessment created and identity/source/target/plan checked: $Assessment"
Write-Output "Planned migrations: $Sql; changed functions: $Functions. Review these before submitting; no Shop database writes occurred."`):null;
 const openAssessment=c.source?block(`${identity}\n${source}\n${privateFolder}\n${readJson}\n${reportIdentity}
$Assessment = Read-Host 'Full path of the successful upgrade-assessment-*.json report (not a journal or clearance)'
$Assessment = $Assessment.Trim().Trim('"')
$Report = Read-GuideJson $Assessment 'Assessment'
${assessmentCheck}
Write-Output 'PASS: this assessment matches the selected Shop/source/target. Copy its complete JSON into Customer read-only assessment.'
notepad $Assessment`):null;
 const apply=c.request?block(`${identity}\n$FromSha = ${q(c.approvedSource)}\n$ExpectedRequest = ${q(c.request)}\n$ExpectedPlanSha = ${q(c.planSha)}\n${repo}\n${files}\n${privateFolder}\n${readJson}\n${journal}\n${preflight}
if ($Original -and $Original.request_id -ne $ExpectedRequest) { throw 'STOP: original journal request differs from this approval. Reconcile it; never create a replacement.' }
$Approval = Join-Path $Private ${q('retrasell-upgrade-'+c.request+'.json')}
$Clearance = Read-GuideJson $Approval 'Private clearance'
if ($Clearance.contract -ne 'retrasell-byo-upgrade-clearance-v1' -or $Clearance.request_id -ne $ExpectedRequest -or $Clearance.platform_url -ne "https://$PlatformRef.supabase.co" -or $Clearance.plan_sha256 -ne $ExpectedPlanSha -or $Clearance.plan.project_ref -ne $ShopRef -or $Clearance.plan.client_id -ne $ClientId -or $Clearance.plan.source_sha256 -ne $FromSha -or $Clearance.plan.target_sha256 -ne $TargetSha) { throw 'STOP: clearance differs from this exact approved request/plan. Keep it private and request original-status review.' }
${checked('node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --approval-file $Approval --platform-project-ref $PlatformRef --apply','installation did not complete successfully. Preserve original journal/request/clearance and reconcile status before retrying.')}
$Final = Read-GuideJson $Journal 'Original journal'
if ($Final.request_id -ne $ExpectedRequest -or $Final.project -ne $ShopRef -or $Final.client -ne $ClientId -or $Final.source -ne $FromSha -or $Final.target -ne $TargetSha -or $Final.state -ne 'verification_required') { throw 'STOP: final component receipt is not established. Review the original Platform job.' }
Write-Output 'PASS: original installation reached verification_required. Independent source review and final owner acceptance are still pending.'`):null;
 return {identity,update,inspect:inventory('before'),assessment,openAssessment,apply,verify:inventory('after'),
  identify:block(`${identity}\nWrite-Output "Client #$ClientId; Shop $ShopRef; Platform $PlatformRef; target $TargetSha. Compare these with the customer Dashboard."`),
  tools:block(`foreach ($Tool in @('git','node','supabase')) {
 if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { throw "STOP: $Tool is missing from PATH. Install only the missing tool, reopen PowerShell and retry." }
 $Version = & $Tool --version
 if ($LASTEXITCODE -ne 0) { throw "STOP: $Tool version check failed." }
 if ($Tool -eq 'node' -and $Version -notmatch '^v(?:2[4-9]|[3-9]\\d)\\.') { throw 'STOP: this workflow requires Node 24 or later. Install the reviewed Node version and reopen PowerShell.' }
 Write-Output "$($Tool): $Version"
}
Write-Output 'PASS: required commands are available. Check that Node reports v24 or later; CLI capabilities are checked by preflight/inspection.'`),
  scoop:block(`# Only if Scoop is missing and organizational policy allows this in non-admin PowerShell:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) { throw 'STOP: Scoop installation did not establish its command. Reopen PowerShell and repair PATH.' }`),
  install:block(`# Run only missing packages; do not reinstall tools that already work.
scoop install git
if ($LASTEXITCODE -ne 0) { throw 'STOP: Git installation failed.' }
scoop install nodejs-lts
if ($LASTEXITCODE -ne 0) { throw 'STOP: Node installation failed.' }
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
if ($LASTEXITCODE -ne 0) { throw 'STOP: Supabase bucket setup failed. Check existing buckets; do not blindly repeat setup.' }
scoop install supabase
if ($LASTEXITCODE -ne 0) { throw 'STOP: Supabase installation failed.' }
supabase --version
if ($LASTEXITCODE -ne 0) { throw 'STOP: reopen PowerShell and repair native Supabase PATH.' }`),
  checkout:block(`${repo}
${checked('git remote -v','not a readable Git checkout.')}
${checked('git branch --show-current','branch could not be read.')}
${checked('git rev-parse HEAD','source revision could not be read.')}
${checked('git status --short','working tree status could not be read.')}
${files}
Write-Output 'PASS: required scripts exist. Review remote/branch/revision and cleanliness before stage 4.'`),
  preflight:block(`${identity}\n${repo}\n${files}\n${preflight}\nWrite-Output 'PASS: customer release preflight matched the approved target. No private Platform checkout is required.'`),
  account:block(`${identity}
${checked('supabase login','customer CLI login failed. Use the authorized customer account.')}
$ProjectText = supabase projects list --output json
if ($LASTEXITCODE -ne 0) { throw 'STOP: project access could not be listed. Fix customer authentication first.' }
try { $Projects = @(($ProjectText -join [Environment]::NewLine) | ConvertFrom-Json) } catch { throw 'STOP: project list is not readable JSON. Check native CLI compatibility.' }
if (-not ($Projects | Where-Object id -eq $ShopRef)) { throw 'STOP: this customer account cannot see the exact BYO Shop. Obtain access; never substitute another project.' }
Write-Output "PASS: authenticated account lists exact customer Shop $ShopRef."`)};
}
