# POSon2 회원정보 영역 OCR (Win32 텍스트 읽기 실패 시)
# powershell -NoProfile -ExecutionPolicy Bypass -File probe-pos-member-ocr.ps1 [-Region top|bottom|full]

param(
  [ValidateSet('bottom', 'top', 'full')]
  [string]$Region = 'bottom'
)

$ErrorActionPreference = 'SilentlyContinue'

function Normalize-Phone([string]$text) {
  if (-not $text) { return $null }
  $digits = ($text -replace '\D', '')
  if ($digits -match '(010\d{8})') { return $matches[1] }
  return $null
}

function Extract-PhonesFromText([string]$text) {
  $found = New-Object System.Collections.Generic.List[string]
  if (-not $text) { return @() }
  $compact = ($text -replace '\D', '')
  for ($i = 0; $i -le ($compact.Length - 11); $i++) {
    if ($compact.Substring($i, 3) -ne '010') { continue }
    $c = $compact.Substring($i, [Math]::Min(11, $compact.Length - $i))
    if ($c.Length -eq 11 -and $c -match '^010\d{8}$' -and -not $found.Contains($c)) {
      [void]$found.Add($c)
    }
  }
  return @($found)
}

function Find-MemberCode([string]$text) {
  if (-not $text) { return $null }
  if ($text -match '\b(98\d{6})\b') { return $matches[1] }
  if ($text -match '\b(\d{8})\b') { return $matches[1] }
  return $null
}

$winCode = @'
using System;
using System.Runtime.InteropServices;
public static class PosWinRect {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT {
    public int Left; public int Top; public int Right; public int Bottom;
  }
  public static IntPtr FindMainWindow(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      if ((r.Right - r.Left) < 400 || (r.Bottom - r.Top) < 300) return true;
      found = h; return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
Add-Type -TypeDefinition $winCode -ErrorAction SilentlyContinue | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing | Out-Null

$pos = Get-Process -Name 'POSON2','POSon2' -EA 0 | Select-Object -First 1
if (-not $pos) {
  @{ running = $false; cusCode = $null; phone = $null; ocr = $false } | ConvertTo-Json -Compress
  exit 1
}

$hwnd = [PosWinRect]::FindMainWindow([uint32]$pos.Id)
if ($hwnd -eq [IntPtr]::Zero) { $hwnd = $pos.MainWindowHandle }

$rect = New-Object PosWinRect+RECT
[void][PosWinRect]::GetWindowRect($hwnd, [ref]$rect)
$w = [Math]::Max(100, $rect.Right - $rect.Left)
$h = [Math]::Max(100, $rect.Bottom - $rect.Top)

# Region: bottom=결제화면 하단, top=회원관리 기본정보(휴대폰번호), full=전체
switch ($Region) {
  'top' {
    $y0 = $rect.Top
    $capH = [Math]::Max(120, [int]($h * 0.55))
  }
  'full' {
    $y0 = $rect.Top
    $capH = $h
  }
  default {
    $y0 = [int]($rect.Top + ($h * 0.45))
    $capH = [Math]::Max(80, $rect.Bottom - $y0)
  }
}
$capW = $w

$bmp = New-Object System.Drawing.Bitmap $capW, $capH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $y0, 0, 0, (New-Object System.Drawing.Size $capW, $capH))
$pngPath = Join-Path $PSScriptRoot 'pos-member-ocr.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

$ocrText = ''
$ocrOk = $false

# Windows 10+ OCR (있으면 사용)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pngPath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ko')) }
  if ($engine) {
    $result = Await ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
    $ocrText = ($result.Lines | ForEach-Object { $_.Text }) -join ' '
    $ocrOk = [bool]$ocrText
  }
} catch {}

# Tesseract fallback
if (-not $ocrOk) {
  $tess = @(
    'C:\Program Files\Tesseract-OCR\tesseract.exe',
    'C:\pitaya-bridge\tesseract\tesseract.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($tess) {
    $txtOut = Join-Path $PSScriptRoot 'pos-member-ocr'
    & $tess $pngPath $txtOut -l kor+eng --psm 6 2>$null
    $txtFile = "$txtOut.txt"
    if (Test-Path $txtFile) { $ocrText = Get-Content $txtFile -Raw -Encoding UTF8; $ocrOk = [bool]$ocrText }
  }
}

# Node tesseract.js fallback
$nodePhone = $null
$nodeCode = $null
if (-not $ocrOk) {
  $nodeScript = Join-Path $PSScriptRoot 'ocr-read-png.js'
  if (Test-Path $nodeScript) {
    try {
      $nodeOut = & node $nodeScript $pngPath 2>$null
      $nodeLine = ($nodeOut | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
      if ($nodeLine) {
        $node = $nodeLine | ConvertFrom-Json
        if ($node.ocrText) { $ocrText = [string]$node.ocrText; $ocrOk = $true }
        if ($node.phone) { $nodePhone = [string]$node.phone }
        if ($node.cusCode) { $nodeCode = [string]$node.cusCode }
      }
    } catch {}
  }
}

$phones = @()
$codes = @()
if ($ocrText) {
  foreach ($ph in (Extract-PhonesFromText $ocrText)) {
    if ($phones -notcontains $ph) { $phones += $ph }
  }
  foreach ($m in [regex]::Matches($ocrText, '010[\d\s\-]{8,16}')) {
    $ph = Normalize-Phone $m.Value
    if ($ph -and $phones -notcontains $ph) { $phones += $ph }
  }
  foreach ($m in [regex]::Matches($ocrText, '98\d{6}|\b\d{8}\b')) {
    $cd = Find-MemberCode $m.Value
    if ($cd -and $codes -notcontains $cd) { $codes += $cd }
  }
}
if ($nodePhone -and $phones -notcontains $nodePhone) { $phones += $nodePhone }
if ($nodeCode -and $codes -notcontains $nodeCode) { $codes += $nodeCode }

$cusCode = ($codes | Select-Object -First 1)
$phone = ($phones | Select-Object -First 1)
if (-not $cusCode) { $cusCode = $null }
if (-not $phone) { $phone = $null }

[pscustomobject]@{
  running = $true
  pid = $pos.Id
  ocr = $ocrOk
  ocrText = if ($ocrText) { ($ocrText -replace '\s+', ' ').Trim().Substring(0, [Math]::Min(400, ($ocrText -replace '\s+', ' ').Trim().Length)) } else { $null }
  cusCode = $cusCode
  phone = $phone
  capture = $pngPath
} | ConvertTo-Json -Compress

if ($cusCode -or $phone) { exit 0 } else { exit 2 }
