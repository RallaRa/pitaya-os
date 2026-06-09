# 5분마다 kt-caller 생존 확인 — 없으면 start-kt-caller.ps1 실행
$ErrorActionPreference = 'SilentlyContinue'
$Dir = 'C:\pitaya-os'
$log = Join-Path $Dir 'kt-caller-supervisor.log'

$running = @(Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*kt-caller.js*' })

if ($running.Count -eq 0) {
  Add-Content -Path $log -Value "[$(Get-Date)] watchdog: not running, starting"
  Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',(Join-Path $Dir 'start-kt-caller.ps1') -WindowStyle Hidden
} elseif ($running.Count -gt 1) {
  Add-Content -Path $log -Value "[$(Get-Date)] watchdog: duplicate $($running.Count), trimming"
  Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',(Join-Path $Dir 'start-kt-caller.ps1') -WindowStyle Hidden
}
