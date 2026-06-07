# Pitaya POS Bridge — 서버에서 최신 파일 다운로드 (USB 불필요)
# 사용: pos_bridge 폴더에서 powershell -ExecutionPolicy Bypass -File update-from-server.ps1

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$apiBase = 'https://pitaya-osv1.vercel.app'
$key = ''

if (Test-Path '.env') {
  Get-Content '.env' -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^POS_BRIDGE_KEY=(.+)$') {
      $key = $matches[1].Trim().Trim('"').Trim("'")
    }
    if ($line -match '^PITAYA_API_URL=(.+)$') {
      $raw = $matches[1].Trim().Trim('"').Trim("'")
      $apiBase = ($raw -replace '/api/pos/sync$', '')
    }
  }
}

if (-not $key) {
  Write-Host '[오류] .env 에 POS_BRIDGE_KEY 가 없습니다.' -ForegroundColor Red
  Write-Host '기존 bridge 폴더의 .env 를 이 폴더에 복사한 뒤 다시 실행하세요.'
  exit 1
}

$headers = @{ Authorization = "Bearer $key" }
$files = @('bridge.js', 'package.json', 'sync-customers.bat', 'run-realtime.bat', 'run-realtime-hidden.vbs', 'install-realtime-task.bat', 'find-ukey2-key.ps1', 'FIND-KEY.bat', 'dll-strings.ps1', 'export-en-ukey2.bat', 'remote-from-pitaya.ps1', 'probe-pos-member-screen.ps1', 'scrape-pos-member-ui.ps1', 'merge-member-phones.ps1', 'pos-member-watcher.js', 'run-member-watcher.bat', 'run-member-watcher-loop.bat', 'run-member-watcher-hidden.vbs', 'install-member-watcher.ps1', 'install-member-watcher.bat')

Write-Host "API: $apiBase"
Write-Host '다운로드 중...'

foreach ($f in $files) {
  $url = "$apiBase/api/pos/bridge-files?pkg=bridge&file=$f"
  Write-Host "  -> $f"
  Invoke-WebRequest -Uri $url -Headers $headers -OutFile $f
}

Write-Host 'npm install...'
npm install

Write-Host ''
Write-Host '완료. 다음 명령으로 확인:' -ForegroundColor Green
Write-Host '  node bridge.js probe-customer-phones'
Write-Host '  node bridge.js sync-customers --dry-run'
Write-Host '  node bridge.js sync-customers'
