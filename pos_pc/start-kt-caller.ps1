# Pitaya KT Caller — 중복 없이 백그라운드 기동
$ErrorActionPreference = 'SilentlyContinue'
$Dir = 'C:\pitaya-os'
Set-Location $Dir

function Get-KtCallerProcesses {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*kt-caller.js*' }
}

$running = @(Get-KtCallerProcesses)
if ($running.Count -ge 1) {
  # cmd 래퍼 + node 중복 정리
  $cmdProcs = @(Get-CimInstance Win32_Process -Filter "name='cmd.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*kt-caller-run.cmd*' })
  if ($running.Count -gt 1 -or $cmdProcs.Count -gt 1) {
    $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $cmdProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
  } elseif ($running.Count -eq 1) {
    exit 0
  }
}

$vbs = Join-Path $Dir 'kt-caller-run-hidden.vbs'
if (-not (Test-Path $vbs)) {
  $cmd = Join-Path $Dir 'kt-caller-run.cmd'
} else {
  $cmd = 'wscript.exe'
  $vbsArg = '"' + $vbs + '"'
}
if (-not (Test-Path (Join-Path $Dir 'kt-caller-run.cmd'))) {
  Add-Content -Path (Join-Path $Dir 'kt-caller-supervisor.log') -Value "[$(Get-Date)] missing kt-caller-run.cmd"
  exit 1
}

if ($vbsArg) {
  Start-Process -FilePath $cmd -ArgumentList $vbsArg -WorkingDirectory $Dir -WindowStyle Hidden
} else {
  Start-Process -FilePath $cmd -WorkingDirectory $Dir -WindowStyle Hidden
}
Add-Content -Path (Join-Path $Dir 'kt-caller-supervisor.log') -Value "[$(Get-Date)] started kt-caller-run.cmd"
