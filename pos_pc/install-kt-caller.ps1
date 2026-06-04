# Pitaya KT Caller 설치 (POS PC)
$ErrorActionPreference = 'Continue'
$Dir = 'C:\pitaya-os'
Set-Location $Dir

Write-Host '=== npm 패키지 ==='
npm install node-notifier dotenv firebase-admin --save
if ($LASTEXITCODE -ne 0) { Write-Warning 'npm install 경고 (계속 진행)' }

Write-Host '=== DB 경로 확인 ==='
$kpd = 'C:\Program Files\통화매니저\KPD.dat'
if (-not (Test-Path $kpd)) {
  Write-Warning "KPD.dat 없음: $kpd"
} else {
  Write-Host "OK: $kpd"
}

Write-Host '=== Python 폴링 테스트 ==='
$pyOk = $false
foreach ($py in @('python', 'py', 'python3')) {
  try {
    & $py "$Dir\kt-caller-poll.py" 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { $pyOk = $true; Write-Host "Python OK: $py"; break }
  } catch {}
}
if (-not $pyOk) { Write-Warning 'kt-caller-poll.py 실패 (통화매니저 DB 확인)' }

Write-Host '=== .env SYSTEM 읽기 권한 ==='
$envFile = Join-Path $Dir '.env'
if (Test-Path $envFile) {
  icacls $envFile /grant 'SYSTEM:(R)' 2>&1 | Out-Null
}

Write-Host '=== schtasks 등록 ==='
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe PATH 없음' }
# schtasks /tr: 공백 경로 회피 — cmd 래퍼 사용
$tr = "cmd.exe /c cd /d $Dir `& node kt-caller.js"
$created = $false
foreach ($args in @(
  @('/create', '/tn', 'PitayaKTCaller', '/tr', $tr, '/sc', 'onlogon', '/f'),
  @('/create', '/tn', 'PitayaKTCaller', '/tr', $tr, '/sc', 'onstart', '/ru', 'SYSTEM', '/f')
)) {
  $out = schtasks @args 2>&1
  $out | Out-Host
  if ($LASTEXITCODE -eq 0) { $created = $true; break }
}
if ($created) {
  schtasks /query /tn 'PitayaKTCaller' /fo LIST | Select-Object -First 6
} else {
  Write-Warning 'schtasks 등록 실패 — 수동: node C:\pitaya-os\kt-caller.js'
}

Write-Host ''
Write-Host '수동 실행: node C:\pitaya-os\kt-caller.js'
Write-Host '.env: FIREBASE_SERVICE_ACCOUNT_KEY, ENCRYPTION_KEY, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET'
