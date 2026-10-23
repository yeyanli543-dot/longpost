[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Cap {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$items = New-Object System.Collections.ArrayList
$cb = [Cap+EnumProc]{
  param($h, $l)
  if ([Cap]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][Cap]::GetWindowText($h, $sb, 512)
    $cn = New-Object System.Text.StringBuilder 256
    [void][Cap]::GetClassName($h, $cn, 256)
    $r = New-Object Cap+RECT
    [void][Cap]::GetWindowRect($h, [ref]$r)
    $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
    $m = if ($env:CAP_TITLE) { $sb.ToString() -eq $env:CAP_TITLE } else { $sb.ToString() -like '*Google Chrome*' }
    if ($cn.ToString() -eq 'Chrome_WidgetWin_1' -and $m -and $w -gt 600 -and $hh -gt 400) {
      [void]$items.Add([pscustomobject]@{ H = $h; T = $sb.ToString(); W = $w; HH = $hh })
    }
  }
  return $true
}
[Cap]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$items | ForEach-Object { "cand: " + $_.T + " [" + $_.W + "x" + $_.HH + "]" }
$best = $items | Sort-Object { $_.W * $_.HH } -Descending | Select-Object -First 1
if (-not $best) { "no chrome window"; exit 1 }
[void][Cap]::ShowWindow($best.H, 9)
[void][Cap]::SetForegroundWindow($best.H)
Start-Sleep -Milliseconds 900
$bmp = New-Object System.Drawing.Bitmap $best.W, $best.HH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][Cap]::PrintWindow($best.H, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
$out = "D:\antigravity\longpost\.verify\chrome-shot.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"shot: " + $best.T + " [" + $best.W + "x" + $best.HH + "] -> $out"
