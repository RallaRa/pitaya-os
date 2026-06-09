# POS PC에서 실행 — Pitaya API에서 member watcher 파일 다운로드 + 설치
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
  'probe-pos-member-screen.ps1',
  'probe-pos-member-ocr.ps1',
  'show-pitaya-toast.ps1',
  'pos-member-watcher.js',
  'run-member-watcher.bat',
  'run-member-watcher-loop.bat',
  'run-member-watcher-hidden.vbs',
  'install-member-watcher.ps1',
  'install-member-watcher.bat',
  'update-from-server.ps1'
)

foreach ($f in $files) {
  Write-Host "download $f"
  Invoke-WebRequest -Uri "$base/api/pos/bridge-files?pkg=bridge&file=$f" -Headers $headers -OutFile $f
}

npm install
powershell -NoProfile -ExecutionPolicy Bypass -File install-member-watcher.ps1
