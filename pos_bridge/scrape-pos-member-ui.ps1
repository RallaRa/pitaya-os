# 판매등록 → 회원호출 상태에서 POS 화면 전화번호 스크래프 (Win32 + UIAutomation)
# powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\scrape-pos-member-ui.ps1
# powershell -NoProfile -ExecutionPolicy Bypass -File C:\pitaya-bridge\scrape-pos-member-ui.ps1 -Debug

param([switch]$Debug)

$Out = 'C:\pitaya-bridge\ui-scraped-phones.csv'
$pos = Get-Process -Name 'POSON2','POSon2' -EA 0 | Select-Object -First 1
if (-not $pos) { Write-Host 'POS not running'; exit 1 }

Write-Host "POS $($pos.ProcessName) pid=$($pos.Id)"

function Normalize-Phone([string]$text) {
  if (-not $text) { return $null }
  $digits = ($text -replace '\D', '')
  if ($digits -match '(010\d{8})') { return $matches[1] }
  return $null
}

function Find-MemberCode([string]$text) {
  if (-not $text) { return $null }
  $t = $text.Trim()
  if ($t -match '^(98\d{6})$') { return $matches[1] }
  if ($t -match '\b(98\d{6})\b') { return $matches[1] }
  if ($t -match '^\d{8}$') { return $t }
  return $null
}

$texts = New-Object System.Collections.Generic.List[string]

$uiCode = @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class PosUi2 {
  delegate bool EnumProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int SendMessage(IntPtr h, int msg, IntPtr w, StringBuilder l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  const int WM_GETTEXT = 0x000D;
  static void Collect(IntPtr h, List<string> texts) {
    if (!IsWindowVisible(h)) return;
    var sb = new StringBuilder(512);
    if (GetWindowText(h, sb, 512) > 0) { var t = sb.ToString().Trim(); if (t.Length > 0) texts.Add(t); }
    sb = new StringBuilder(512);
    if (SendMessage(h, WM_GETTEXT, (IntPtr)512, sb) > 0) {
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
foreach ($t in [PosUi2]::Scrape([uint32]$pos.Id)) { [void]$texts.Add($t) }

try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -EA Stop
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$pos.Id)
  foreach ($el in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
    try {
      $cur = $el.Current
      foreach ($raw in @($cur.Name, $cur.HelpText, $cur.ItemStatus, $cur.AutomationId)) {
        if ($raw -and $raw.Trim()) { [void]$texts.Add($raw.Trim()) }
      }
      try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp) {
          $v = $vp.Current.Value
          if ($v -and $v.Trim()) { [void]$texts.Add($v.Trim()) }
        }
      } catch {}
      try {
        $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        if ($tp) {
          $doc = $tp.DocumentRange
          if ($doc) {
            $v = $doc.GetText(-1)
            if ($v -and $v.Trim()) { [void]$texts.Add($v.Trim()) }
          }
        }
      } catch {}
    } catch {}
  }
} catch { Write-Host "UIA: $($_.Exception.Message)" }

$unique = $texts | Select-Object -Unique
$phones = @()
$codes = @()
foreach ($t in $unique) {
  $ph = Normalize-Phone $t
  if ($ph -and $phones -notcontains $ph) { $phones += $ph }
  $cd = Find-MemberCode $t
  if ($cd -and $codes -notcontains $cd) { $codes += $cd }
}

Write-Host "texts=$($unique.Count) phones=$($phones.Count) codes=$($codes.Count)"
foreach ($ph in $phones) { Write-Host "  PHONE $ph" }
foreach ($c in $codes | Select-Object -First 5) { Write-Host "  CODE $c" }

if ($Debug) {
  Write-Host '--- DEBUG texts (phone/code-like first) ---'
  $unique | Where-Object {
    $_ -match '010|98\d{6}|\d{8}|전화|휴대|회원'
  } | ForEach-Object { Write-Host "  [hit] $_" }
  Write-Host '--- DEBUG all texts ---'
  $unique | ForEach-Object { Write-Host "  $_" }
}

if ($phones.Count -eq 0) {
  Write-Host 'No phone found'
  Write-Host 'Checklist:'
  Write-Host '  1) POSon2 판매등록 화면'
  Write-Host '  2) 회원호출/회원명검색으로 회원 1명 선택'
  Write-Host '  3) 하단 회원정보에 010xxxxxxxx 보이는지 눈으로 확인'
  Write-Host '  4) POS 창이 가려지지 않았는지 확인'
  Write-Host 'Debug: powershell ... -File scrape-pos-member-ui.ps1 -Debug'
  exit 2
}

if (-not (Test-Path $Out)) {
  'scraped_at,cus_code_hint,phone' | Set-Content $Out -Encoding UTF8
}
$hint = ($codes | Select-Object -First 1)
foreach ($ph in $phones) {
  Add-Content $Out "$(Get-Date -Format o),$hint,$ph" -Encoding UTF8
  Write-Host "saved $hint -> $ph"
}
Write-Host "-> $Out"
