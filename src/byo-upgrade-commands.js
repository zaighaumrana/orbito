// Complete PowerShell blocks. Each runs in its own scope and restores its inputs.
export const powershellValue=value=>"'"+String(value).replaceAll("'","''")+"'";
const block=body=>`& {\n$ErrorActionPreference = 'Stop'\n${body.trim()}\n}`;
const checked=(command,message)=>`${command}\nif ($LASTEXITCODE -ne 0) { throw ${powershellValue('STOP: '+message)} }`;
const toolVersion=`function Get-GuideToolVersion([string] $Tool) {
 if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { return $null }
 $Version = (& $Tool --version) -join [Environment]::NewLine
 if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Version)) { throw "STOP: installed $Tool failed its version check. Repair its native PATH/installation; do not reinstall blindly." }
 if ($Tool -eq 'git' -and $Version -notmatch '^git version \\d+\\.') { throw 'STOP: Git version output is not recognized. Repair the existing Git installation.' }
 if ($Tool -eq 'node') {
  if ($Version -notmatch '^v(\\d+)\\.' -or [int]$Matches[1] -lt 24) { throw 'STOP: installed Node must be v24 or later. Update it through its original installer, reopen PowerShell and retry.' }
 }
 if ($Tool -eq 'supabase' -and $Version -notmatch '^v?\\d+\\.\\d+\\.\\d+') { throw 'STOP: native Supabase version output is not recognized. Repair its installation/PATH.' }
 return $Version.Trim()
}`;
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
try { New-Item -ItemType Directory -Path $Private -Force | Out-Null } catch { throw 'STOP: private directory is inaccessible. Check its local path and permissions; preserve existing files.' }`;
 const readJson=`function Read-GuideJson($File,$Kind) {
 if (Test-Path -LiteralPath $File -PathType Container) { throw "STOP: $Kind path is a directory, not a JSON file. Select the complete filename using Explorer Copy as path." }
 if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "STOP: $Kind file cannot be found at the selected full path. Keep original files; correct the path." }
 if ((Get-Item -LiteralPath $File).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "STOP: $Kind must be a regular local file, not a link." }
 try {
  $Text = Get-Content -Raw -LiteralPath $File
  if (-not $Text.TrimStart().StartsWith('{')) { throw 'Expected a JSON object.' }
  return $Text | ConvertFrom-Json -ErrorAction Stop
 } catch { throw "STOP: $Kind JSON is unreadable or not an object. Inspect it privately; do not replace the journal or clearance." }
}`;
 const source=c.source?`$FromSha = ${q(c.source)}`:'';
 const journal=`$Original = $null
$Journal = Join-Path $Private 'upgrade-journal.json'
$OriginalJournal = Read-Host 'Original execution journal path: Enter uses upgrade-journal.json only if this exact upgrade never started with a different journal. If installation started, reuse its original journal. Downloaded clearance is NOT the journal; never replace a journal to bypass an interrupted/uncertain operation'
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
 const assessmentFileCheck=`${assessmentCheck}
if ($Plan.steps -isnot [array] -or $Report.observation.migrations -isnot [array] -or $Report.observation.functions -isnot [array]) { throw 'STOP: assessment plan/evidence lists are not arrays.' }
if ($Report.observation.shop.owner_busy -ne $false -or $null -eq $Report.observation.shop.invalid_config_receipts -or [double]$Report.observation.shop.invalid_config_receipts -ne 0) { throw 'STOP: assessment reports pending owner/configuration work.' }
foreach ($Migration in $Report.observation.migrations) { if ($Migration.version -isnot [string] -or $Migration.name -isnot [string] -or $Migration.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'STOP: incomplete assessment migration evidence.' } }
foreach ($Function in $Report.observation.functions) { if ($Function.name -isnot [string] -or $Function.present -isnot [bool] -or $Function.verify_jwt -isnot [bool]) { throw 'STOP: incomplete assessment function evidence.' } }
$Stamp = $Report.generated_at
if (-not $Stamp) { $Stamp = $Report.checked_at }
if ($Stamp) {
 try { $Collected = [DateTimeOffset]::Parse($Stamp) } catch { throw 'STOP: invalid assessment collection timestamp.' }
 if ($Collected -gt [DateTimeOffset]::UtcNow.AddMinutes(5) -or $Collected -lt [DateTimeOffset]::UtcNow.AddHours(-24)) { throw 'STOP: assessment is stale or has a future collection time. Return to Stage 7 for current evidence.' }
}
if ($Report.expires_at) {
 try { $Expiry = [DateTimeOffset]::Parse($Report.expires_at) } catch { throw 'STOP: invalid assessment expiry.' }
 if ($Expiry -le [DateTimeOffset]::UtcNow) { throw 'STOP: assessment expired. Return to Stage 7.' }
}
${c.approvedSteps?`$ApprovedSteps = ${q(JSON.stringify(c.approvedSteps))} | ConvertFrom-Json
if (@($Plan.steps).Count -ne @($ApprovedSteps).Count) { throw 'STOP: assessment steps differ from the original approved plan.' }
for ($Index=0; $Index -lt @($ApprovedSteps).Count; $Index++) {
 foreach ($Key in @('name','type','sha256')) { if (@($Plan.steps)[$Index].$Key -cne @($ApprovedSteps)[$Index].$Key) { throw 'STOP: assessment step differs from the original approved plan.' } }
}`:''}`;
 const openAssessment=c.source?block(`${identity}\n${source}\n${privateFolder}\n${readJson}\n${reportIdentity}
function Read-ValidAssessment($File) {
 $Report = Read-GuideJson $File 'Assessment'
 ${assessmentFileCheck}
 return $Report
}
$Candidates = @()
foreach ($File in (Get-ChildItem -LiteralPath $Private -Filter 'upgrade-assessment-*.json' -File | Sort-Object Name)) {
 try {
  $Candidate = Read-ValidAssessment $File.FullName
  $Candidates += $File
  Write-Output ("{0}. {1} | written UTC {2:o} | client {3}; project {4}; source {5}; target {6}; SQL {7}; functions {8}" -f $Candidates.Count,$File.Name,$File.LastWriteTimeUtc,$Candidate.client_id,$Candidate.project_ref,$Candidate.source_sha256,$Candidate.target_sha256,@($Candidate.plan.steps | Where-Object { $_.type -eq 'migration' }).Count,@($Candidate.plan.steps | Where-Object { $_.type -eq 'function' }).Count)
 } catch { Write-Output ("REJECTED: {0}: {1}" -f $File.Name,$_.Exception.Message) }
}
if ($Candidates.Count -eq 0) { throw 'STOP: No valid assessment found in the selected private folder. Return to Stage 7 and generate a successful read-only assessment. Existing files were preserved.' }
$Choice = 1
if ($Candidates.Count -gt 1) {
 $Answer = Read-Host 'Multiple valid assessments found. Enter the listed NUMBER of the report you intend to submit; never choose by newest timestamp alone'
 if ($Answer -notmatch '^[1-9][0-9]*$' -or -not [int]::TryParse($Answer,[ref]$Choice) -or $Choice -gt $Candidates.Count) { throw 'STOP: explicit valid assessment selection required; no file was opened.' }
}
$Assessment = $Candidates[$Choice-1].FullName
$Report = Read-ValidAssessment $Assessment
if (-not ($Report.generated_at -or $Report.checked_at)) {
 $Fresh = Read-Host 'This report format has no collection timestamp. Only if freshly generated for this unchanged Shop, type FRESH; otherwise return to Stage 7'
 if ($Fresh -cne 'FRESH') { throw 'STOP: assessment freshness is not confirmed; no file was opened.' }
}
Write-Output 'PASS: Valid BYO assessment located; contract, identity, binding, compatible plan and required evidence checked.'
Write-Output "Client: $ClientId; Project: $ShopRef"
Write-Output ${q('Source: '+(c.sourceRelease||c.source)+'; Target: '+c.targetRelease)}
Write-Output ("Planned migrations: {0}; Changed functions: {1}" -f @($Report.plan.steps | Where-Object { $_.type -eq 'migration' }).Count,@($Report.plan.steps | Where-Object { $_.type -eq 'function' }).Count)
Write-Output "Assessment: $Assessment"
Write-Output 'Opening verified assessment in Notepad. Copy its complete JSON into the Platform assessment field. Local checks do not replace Platform validation or prove current installed source.'
notepad $Assessment`):null;
 const approvedContext=`${identity}\n$FromSha = ${q(c.approvedSource)}\n$ExpectedRequest = ${q(c.request)}\n$ExpectedPlanSha = ${q(c.planSha)}\n$KnownClearanceExpiry = ${q(c.clearanceExpiresAt||'')}`;
 const hashPlan="import {readFileSync} from 'node:fs'; try {const {digest}=await import('./scripts/upgrade-contract.mjs'); const r=JSON.parse(readFileSync(process.argv[1],'utf8')); process.stdout.write(await digest(r.plan));} catch {process.exitCode=1;}";
 const clearanceCheck=`function Get-GuideFileHash($File) {
 $Stream = [IO.File]::OpenRead($File)
 $Hash = [Security.Cryptography.SHA256]::Create()
 try { return [Convert]::ToBase64String($Hash.ComputeHash($Stream)) } finally { $Hash.Dispose(); $Stream.Dispose() }
}
function Assert-GuideClearance($File) {
 $Clearance = Read-GuideJson $File 'Private clearance'
 if ($Clearance.contract -cne 'retrasell-byo-upgrade-clearance-v1') { throw 'STOP: wrong JSON file; expected private customer clearance, not assessment or journal.' }
 if ($Clearance.request_id -cne $ExpectedRequest) { throw 'STOP: wrong clearance request ID. Locate the original approved request file; do not create a new request.' }
 if ($Clearance.platform_url -cne "https://$PlatformRef.supabase.co") { throw 'STOP: clearance Platform URL differs from this approved request.' }
 $Plan = $Clearance.plan
 if ($Plan.project_ref -cne $ShopRef -or $Plan.client_id -ne $ClientId -or $Plan.source_id -cne $ExpectedSourceId -or $Plan.client_binding -cne $ExpectedBinding) { throw 'STOP: clearance project/client/binding differs from this exact Shop.' }
 if ($Plan.source_sha256 -cne $FromSha -or $Plan.target_sha256 -cne $TargetSha) { throw 'STOP: clearance source/target differs from this approved upgrade.' }
 if ($Plan.contract -cne 'retrasell-controlled-upgrade-v1' -or $Plan.compatibility -cne 'additive-protocol-1' -or $Clearance.token -cnotmatch '^[a-f0-9]{64}$' -or -not ($Clearance.platform_public_key -is [string]) -or [string]::IsNullOrWhiteSpace($Clearance.platform_public_key)) { throw 'STOP: invalid private authorization format or compatible plan.' }
 if ($Clearance.plan_sha256 -cne $ExpectedPlanSha) { throw 'STOP: wrong clearance plan fingerprint.' }
 $ActualPlanSha = node --input-type=module -e ${q(hashPlan)} $File
 if ($LASTEXITCODE -ne 0) { throw 'STOP: clearance plan fingerprint could not be checked with the existing Shop contract. Check Node 24+ and the reviewed Shop checkout.' }
 if (($ActualPlanSha -join '').Trim() -cne $ExpectedPlanSha) { throw 'STOP: clearance plan contents do not match the approved fingerprint.' }
 foreach ($ExpiryText in @($KnownClearanceExpiry,$Clearance.expires_at)) {
  if ($ExpiryText) {
   try { $Expiry = [DateTimeOffset]::Parse($ExpiryText) } catch { throw 'STOP: invalid clearance expiry evidence. Load original upgrade status; preserve the file.' }
   if ($Expiry -le [DateTimeOffset]::UtcNow) { throw 'STOP: clearance expiry evidence has elapsed. Load original request status and review its existing clearance; do not restart the upgrade.' }
  }
 }
}
$Approval = Join-Path $Private ${q('retrasell-upgrade-'+c.request+'.json')}
function Prepare-GuideClearance {
 Write-Output 'Downloaded clearance is separate from the assessment and original execution journal. Keep it private. In Explorer use Copy as path on the downloaded JSON; paste the FULL filename, not its folder. Downloads is not assumed.'
 $Downloaded = Read-Host "Full path of the downloaded clearance (Enter reuses $Approval if it already exists)"
 if ([string]::IsNullOrWhiteSpace($Downloaded)) { $Downloaded = $Approval } else { $Downloaded = $Downloaded.Trim().Trim('"') }
 if (-not [IO.Path]::IsPathRooted($Downloaded) -or $Downloaded.StartsWith('\\\\')) { throw 'STOP: downloaded clearance needs an absolute local file path.' }
 Assert-GuideClearance $Downloaded
 if (Test-Path -LiteralPath $Approval) {
  Assert-GuideClearance $Approval
  if ((Get-GuideFileHash $Approval) -cne (Get-GuideFileHash $Downloaded)) { throw 'STOP: conflicting existing clearance file. Nothing was overwritten. Preserve both files and reconcile the SAME approved request.' }
  Write-Output 'SKIPPED: existing matching valid clearance preserved.'
 } else {
  try { [IO.File]::Copy($Downloaded,$Approval,$false) } catch { throw 'STOP: private clearance could not be copied without overwrite. Check private directory permissions or a conflicting file; preserve originals.' }
  Assert-GuideClearance $Approval
 }
 Write-Output 'PASS: Private customer clearance located and locally validated. Approved request matches this BYO Shop; clearance is available in the private client directory.'
 Write-Output 'Expiry/revocation is not proven locally. Loaded expiry evidence is checked when available; the existing CLI/server verifies current authorization at explicit installation. No installation was started.'
}`;
 const prepareClearance=c.request?block(`${approvedContext}\n${repo}\n${files}\n${privateFolder}\n${readJson}\n${clearanceCheck}\nPrepare-GuideClearance\nWrite-Output 'You may continue to Stage 10 as a separate explicit installation action.'`):null;
 const apply=c.request?block(`${approvedContext}\n${repo}\n${files}\n${privateFolder}\n${readJson}\n${clearanceCheck}
if (-not (Test-Path -LiteralPath $Approval -PathType Leaf)) {
 Write-Output 'Expected clearance is missing. Complete Stage 9 clearance preparation, or identify the original downloaded file below. This does not require a replacement journal or new approval.'
 Prepare-GuideClearance
 throw 'STOP: clearance prepared only; installation did not start. Review Stage 9 PASS, then run Stage 10 again to explicitly start installation.'
}
Assert-GuideClearance $Approval
Write-Output 'PASS: exact clearance is present and locally checked. The original execution journal is checked separately next.'
${journal}\n${preflight}
if ($Original -and ($Original.request_id -cne $ExpectedRequest -or $Original.plan_sha256 -cne $ExpectedPlanSha)) { throw 'STOP: original journal request/plan differs from this approval. Reconcile it; never create a replacement.' }
${checked('node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --approval-file $Approval --platform-project-ref $PlatformRef --apply','installation did not complete successfully. Preserve original journal/request/clearance and reconcile status before retrying.')}
$Final = Read-GuideJson $Journal 'Original journal'
if ($Final.request_id -ne $ExpectedRequest -or $Final.project -ne $ShopRef -or $Final.client -ne $ClientId -or $Final.source -ne $FromSha -or $Final.target -ne $TargetSha -or $Final.state -ne 'verification_required') { throw 'STOP: final component receipt is not established. Review the original Platform job.' }
Write-Output 'PASS: original installation reached verification_required. Independent source review and final owner acceptance are still pending.'`):null;
 return {identity,update,inspect:inventory('before'),assessment,openAssessment,prepareClearance,apply,verify:inventory('after'),
  identify:block(`${identity}\nWrite-Output "Client #$ClientId; Shop $ShopRef; Platform $PlatformRef; target $TargetSha. Compare these with the customer Dashboard."`),
  tools:block(`${toolVersion}
foreach ($Tool in @('git','node','supabase')) {
 $Version = Get-GuideToolVersion $Tool
 if (-not $Version) { throw "STOP: $Tool is missing from PATH. Use the missing-tool block, reopen PowerShell and retry." }
 Write-Output "PASS: $($Tool): $Version"
}
Write-Output 'PASS: required native commands and Node 24+ are available; capabilities are checked by preflight/inspection.'`),
  scoop:block(`${toolVersion}
$MissingTools = @('git','node','supabase') | Where-Object { -not (Get-GuideToolVersion $_) }
if (-not $MissingTools) {
 Write-Output 'SKIPPED: all required tools already work; Scoop installation is unnecessary.'
} elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
 Write-Output 'SKIPPED: Scoop is already available; no installer or policy change is needed.'
} else {
 # Only under approved organizational policy in non-admin PowerShell:
 Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
 Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
 if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) { throw 'STOP: Scoop installation did not establish its command. Reopen PowerShell and repair PATH.' }
 Write-Output 'PASS: Scoop is available.'
}`),
  install:block(`${toolVersion}
foreach ($Package in @(@{Tool='git'; Name='git'}, @{Tool='node'; Name='nodejs-lts'}, @{Tool='supabase'; Name='supabase'})) {
 $Tool = $Package.Tool
 $Version = Get-GuideToolVersion $Tool
 if ($Version) { Write-Output "SKIPPED: $Tool already works ($Version)."; continue }
 if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) { throw 'STOP: a required tool is missing and Scoop is unavailable. Complete the Scoop step, reopen PowerShell and retry.' }
 $InstalledPackages = scoop list
 # Scoop returns 1 with no package objects on a fresh installation.
 if ($LASTEXITCODE -ne 0 -and ($LASTEXITCODE -ne 1 -or $InstalledPackages)) { throw 'STOP: Scoop could not list installed packages. Repair Scoop before installing anything.' }
 if ($InstalledPackages | Where-Object { $_.Name -eq $Package.Name }) { throw "STOP: Scoop package $($Package.Name) is already installed but $Tool is missing from PATH. Reopen PowerShell or repair its shim; do not reinstall it." }
 $InstallName = $Package.Name
 if ($Tool -eq 'supabase') {
  $Buckets = scoop bucket list
  if ($LASTEXITCODE -notin @(0,2)) { throw 'STOP: Scoop could not list buckets. Repair Scoop before retrying; no bucket was removed.' }
  $OfficialBucket = $Buckets | Where-Object { $_.Source -match '^https://github\\.com/supabase/scoop-bucket(?:\\.git)?/?$' } | Select-Object -First 1
  if ($OfficialBucket) {
   $InstallName = "$($OfficialBucket.Name)/supabase"
   Write-Output "SKIPPED: official Supabase bucket already registered as $($OfficialBucket.Name)."
  } else {
   if ($Buckets | Where-Object { $_.Name -eq 'supabase' }) { throw 'STOP: the existing supabase bucket has an unverified source. Ask for review; do not remove or recreate it.' }
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   if ($LASTEXITCODE -ne 0) { throw 'STOP: official Supabase bucket setup failed. Inspect Scoop output; do not remove an existing bucket.' }
   $InstallName = 'supabase/supabase'
  }
 }
 scoop install $InstallName
 if ($LASTEXITCODE -ne 0) { throw "STOP: $Tool installation failed. Inspect Scoop output and repair PATH; preserve existing installations." }
 $Version = Get-GuideToolVersion $Tool
 if (-not $Version) { throw "STOP: $Tool is still missing from PATH. Reopen PowerShell and retry the complete tool check." }
 Write-Output "PASS: $Tool installed ($Version)."
}
supabase --version
if ($LASTEXITCODE -ne 0) { throw 'STOP: reopen PowerShell and repair native Supabase PATH.' }
Write-Output 'PASS: required tools work and final native supabase --version succeeded.'`),
  checkout:block(`${repo}
${checked('git remote -v','not a readable Git checkout.')}
${checked('git branch --show-current','branch could not be read.')}
${checked('git rev-parse HEAD','source revision could not be read.')}
${checked('git status --short','working tree status could not be read.')}
${files}
Write-Output 'PASS: required scripts exist. Review remote/branch/revision and cleanliness before stage 4.'`),
  preflight:block(`${identity}\n${repo}\n${files}\n${preflight}\nWrite-Output 'PASS: customer release preflight matched the approved target. No private Platform checkout is required.'`),
  account:block(`${identity}
$ProjectList = supabase projects list --output json
if ($LASTEXITCODE -ne 0) {
 Write-Output 'Project-list command failed; access is not established. Check CLI authentication/network errors above. No project has been declared inaccessible.'
 $LoginChoice = Read-Host 'If login is needed, type LOGIN to authenticate the authorized customer account; otherwise press Enter to stop and repair the reported error'
 if ($LoginChoice -cne 'LOGIN') { throw 'STOP: project-list command failed. Resolve authentication/network/CLI errors and retry the whole block.' }
 ${checked('supabase login','customer CLI login failed. Complete login with the authorized customer account, then retry the whole block.')}
 $ProjectList = supabase projects list --output json
 if ($LASTEXITCODE -ne 0) { throw 'STOP: project-list command still failed after login. Check authentication, account permissions and network; no project-access result is established.' }
}
try {
 $ProjectJson = ($ProjectList -join [Environment]::NewLine).Trim()
 if (-not $ProjectJson.StartsWith('[')) { throw 'Expected a JSON array.' }
 $Projects = $ProjectJson | ConvertFrom-Json -ErrorAction Stop
} catch { throw 'STOP: project-list JSON parsing failed. Check native CLI output/compatibility; this is not evidence of an inaccessible project. Retry the whole block after repair.' }
$MatchedProject = $Projects | Where-Object { $_.id -ceq $ShopRef }
if (-not $MatchedProject) { throw "STOP: the project list was read successfully, but exact Shop $ShopRef is absent. Obtain customer project access. To change accounts, run supabase logout, then supabase login, then rerun this whole block. If SUPABASE_ACCESS_TOKEN overrides login, correct it privately in this terminal. Never substitute another project or paste credentials into Platform." }
Write-Output "PASS: authenticated account lists exact customer Shop $ShopRef."`)};
}
