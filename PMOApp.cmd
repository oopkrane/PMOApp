@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-pmoapp.ps1"
if errorlevel 1 (
  echo.
  echo PMOApp could not be started. Review the message above.
  pause
)
endlocal

