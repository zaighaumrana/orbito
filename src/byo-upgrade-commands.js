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
