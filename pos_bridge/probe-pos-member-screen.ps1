# POS 판매등록 화면에서 회원코드·이름 추출 (JSON stdout)
# powershell -NoProfile -ExecutionPolicy Bypass -File probe-pos-member-screen.ps1

$ErrorActionPreference = 'SilentlyContinue'

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

$pos = Get-Process -Name 'POSON2','POSon2' -EA 0 | Select-Object -First 1
if (-not $pos) {
  @{ running = $false; cusCode = $null; memberName = $null } | ConvertTo-Json -Compress
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

$unique = $texts | Select-Object -Unique
$codes = @()
$names = @()
foreach ($t in $unique) {
  $cd = Find-MemberCode $t
  if ($cd -and $codes -notcontains $cd) { $codes += $cd }
  $nm = Find-MemberName $t
  if ($nm -and $names -notcontains $nm) { $names += $nm }
}

$cusCode = ($codes | Select-Object -First 1)
$memberName = ($names | Select-Object -First 1)

@{
  running = $true
  pid = $pos.Id
  cusCode = $cusCode
  memberName = $memberName
} | ConvertTo-Json -Compress

if ($cusCode) { exit 0 } else { exit 2 }
