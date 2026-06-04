# POS PC — KT Caller 원클릭 배포 (PowerShell에서 실행)
$ErrorActionPreference = 'Stop'
$Dir = 'C:\pitaya-os'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# Mac Cursor SSH 키 등록 (다음부터 자동 배포 가능)
$sshDir = Join-Path $env:USERPROFILE '.ssh'
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
$pub = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC7RZg979D/5wJZ0WFsGllNHztZnAAeeURxCxwoj2qJ3rmUKsYJDm6hQf9P0CIQnbPoxukuj+f437LDnc43thgBcQHzf0xzBwtTgVucBR4T+1SmBfLhL7yn7HNzPsrskQpUrGP/sFl1knmtAwzMbS63OprTxMxuMrBB7J4LmQ4/vWLvaftZ/XRLTwOKC/hcgUIaLZKBxOf/VO6rHQa8kDQjI9jciOWNdudVs1KfAvX5CLdVKMYtpHricUzkain2tdd4yLJyvyycoXAw8ms+9J6h4Fzhhaot7K5wVh13/5RSNG2aKeKEdjtZMoIeHK5KawvPxs9FJVU/I7qzirOpq+hRZ848OqcicFf8WFGJDBP2UmWm95c5pZTkdlwH3Vs3mVhAdZglSz4TJj2VnpnehI5PN54reQmtHJuR5ht7JNa1Nq3T8LtVULTGZSLsXDDcTrfQUdx3E1pNKUfE/ztiAGUAxKyrtmFww/cHA5rKHnLdUYwcX+W7MMTPINfG6m7ltU6ilVfU+cKpMQ81T6N4lf9VnoPmfwgcetldNiWhtvR6PDWSAZKHV/4S960YoKk7IZ3AhmYFEcUEtdRSfc8oTS15eYphECYy+67ZXcwN2/NDw0o9exaMBqrIrTCaPIYyg/NoZyZXjAUE+CtZc6Ei4g89zS5nbv5MsPMVQIAgF7pVKw== ralla@Rallaui-MacBookAir.local'
$auth = Join-Path $sshDir 'authorized_keys'
if (-not (Test-Path $auth) -or -not (Select-String -Path $auth -Pattern 'pitaya_pos' -Quiet)) {
  Add-Content -Path $auth -Value $pub -Encoding UTF8
  Write-Host 'SSH authorized_keys 등록 완료'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://raw.githubusercontent.com/RallaRa/pitaya-os/main/pos_pc'
$bootstrap = Join-Path $Dir 'bootstrap-kt-caller.ps1'
Write-Host "다운로드: $bootstrap"
Invoke-WebRequest -Uri "$base/bootstrap-kt-caller.ps1" -OutFile $bootstrap -UseBasicParsing
powershell -ExecutionPolicy Bypass -File $bootstrap

Write-Host ''
Write-Host '=== 수동 테스트 ==='
Write-Host 'node C:\pitaya-os\kt-caller.js'
