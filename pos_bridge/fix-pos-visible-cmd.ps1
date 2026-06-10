# Stop visible CMD loops on POS PC
Write-Host '=== BEFORE ==='
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" | ForEach-Object { Write-Host $_.CommandLine }

Write-Host '=== KILL visible loops ==='
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" | Where-Object {
  $_.CommandLine -match 'run-member-watcher-visible|kt-caller-run\.cmd'
} | ForEach-Object {
  Write-Host ('KILL PID ' + $_.ProcessId + ' ' + $_.CommandLine)
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host '=== ENSURE hidden watcher only ==='
schtasks /end /tn PitayaMemberWatcher 2>$null | Out-Null
Start-Sleep -Seconds 2
schtasks /run /tn PitayaMemberWatcher 2>&1 | Out-Host

Write-Host '=== AFTER ==='
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" | ForEach-Object { Write-Host $_.CommandLine }

Write-Host '=== DONE ==='
