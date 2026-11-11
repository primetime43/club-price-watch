@echo off
setlocal
title Club Price Watch
if /i "%~1"=="--setup-extension" (
  call "%~dp0checker\package\tools\Setup Browser Extension.cmd"
  exit /b
)
if not "%~1"=="" goto launch
echo.
echo   1 - Open the app
echo   2 - Set up the browser extension
echo.
choice /c 12 /t 5 /d 1 /n /m "Press 1 to open the app or 2 for setup (opens app in 5 seconds): "
if errorlevel 2 call "%~dp0checker\package\tools\Setup Browser Extension.cmd"
:launch
cd /d "%~dp0source"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install Node.js and try again.
  pause
  exit /b 1
)
node --experimental-strip-types scripts/start-local.ts %*
if errorlevel 1 pause
