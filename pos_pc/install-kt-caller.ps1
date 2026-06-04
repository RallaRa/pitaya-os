# Pitaya KT Caller 설치 (POS PC — 관리자 PowerShell)
# 사용: powershell -ExecutionPolicy Bypass -File C:\pitaya-os\install-kt-caller.ps1

$ErrorActionPreference = 'Stop'
$Dir = 'C:\pitaya-os'
Set-Location $Dir

Write-Host '=== node-notifier 설치 ==='
npm install node-notifier --save 2>&1

Write-Host '=== DB 경로 확인 ==='
$kpd = 'C:\Program Files\통화매니저\KPD.dat'
if (-not (Test-Path $kpd)) {
  Write-Warning "KPD.dat 없음: $kpd"
} else {
  Write-Host "OK: $kpd"
}

Write-Host '=== Python 폴링 테스트 ==='
python "$Dir\kt-caller-poll.py"
if ($LASTEXITCODE -ne 0) { throw 'kt-caller-poll.py 실패' }

Write-Host '=== .env SYSTEM 읽기 권한 (부팅 자동실행용) ==='
$envFile = Join-Path $Dir '.env'
if (Test-Path $envFile) {
  icacls $envFile /grant 'SYSTEM:(R)' 2>&1 | Out-Null
}

Write-Host '=== schtasks 등록 ==='
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe PATH 없음' }
$tr = "`"$node`" `"$Dir\kt-caller.js`""
schtasks /create /tn "PitayaKTCaller" /tr $tr /sc onstart /ru SYSTEM /f
schtasks /query /tn "PitayaKTCaller"

Write-Host ''
Write-Host '수동 실행: node C:\pitaya-os\kt-caller.js'
Write-Host '.env 확인: FIREBASE_SERVICE_ACCOUNT_KEY, ENCRYPTION_KEY, KAKAO_ACCESS_TOKEN'
