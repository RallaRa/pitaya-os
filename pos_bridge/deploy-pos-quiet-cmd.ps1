# Deploy quiet CMD loops + kill visible processes on POS PC
$ErrorActionPreference = 'Continue'
$Rev = 'main'
$GitBridge = "https://raw.githubusercontent.com/RallaRa/pitaya-os/$Rev/pos_bridge"
$GitPc = "https://raw.githubusercontent.com/RallaRa/pitaya-os/$Rev/pos_pc"

function Fetch($url, $dest) {
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  Write-Host "OK $dest"
}

Write-Host '=== DOWNLOAD bridge ==='
Set-Location 'C:\pitaya-bridge'
Fetch "$GitBridge/run-member-watcher-loop.bat" 'C:\pitaya-bridge\run-member-watcher-loop.bat'
Fetch "$GitBridge/fix-pos-visible-cmd.ps1" 'C:\pitaya-bridge\fix-pos-visible-cmd.ps1'

Write-Host '=== DOWNLOAD pitaya-os ==='
Fetch "$GitPc/kt-caller-run.cmd" 'C:\pitaya-os\kt-caller-run.cmd'
Fetch "$GitPc/kt-caller-run-hidden.vbs" 'C:\pitaya-os\kt-caller-run-hidden.vbs'
Fetch "$GitPc/start-kt-caller.ps1" 'C:\pitaya-os\start-kt-caller.ps1'
Fetch "$GitPc/kt-caller-watchdog.ps1" 'C:\pitaya-os\kt-caller-watchdog.ps1'

Write-Host '=== KILL visible CMD loops ==='
& 'C:\pitaya-bridge\fix-pos-visible-cmd.ps1'

Write-Host '=== RESTART kt-caller (hidden) ==='
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like '*kt-caller.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" |
  Where-Object { $_.CommandLine -like '*kt-caller-run*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File 'C:\pitaya-os\start-kt-caller.ps1'

Write-Host '=== VERIFY ==='
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" | ForEach-Object {
  if ($_.CommandLine -match 'visible|kt-caller-run') { Write-Host ('WARN ' + $_.CommandLine) }
}
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'watcher|kt-caller|realtime' } |
  ForEach-Object { Write-Host ('NODE ' + $_.CommandLine) }

Write-Host '=== DONE ==='
