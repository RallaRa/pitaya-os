# POS 판매/결제 화면에서 회원코드·이름·평문 전화 추출 (JSON stdout)
# powershell -NoProfile -ExecutionPolicy Bypass -File probe-pos-member-screen.ps1

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
  $t = $text.Trim()
  if ($t -match '^(98\d{6})$') { return $matches[1] }
  if ($t -match '\b(98\d{6})\b') { return $matches[1] }
  if ($t -match '^\d{8}$') { return $t }
  return $null
}

function Find-MemberName([string]$text) {
  if (-not $text) { return $null }
  $t = $text.Trim()
  if ($t -match '^[\uAC00-\uD7A3]{2,10}$') { return $t }
  return $null
}

# 판매등록·결제 화면에서 회원호출/입력 시에만 true (회원관리·회원조회 화면 제외)
function Test-IsPaymentScreen([string[]]$texts) {
  if (-not $texts -or $texts.Count -eq 0) { return $false }
  $blob = ($texts -join ' ')

  $paymentHints = @(
    '판매등록', '판매 등록', '결제', '받을금액', '받을 금액', '합계금액', '합계 금액',
    '카드결제', '현금결제', '영수증', '판매(F', '회원호출', '회원명검색', '할인', '적립'
  )
  $memberMgmtHints = @(
    '회원관리', '회원등록', '회원명부', '회원조회', '회원정보관리', '회원수정', '회원삭제',
    '회원현황', '회원리스트', '신규회원'
  )

  $hasPayment = $false
  foreach ($h in $paymentHints) {
    if ($blob -match [regex]::Escape($h)) { $hasPayment = $true; break }
  }

  $hasMemberMgmt = $false
  foreach ($h in $memberMgmtHints) {
    if ($blob -match [regex]::Escape($h)) { $hasMemberMgmt = $true; break }
  }

  if (-not $hasPayment) { return $false }
  if (-not $hasMemberMgmt) { return $true }

  # 결제·판매 키워드가 있으면 회원관리 메뉴와 겹쳐도 결제 화면으로 간주
  if ($blob -match '판매등록|판매 등록|결제|받을금액|받을 금액|회원호출|회원명검색') {
    return $true
  }
  return $false
}

$pos = Get-Process -Name 'POSON2','POSon2' -EA 0 | Select-Object -First 1
if (-not $pos) {
  @{ running = $false; isPaymentScreen = $false; cusCode = $null; memberName = $null; phone = $null } | ConvertTo-Json -Compress
  exit 1
}

$texts = New-Object System.Collections.Generic.List[string]

$uiCode = @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class PosMemberProbe {
  delegate bool EnumProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int SendMessage(IntPtr h, int msg, IntPtr w, StringBuilder l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  const int WM_GETTEXT = 0x000D;
  static void Collect(IntPtr h, List<string> texts) {
    var sb = new StringBuilder(2048);
    if (GetWindowText(h, sb, 2048) > 0) { var t = sb.ToString().Trim(); if (t.Length > 0) texts.Add(t); }
    sb = new StringBuilder(2048);
    if (SendMessage(h, WM_GETTEXT, (IntPtr)2048, sb) > 0) {
      var t2 = sb.ToString().Trim();
      if (t2.Length > 0 && !texts.Contains(t2)) texts.Add(t2);
    }
    EnumChildWindows(h, (ch, lp) => { Collect(ch, texts); return true; }, IntPtr.Zero);
  }
  public static List<string> Scrape(uint targetPid) {
    var texts = new List<string>();
    EnumWindows((hwnd, lp) => { uint pid; GetWindowThreadProcessId(hwnd, out pid); if (pid == targetPid) Collect(hwnd, texts); return true; }, IntPtr.Zero);
    return texts;
  }
}
'@
Add-Type -TypeDefinition $uiCode -ErrorAction SilentlyContinue | Out-Null
foreach ($t in [PosMemberProbe]::Scrape([uint32]$pos.Id)) { [void]$texts.Add($t) }

try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -EA Stop
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$pos.Id)
  foreach ($el in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
    try {
      $cur = $el.Current
      foreach ($raw in @($cur.Name, $cur.HelpText, $cur.ItemStatus)) {
        if ($raw -and $raw.Trim()) { [void]$texts.Add($raw.Trim()) }
      }
      try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp) {
          $v = $vp.Current.Value
          if ($v -and $v.Trim()) { [void]$texts.Add($v.Trim()) }
        }
      } catch {}
    } catch {}
  }
} catch {}

$unique = @($texts | Select-Object -Unique)
$isPaymentScreen = Test-IsPaymentScreen $unique
$codes = @()
$names = @()
$phones = @()
foreach ($t in $unique) {
  $ph = Normalize-Phone $t
  if ($ph -and $phones -notcontains $ph) { $phones += $ph }
  $cd = Find-MemberCode $t
  if ($cd -and $codes -notcontains $cd) { $codes += $cd }
  $nm = Find-MemberName $t
  if ($nm -and $names -notcontains $nm) { $names += $nm }
}

$cusCode = [string]($codes | Select-Object -First 1)
$memberName = [string]($names | Select-Object -First 1)
$phone = [string]($phones | Select-Object -First 1)
if (-not $cusCode) { $cusCode = $null }
if (-not $memberName) { $memberName = $null }
if (-not $phone) { $phone = $null }

# 전화번호 없으면 OCR (회원번호만 UIA로 잡혀도 전화는 OCR 필요)
if (-not $phone) {
  $ocrScript = Join-Path $PSScriptRoot 'probe-pos-member-ocr.ps1'
  if (Test-Path $ocrScript) {
    try {
      $ocrOut = & powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $ocrScript 2>$null
      $ocrLine = ($ocrOut | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
      if ($ocrLine) {
        $ocr = $ocrLine | ConvertFrom-Json
        if (-not $cusCode -and $ocr.cusCode) { $cusCode = [string]$ocr.cusCode }
        if ($ocr.phone) { $phone = [string]$ocr.phone }
        if (-not $phone -and $ocr.ocrText) {
          $fromText = Extract-PhonesFromText ([string]$ocr.ocrText)
          if ($fromText.Count -gt 0) { $phone = [string]$fromText[0] }
        }
      }
    } catch {}
  }
}

[pscustomobject]@{
  running = $true
  isPaymentScreen = $isPaymentScreen
  pid = $pos.Id
  cusCode = $cusCode
  memberName = $memberName
  phone = $phone
} | ConvertTo-Json -Compress

if ($isPaymentScreen -and ($cusCode -or $phone)) { exit 0 }
if ($cusCode -or $phone) { exit 3 }
exit 2
