# POS PC에서 한 번 실행 (PowerShell) — GitHub에서 최신 kt-caller 배포
$ErrorActionPreference = 'Stop'
$Dir = 'C:\pitaya-os'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = 'https://raw.githubusercontent.com/RallaRa/pitaya-os/main/pos_pc'
$bootstrap = Join-Path $Dir 'bootstrap-kt-caller.ps1'
Write-Host "다운로드: $bootstrap"
Invoke-WebRequest -Uri "$base/bootstrap-kt-caller.ps1" -OutFile $bootstrap -UseBasicParsing

Write-Host '설치 실행...'
powershell -ExecutionPolicy Bypass -File $bootstrap

Write-Host ''
Write-Host '테스트: node C:\pitaya-os\kt-caller.js'
