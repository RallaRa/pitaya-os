# Pitaya POS Member Watcher — 상시 실행 + 재부팅/로그인 자동 시작
# powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\install-member-watcher.ps1
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-bridge'
$TaskName = 'PitayaMemberWatcher'
Set-Location $Dir

Write-Host '=== npm 패키지 ==='
npm install --omit=dev 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Warning 'npm install 경고' }

foreach ($f in @('pos-member-watcher.js', 'probe-pos-member-screen.ps1', 'run-member-watcher-loop.bat', 'run-member-watcher-hidden.vbs')) {
  if (-not (Test-Path (Join-Path $Dir $f))) {
    throw "필수 파일 없음: $f — update-from-server.ps1 또는 API 다운로드 후 재시도"
  }
}

$runAs = "$env:USERDOMAIN\$env:USERNAME"
$vbs = Join-Path $Dir 'run-member-watcher-hidden.vbs'
Write-Host "=== 작업 스케줄러 등록 ($runAs) ==="

schtasks /delete /tn $TaskName /f 2>$null | Out-Null

$ok = $false
$tr = "wscript.exe `"$vbs`""
foreach ($args in @(
  @('/create', '/tn', $TaskName, '/tr', $tr, '/sc', 'onlogon', '/ru', $runAs, '/rl', 'HIGHEST', '/f'),
  @('/create', '/tn', $TaskName, '/tr', $tr, '/sc', 'onstart', '/delay', '0002:00', '/ru', $runAs, '/rl', 'HIGHEST', '/f')
)) {
  $out = schtasks @args 2>&1
  $out | Out-Host
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
}

if (-not $ok) {
  Write-Warning 'schtasks 기본 등록 실패 — Register-ScheduledTask 시도'
  try {
    $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
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
  }
}

if ($ok) {
  Write-Host '=== 기존 프로세스 종료 후 시작 ==='
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    try {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction Stop).CommandLine
      $cmd -like '*pos-member-watcher*'
    } catch { $false }
  } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

  schtasks /run /tn $TaskName 2>&1 | Out-Host
  Start-Sleep -Seconds 2
  schtasks /query /tn $TaskName /fo LIST | Select-Object -First 10
  Write-Host ''
  Write-Host '완료: PitayaMemberWatcher'
  Write-Host '- PC 로그인 / 재부팅(2분 후) 자동 실행'
  Write-Host '- 종료 시 5초 후 자동 재시작 (run-member-watcher-loop.bat)'
  Write-Host "- 로그: $Dir\member-watcher.log"
  Write-Host ''
  Write-Host '중지: schtasks /end /tn PitayaMemberWatcher'
  Write-Host '삭제: schtasks /delete /tn PitayaMemberWatcher /f'
} else {
  Write-Warning "수동: wscript.exe `"$vbs`""
}
