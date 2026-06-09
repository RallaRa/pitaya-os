# Pitaya POS persistence: sshd + member watcher + bridge (auto-start on boot/logon)
# Admin: powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\install-pos-persistence.ps1
param(
  [switch]$VisibleWatcher
)

$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-bridge'
$TaskWatcher = 'PitayaMemberWatcher'
$TaskBridge = 'PitayaPosBridgeRealtime'
$TaskSshdWatch = 'PitayaSshdWatch'

Set-Location $Dir

function EnsureFile($name) {
  if (-not (Test-Path (Join-Path $Dir $name))) {
    throw "Missing required file: $name"
  }
}

Write-Host '=== 1) OpenSSH sshd auto-start + failure recovery ==='
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshd) {
  Write-Warning 'sshd service not found'
} else {
  sc.exe config sshd start= auto | Out-Null
  sc.exe failure sshd reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
  if ($sshd.Status -ne 'Running') {
    net start sshd 2>&1 | Out-Host
  }
  sc.exe query sshd | Select-String 'STATE' | Out-Host
  netstat -an | findstr ':2223' | Out-Host
}

Write-Host '=== 2) SSH public key for Mac ==='
$pubKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMbAeXdYKP5jm6NoUKHkpxlKtBoCzfze0f7LLK4XHUOp ralla@Rallaui-MacBookAir.local'
$adminKeys = 'C:\ProgramData\ssh\administrators_authorized_keys'
$dirSsh = Split-Path $adminKeys
if (-not (Test-Path $dirSsh)) { New-Item -ItemType Directory -Path $dirSsh -Force | Out-Null }
$existing = @()
if (Test-Path $adminKeys) { $existing = Get-Content $adminKeys -ErrorAction SilentlyContinue }
if ($existing -notcontains $pubKey) {
  Add-Content -Path $adminKeys -Value $pubKey -Encoding ascii
}
icacls $adminKeys /inheritance:r 2>$null | Out-Null
icacls $adminKeys /grant 'SYSTEM:F' 2>$null | Out-Null
icacls $adminKeys /grant 'BUILTIN\Administrators:R' 2>$null | Out-Null
Write-Host 'administrators_authorized_keys OK'

Write-Host '=== 3) npm packages ==='
if (Test-Path (Join-Path $Dir 'package.json')) {
  npm install --omit=dev 2>&1 | Out-Host
}

Write-Host '=== 4) PitayaMemberWatcher scheduled task ==='
EnsureFile 'pos-member-watcher.js'
EnsureFile 'probe-pos-member-screen.ps1'
EnsureFile 'run-member-watcher-loop.bat'

if (-not $VisibleWatcher) {
  EnsureFile 'run-member-watcher-hidden.vbs'
  $runner = 'wscript.exe'
  $runnerArg = "`"$(Join-Path $Dir 'run-member-watcher-hidden.vbs')`""
  $modeLabel = 'hidden'
} else {
  EnsureFile 'run-member-watcher-visible.bat'
  $runner = 'cmd.exe'
  $runnerArg = "/c `"$(Join-Path $Dir 'run-member-watcher-visible.bat')`""
  $modeLabel = 'visible'
}

schtasks /delete /tn $TaskWatcher /f 2>$null | Out-Null
$runAs = "$($env:USERDOMAIN)\$($env:USERNAME)"
$okWatcher = $false
try {
  $action = New-ScheduledTaskAction -Execute $runner -Argument $runnerArg -WorkingDirectory $Dir
  $tLogon = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME
  $tBoot = New-ScheduledTaskTrigger -AtStartup
  $tBoot.Delay = 'PT2M'
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskWatcher `
    -Action $action `
    -Trigger @($tLogon, $tBoot) `
    -Settings $settings `
    -RunLevel Highest `
    -User $env:USERNAME `
    -Force | Out-Host
  $okWatcher = $true
} catch {
  Write-Warning $_.Exception.Message
  $tr = "$runner $runnerArg"
  schtasks /create /tn $TaskWatcher /tr $tr /sc onlogon /ru $runAs /rl HIGHEST /f 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) { $okWatcher = $true }
}

Write-Host '=== 5) PitayaPosBridgeRealtime scheduled task ==='
if (Test-Path (Join-Path $Dir 'bridge.js')) {
  EnsureFile 'run-realtime-hidden.vbs'
  $vbsBridge = Join-Path $Dir 'run-realtime-hidden.vbs'
  schtasks /delete /tn $TaskBridge /f 2>$null | Out-Null
  try {
    $actionB = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbsBridge`"" -WorkingDirectory $Dir
    $tLogonB = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME
    $tBootB = New-ScheduledTaskTrigger -AtStartup
    $tBootB.Delay = 'PT3M'
    $settingsB = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskBridge `
      -Action $actionB `
      -Trigger @($tLogonB, $tBootB) `
      -Settings $settingsB `
      -RunLevel Highest `
      -User $env:USERNAME `
      -Force | Out-Host
  } catch {
    schtasks /create /tn $TaskBridge /tr "wscript.exe `"$vbsBridge`"" /sc onlogon /ru $runAs /rl HIGHEST /f 2>&1 | Out-Host
  }
} else {
  Write-Warning 'bridge.js missing, skipping bridge task'
}

Write-Host '=== 6) sshd watchdog (every 5 min) ==='
$watchPs1 = Join-Path $Dir 'watch-sshd.ps1'
@'
$svc = Get-Service sshd -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Running') {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path 'C:\pitaya-bridge\sshd-watch.log' -Value "$ts sshd stopped -> starting"
  net start sshd 2>&1 | Out-Null
}
'@ | Set-Content -Path $watchPs1 -Encoding ASCII

schtasks /delete /tn $TaskSshdWatch /f 2>$null | Out-Null
schtasks /create /tn $TaskSshdWatch `
  /tr "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchPs1`"" `
  /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f 2>&1 | Out-Host

Write-Host '=== 7) Start now ==='
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction Stop).CommandLine
    $cmd -like '*pos-member-watcher*' -or $cmd -like '*bridge.js*'
  } catch { $false }
} | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

if ($okWatcher) { schtasks /run /tn $TaskWatcher 2>&1 | Out-Host }
if (Test-Path (Join-Path $Dir 'bridge.js')) { schtasks /run /tn $TaskBridge 2>&1 | Out-Null }
Start-Sleep -Seconds 3

Write-Host ''
Write-Host '=== DONE ==='
Write-Host "Watcher mode: $modeLabel"
Write-Host "Logs: $Dir\member-watcher.log, $Dir\realtime.log, $Dir\sshd-watch.log"
Write-Host ''
schtasks /query /tn $TaskWatcher /fo LIST 2>$null | Select-Object -First 8
