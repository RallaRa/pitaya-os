# Pitaya POS Member Watcher 설치 (회원호출 → 요청 이력 토스트)
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-bridge'
Set-Location $Dir

Write-Host '=== npm 패키지 (axios, node-notifier 등) ==='
npm install
if ($LASTEXITCODE -ne 0) { Write-Warning 'npm install 경고' }

Write-Host '=== probe 테스트 ==='
$probe = powershell -NoProfile -ExecutionPolicy Bypass -File "$Dir\probe-pos-member-screen.ps1" 2>&1
$probe | Out-Host

Write-Host '=== schtasks 등록 (로그인 사용자 — 토스트 표시용) ==='
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe PATH 없음' }
$tr = "cmd.exe /c cd /d $Dir & node pos-member-watcher.js"
$created = $false
foreach ($args in @(
  @('/create', '/tn', 'PitayaMemberWatcher', '/tr', $tr, '/sc', 'onlogon', '/rl', 'HIGHEST', '/f'),
  @('/create', '/tn', 'PitayaMemberWatcher', '/tr', $tr, '/sc', 'onstart', '/delay', '0001:30', '/f')
)) {
  $out = schtasks @args 2>&1
  $out | Out-Host
  if ($LASTEXITCODE -eq 0) { $created = $true; break }
}
if ($created) {
  schtasks /query /tn 'PitayaMemberWatcher' /fo LIST | Select-Object -First 6
} else {
  Write-Warning 'schtasks 실패 — 수동: node C:\pitaya-bridge\pos-member-watcher.js'
}

Write-Host ''
Write-Host '수동 실행: node C:\pitaya-bridge\pos-member-watcher.js'
Write-Host '필요: .env POS_BRIDGE_KEY, STORE_ID, (선택) FIREBASE_SERVICE_ACCOUNT_KEY'
