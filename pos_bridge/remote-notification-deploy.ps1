# Pitaya POS — 알림/회원 watcher 원격 점검·배포 (SSH에서 실행)
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-bridge'
$GitBase = 'https://raw.githubusercontent.com/RallaRa/pitaya-os/main/pos_bridge'
$App = 'https://pitaya-osv1.vercel.app'

Write-Host '=== HOST ==='
hostname

Write-Host '=== DIRS ==='
@('C:\pitaya-bridge', 'C:\pitaya-os') | ForEach-Object {
  if (Test-Path $_) { Write-Host "OK $_" } else { Write-Host "MISS $_" }
}

Write-Host '=== TASKS ==='
foreach ($tn in @('PitayaMemberWatcher', 'PitayaKTCallerWatchdog', 'PitayaKTCallerBoot')) {
  Write-Host "-- $tn --"
  schtasks /query /fo LIST /tn $tn 2>&1 | Select-Object -First 5
}

Write-Host '=== NODE ==='
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, Path | Format-Table -AutoSize

Set-Location $Dir
if (-not (Test-Path '.env')) {
  Write-Host 'ERROR: C:\pitaya-bridge\.env missing'
  exit 1
}

$key = ''
Get-Content '.env' -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^POS_BRIDGE_KEY=(.+)$') {
    $key = $matches[1].Trim().Trim('"').Trim("'")
  }
}
if (-not $key) { Write-Host 'ERROR: POS_BRIDGE_KEY missing'; exit 1 }

$headers = @{ Authorization = "Bearer $key" }
$files = @(
  'deploy-member-watcher-remote.ps1',
  'pos-member-watcher.js',
  'show-pitaya-toast.ps1',
  'probe-pos-member-screen.ps1',
  'probe-pos-member-ocr.ps1',
  'run-member-watcher-loop.bat',
  'run-member-watcher-hidden.vbs',
  'install-member-watcher.ps1',
  'install-member-watcher.bat',
  'package.json'
)

Write-Host '=== DOWNLOAD (GitHub) ==='
foreach ($f in $files) {
  try {
    $uri = "$GitBase/$f"
    Invoke-WebRequest -Uri $uri -OutFile (Join-Path $Dir $f) -UseBasicParsing
    Write-Host "OK $f"
  } catch {
    Write-Host "FAIL $f : $($_.Exception.Message)"
  }
}

Write-Host '=== NPM ==='
npm install --omit=dev 2>&1 | Select-Object -Last 5

Write-Host '=== INSTALL WATCHER ==='
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'install-member-watcher.ps1')

Write-Host '=== FILES ==='
@('pos-member-watcher.js', 'show-pitaya-toast.ps1', 'probe-pos-member-ocr.ps1') | ForEach-Object {
  $p = Join-Path $Dir $_
  if (Test-Path $p) { Write-Host ((Get-Item $p).LastWriteTime.ToString('yyyy-MM-dd HH:mm') + " $_") }
  else { Write-Host "MISSING $_" }
}

Write-Host '=== WATCHER LOG ==='
$log = Join-Path $Dir 'member-watcher.log'
if (Test-Path $log) { Get-Content $log -Tail 12 } else { Write-Host 'NO_LOG' }

Write-Host '=== ENV KEYS ==='
Select-String -Path (Join-Path $Dir '.env') -Pattern '^(POS_BRIDGE_KEY|STORE_ID|FIREBASE_SERVICE_ACCOUNT_KEY|PITAYA_APP_URL)=' |
  ForEach-Object { ($_.Line -replace '=.*', '=***') }

if (Test-Path 'C:\pitaya-os\kt-caller.js') {
  Write-Host '=== KT-CALLER TEST ==='
  Set-Location 'C:\pitaya-os'
  node kt-caller.js --test 2>&1 | Select-Object -Last 25
} else {
  Write-Host 'KT-CALLER MISSING at C:\pitaya-os\kt-caller.js'
}

Write-Host '=== DONE ==='
