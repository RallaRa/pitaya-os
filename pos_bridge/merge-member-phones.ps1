# ui-scraped-phones.csv → member-phones.csv 병합 (중복 Cus_Code는 최신 phone 유지)
# powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\merge-member-phones.ps1

$Member = 'C:\pitaya-bridge\member-phones.csv'
$Ui = 'C:\pitaya-bridge\ui-scraped-phones.csv'
$map = @{}

function Load-CsvRows($path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^cus_code|^scraped_at') { return }
    $parts = $line -split ','
    if ($parts.Count -ge 2 -and $parts[0] -match '^\d{8}$') {
      $code = $parts[0].Trim()
      $phone = $parts[-1].Trim()
      if ($phone -match '^010\d{8}$') { $map[$code] = $phone }
    } elseif ($parts.Count -ge 3) {
      $hint = $parts[1].Trim()
      $phone = $parts[2].Trim()
      if ($hint -match '^\d{8}$' -and $phone -match '^010\d{8}$') { $map[$hint] = $phone }
    }
  }
}

Load-CsvRows $Member
Load-CsvRows $Ui

'cus_code,phone' | Set-Content $Member -Encoding UTF8
foreach ($k in ($map.Keys | Sort-Object)) {
  Add-Content $Member "$k,$($map[$k])" -Encoding UTF8
}
Write-Host "member-phones.csv rows=$($map.Count) -> $Member"
