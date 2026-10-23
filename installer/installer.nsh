; Hooks only: retain electron-builder's standard extraction, registry and uninstall behavior.
LangString OrbitWelcomeTitle 2052 "欢迎安装 Orbit 环境工作台"
LangString OrbitWelcomeTitle 1033 "Welcome to Orbit Workspace"
LangString OrbitWelcomeText 2052 "此向导将安装 Orbit 环境工作台和内置狐狸浏览器内核。$\r$\n$\r$\n无需另装 Node.js 或下载浏览器内核。安装后可从桌面快捷方式打开，新建自己的环境并配置代理。$\r$\n$\r$\n环境数据保存在当前 Windows 用户下；卸载程序会保留这些数据。升级前请先关闭工作台和浏览器环境。"
LangString OrbitWelcomeText 1033 "This wizard installs Orbit Workspace and its bundled Camoufox browser.$\r$\n$\r$\nNo separate Node.js or browser download is needed. Open Orbit from the desktop shortcut, create a profile, and configure your own proxy.$\r$\n$\r$\nWorkspace data belongs to the current Windows user and is retained on uninstall. Close Orbit and its browser environments before upgrading."
LangString OrbitBusy 2052 "安装目录中的程序或浏览器仍在运行。请先关闭工作台及其环境，再重新运行安装或卸载。未强制结束任何进程。"
LangString OrbitBusy 1033 "Orbit or a browser from this installation is running. Close it and its environments, then try again. No processes were force-closed."
LangString OrbitCheckFailed 2052 "无法检查安装目录是否有程序正在运行。请确认 Windows PowerShell 与进程查询可用，再重试。"
LangString OrbitCheckFailed 1033 "Unable to check running programs in the installation directory. Check Windows PowerShell and process-query access, then try again."

!macro customWelcomePage
 !define MUI_WELCOMEPAGE_TITLE "$(OrbitWelcomeTitle)"
 !define MUI_WELCOMEPAGE_TEXT "$(OrbitWelcomeText)"
 !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstallMode
 StrCpy $isForceCurrentInstall "1"
!macroend

; Check by canonical installation directory, rather than killing processes by name.
; Pass the user-selected directory through an environment variable, never shell interpolation.
!macro customCheckAppRunning
 System::Call 'kernel32::SetEnvironmentVariable(t "ORBIT_INSTALL_TARGET", t "$INSTDIR")'
 nsExec::ExecToStack '"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$root=[IO.Path]::GetFullPath($$env:ORBIT_INSTALL_TARGET).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar; $$live=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$root,[StringComparison]::OrdinalIgnoreCase) }); if ($$live.Count -gt 0) { exit 10 }; exit 0 } catch { exit 11 }"'
 Pop $R0
 Pop $R1
 System::Call 'kernel32::SetEnvironmentVariable(t "ORBIT_INSTALL_TARGET", p 0)'
 ${If} $R0 == "10"
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(OrbitBusy)" /SD IDOK
  SetErrorLevel 10
  Quit
 ${ElseIf} $R0 != "0"
  MessageBox MB_OK|MB_ICONSTOP "$(OrbitCheckFailed)" /SD IDOK
  SetErrorLevel 11
  Quit
 ${EndIf}
!macroend
