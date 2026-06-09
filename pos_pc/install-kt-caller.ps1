# Pitaya KT Caller install - boot, logon, watchdog + startup fallbacks (ASCII only)
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-os'
Set-Location $Dir

Write-Host '=== npm packages ==='
npm install node-notifier dotenv firebase-admin --save
if ($LASTEXITCODE -ne 0) { Write-Warning 'npm install warning' }

Write-Host '=== KPD.dat check ==='
$kpd = 'C:\Program Files\통화매니저\KPD.dat'
if (-not (Test-Path $kpd)) {
  Write-Warning "KPD.dat missing: $kpd"
} else {
  Write-Host "OK: $kpd"
}

Write-Host '=== python poll test ==='
$pyOk = $false
foreach ($py in @('python', 'py', 'python3')) {
  try {
    & $py "$Dir\kt-caller-poll.py" 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { $pyOk = $true; Write-Host "Python OK: $py"; break }
  } catch {}
}
if (-not $pyOk) { Write-Warning 'kt-caller-poll.py failed' }

$envFile = Join-Path $Dir '.env'
if (Test-Path $envFile) {
  icacls $envFile /grant 'SYSTEM:(R)' 2>&1 | Out-Null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node.exe not in PATH' }

$runAs = "$env:USERDOMAIN\$env:USERNAME"
$startPs = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\start-kt-caller.ps1`""
$watchPs = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\kt-caller-watchdog.ps1`""

function Test-ScheduledTaskExists($name) {
  $null -ne (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)
}

function Remove-OldTasks {
  foreach ($old in @('PitayaKTCaller', 'PitayaKTCallerBoot', 'PitayaKTCallerLogon', 'PitayaKTCallerWatchdog', 'PitayaKTCallerSupervisor')) {
    schtasks /delete /tn $old /f 2>&1 | Out-Null
    Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
}

function Register-KtTask($name, $trigger, $argument) {
  try {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
    $principal = New-ScheduledTaskPrincipal -UserId $runAs -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    if (Test-ScheduledTaskExists $name) {
      Write-Host "OK: $name"
      return $true
    }
    Write-Warning "FAIL verify: $name"
    return $false
  } catch {
    Write-Warning "FAIL register: $name - $($_.Exception.Message)"
    return $false
  }
}

function Register-KtTaskSchtasks($name, $args) {
  $out = & schtasks @args 2>&1
  $out | ForEach-Object { Write-Host "  $_" }
  if ($LASTEXITCODE -ne 0) { return $false }
  Start-Sleep -Milliseconds 300
  $q = schtasks /query /tn $name /fo LIST 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "FAIL verify schtasks: $name"
    return $false
  }
  Write-Host "OK: $name (schtasks)"
  return $true
}

Write-Host '=== scheduled tasks ==='
Remove-OldTasks

$ok = 0
$total = 3

$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$bootTrigger.Delay = 'PT2M'
if (Register-KtTask 'PitayaKTCallerBoot' $bootTrigger "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\start-kt-caller.ps1`"") { $ok++ }
else {
  if (Register-KtTaskSchtasks 'PitayaKTCallerBoot' @('/create', '/tn', 'PitayaKTCallerBoot', '/tr', $startPs, '/sc', 'onstart', '/delay', '0002:00', '/ru', $runAs, '/it', '/rl', 'HIGHEST', '/f')) { $ok++ }
}

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $runAs
if (Register-KtTask 'PitayaKTCallerLogon' $logonTrigger "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\start-kt-caller.ps1`"") { $ok++ }
else {
  if (Register-KtTaskSchtasks 'PitayaKTCallerLogon' @('/create', '/tn', 'PitayaKTCallerLogon', '/tr', $startPs, '/sc', 'onlogon', '/ru', $runAs, '/it', '/rl', 'HIGHEST', '/f')) { $ok++ }
}

Write-Host '=== watchdog (schtasks first) ==='
if (Register-KtTaskSchtasks 'PitayaKTCallerWatchdog' @('/create', '/tn', 'PitayaKTCallerWatchdog', '/tr', $watchPs, '/sc', 'minute', '/mo', '5', '/ru', $runAs, '/it', '/f')) {
  $ok++
} else {
  $watchTrigger = New-ScheduledTaskTrigger -Daily -At '3:00AM'
  $watchTrigger.RepetitionInterval = (New-TimeSpan -Minutes 5)
  $watchTrigger.RepetitionDuration = (New-TimeSpan -Days 3650)
  if (Register-KtTask 'PitayaKTCallerWatchdog' $watchTrigger "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dir\kt-caller-watchdog.ps1`"") { $ok++ }
}

Write-Host "Registered: $ok / $total tasks"

Write-Host '=== startup fallbacks (logon + watchdog loop) ==='
$supervisorVbs = @"
Set sh = CreateObject("WScript.Shell")
dir = "C:\pitaya-os"
Do
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\start-kt-caller.ps1""", 0, False
  WScript.Sleep 300000
Loop
"@
$supervisorPath = Join-Path $Dir 'kt-caller-supervisor.vbs'
Set-Content -Path $supervisorPath -Value $supervisorVbs -Encoding ASCII

$startup = [Environment]::GetFolderPath('Startup')
$startupLink = Join-Path $startup 'PitayaKTCallerSupervisor.vbs'
Copy-Item -Path $supervisorPath -Destination $startupLink -Force
Write-Host "OK: Startup $startupLink"

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name 'PitayaKTCaller' -Value "wscript.exe `"$startupLink`""
Write-Host 'OK: HKCU Run registry'

Write-Host 'Starting now...'
powershell -NoProfile -ExecutionPolicy Bypass -File "$Dir\start-kt-caller.ps1"
Start-Sleep -Seconds 3

$procs = @(Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*kt-caller.js*' })
if ($procs.Count -eq 1) {
  Write-Host ("Running PID: " + $procs[0].ProcessId)
} elseif ($procs.Count -gt 1) {
  Write-Warning ("Duplicate kt-caller: " + ($procs.ProcessId -join ', ') + " - trimming")
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Dir\start-kt-caller.ps1"
} else {
  Write-Warning 'kt-caller not running - check kt-caller-supervisor.log'
}

foreach ($t in @('PitayaKTCallerBoot', 'PitayaKTCallerLogon', 'PitayaKTCallerWatchdog')) {
  if (Test-ScheduledTaskExists $t) {
    Write-Host "Verify OK: $t"
  } else {
    $q = schtasks /query /tn $t 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "Verify OK: $t (schtasks)" }
    else { Write-Warning "Verify FAIL: $t - startup fallback active" }
  }
}

Write-Host 'Install complete'
