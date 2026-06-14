# Pitaya — 회원 전화 다음단계: bridge/watcher 최신화 + (옵션) 건별 동기화
param(
  [string]$CusCode = '98000001',
  [switch]$SkipSync
)

$ErrorActionPreference = 'Stop'
Set-Location 'C:\pitaya-bridge'

$key = ''
Get-Content '.env' -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^POS_BRIDGE_KEY=(.+)$') {
    $key = $matches[1].Trim().Trim('"').Trim("'")
  }
}
if (-not $key) { throw 'POS_BRIDGE_KEY missing in .env' }

$headers = @{ Authorization = "Bearer $key" }
$base = 'https://pitaya-osv1.vercel.app'
$files = @(
  'bridge.js',
  'probe-pos-member-screen.ps1',
  'probe-pos-member-ocr.ps1',
  'pos-member-watcher.js',
  'show-pitaya-toast.ps1',
  'run-member-watcher.bat',
  'run-member-watcher-loop.bat',
  'run-member-watcher-hidden.vbs',
  'install-member-watcher.ps1',
  'install-member-watcher.bat',
  'RUN-MEMBER-PHONE-NEXT.bat',
  'update-from-server.ps1'
)

foreach ($f in $files) {
  Write-Host "download $f"
  Invoke-WebRequest -Uri "$base/api/pos/bridge-files?pkg=bridge&file=$f" -Headers $headers -OutFile $f
}

if (-not $SkipSync) {
  Write-Host "`nprobe-customer-one $CusCode"
  node bridge.js probe-customer-one $CusCode
  Write-Host "`nsync-customer-one $CusCode"
  node bridge.js sync-customer-one $CusCode
  Write-Host "`nsync-recent-customers 3"
  node bridge.js sync-recent-customers 3
  Write-Host "`ninstall watcher"
  powershell -NoProfile -ExecutionPolicy Bypass -File install-member-watcher.ps1
}

Write-Host "`n다운로드 완료"
