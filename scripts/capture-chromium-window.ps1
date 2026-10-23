param([Parameter(Mandatory=$true)][string]$ProfilePath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class OrbitWindowCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
'@
[void][OrbitWindowCapture]::SetProcessDpiAwarenessContext([IntPtr](-4))
$browserProcess=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -and $_.CommandLine.Contains($ProfilePath) -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
if(!$browserProcess){throw 'Test Chrome process not found'}
$browser=Get-Process -Id $browserProcess.ProcessId
$windowHandle=$browser.MainWindowHandle
if($windowHandle -eq 0){throw 'Test Chrome window not found'}
$rect=New-Object OrbitWindowCapture+RECT
if(![OrbitWindowCapture]::GetWindowRect($windowHandle,[ref]$rect)){throw 'Cannot read window bounds'}
$bitmap=New-Object System.Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$dc=$graphics.GetHdc()
try{if(![OrbitWindowCapture]::PrintWindow($windowHandle,$dc,2)){throw 'Cannot capture Chrome window'}}finally{$graphics.ReleaseHdc($dc)}
try{$bitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
$root=[System.Windows.Automation.AutomationElement]::FromHandle($windowHandle)
$items=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$names=@($items | ForEach-Object {try{$_.Current.Name}catch{}} | Where-Object {$_})
[pscustomobject]@{pid=$browserProcess.ProcessId;commandLine=$browserProcess.CommandLine;title=$browser.MainWindowTitle;accessibleNames=$names;screenshot=$OutputPath} | ConvertTo-Json -Depth 4 -Compress
