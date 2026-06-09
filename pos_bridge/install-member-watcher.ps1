# Pitaya POS Member Watcher - auto start on boot/logon (hidden)
# powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\install-member-watcher.ps1
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-bridge'
$TaskName = 'PitayaMemberWatcher'
Set-Location $Dir

Write-Host '=== npm ==='
npm install --omit=dev 2>&1 | Out-Host

foreach ($f in @('pos-member-watcher.js', 'probe-pos-member-screen.ps1', 'run-member-watcher-loop.bat', 'run-member-watcher-hidden.vbs')) {
  if (-not (Test-Path (Join-Path $Dir $f))) {
    throw "Missing file: $f"
  }
}

$runAs = $env:USERDOMAIN + '\' + $env:USERNAME
$vbs = Join-Path $Dir 'run-member-watcher-hidden.vbs'
Write-Host "=== Register task ($runAs) ==="

schtasks /delete /tn $TaskName /f 2>$null | Out-Null

$ok = $false
try {
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
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
  Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger @($tLogon, $tBoot) `
    -Settings $settings `
    -RunLevel Highest `
    -User $env:USERNAME `
    -Force | Out-Host
  $ok = $true
} catch {
  Write-Warning $_.Exception.Message
  $tr = 'wscript.exe "' + $vbs + '"'
  $out = schtasks /create /tn $TaskName /tr $tr /sc onlogon /ru $runAs /rl HIGHEST /f 2>&1
  $out | Out-Host
  if ($LASTEXITCODE -eq 0) { $ok = $true }
}

if ($ok) {
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    try {
      $cmd = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id) -ErrorAction Stop).CommandLine
      $cmd -like '*pos-member-watcher*'
    } catch { $false }
  } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

  schtasks /run /tn $TaskName 2>&1 | Out-Host
  Start-Sleep -Seconds 2
  Write-Host 'OK: PitayaMemberWatcher (hidden via wscript + VBS)'
} else {
  Write-Warning ('Manual: wscript.exe "' + $vbs + '"')
}
