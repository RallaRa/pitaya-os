# Pitaya 토스트 (node-notifier 대신 — 보이는 세션에서 실행)
# powershell -NoProfile -ExecutionPolicy Bypass -File show-pitaya-toast.ps1 -Title "제목" -Body "내용"

param(
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$Body = '',
  [string]$BodyFile = ''
)

$ErrorActionPreference = 'SilentlyContinue'
if ($BodyFile -and (Test-Path $BodyFile)) {
  $Body = Get-Content $BodyFile -Raw -Encoding UTF8
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Body = ($Body -replace "`r", '') -replace "`n", [Environment]::NewLine
if ($Body.Length -gt 240) { $Body = $Body.Substring(0, 240) + '…' }

# 1) 트레이 풍선 (10초)
try {
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.Visible = $true
  $icon.ShowBalloonTip(12000, $Title, $Body, [System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Milliseconds 500
  $icon.Dispose()
} catch {}

# 2) 화면 중앙 팝업 (8초 후 자동 닫힘)
try {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = $Title
  $form.Size = New-Object System.Drawing.Size(420, 200)
  $form.StartPosition = 'CenterScreen'
  $form.TopMost = $true
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ShowInTaskbar = $true

  $lbl = New-Object System.Windows.Forms.Label
  $lbl.Location = New-Object System.Drawing.Point(12, 12)
  $lbl.Size = New-Object System.Drawing.Size(380, 130)
  $lbl.Text = $Body
  $form.Controls.Add($lbl)

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 8000
  $timer.Add_Tick({
    $timer.Stop()
    $form.Close()
  })
  $timer.Start()

  [void]$form.ShowDialog()
  $timer.Dispose()
  $form.Dispose()
} catch {
  # 3) 최후 fallback
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($Body, $Title, 'OK', 'Information') | Out-Null
}
