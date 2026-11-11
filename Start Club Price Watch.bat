@echo off
setlocal
title Club Price Watch
set "CPW_SETUP="
set "CPW_SETUP_ONLY="
if /i "%~1"=="--setup-extension" (
  set "CPW_SETUP=1"
  set "CPW_SETUP_ONLY=1"
  goto prepare
)
if not "%~1"=="" goto prepare
echo.
echo   1 - Open the app
echo   2 - Set up the browser extension
echo.
choice /c 12 /t 5 /d 1 /n /m "Press 1 to open the app or 2 for setup (opens app in 5 seconds): "
if errorlevel 2 set "CPW_SETUP=1"
:prepare
cd /d "%~dp0source"
if errorlevel 1 goto failed
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install Node.js and try again.
  goto failed
)
if not exist "node_modules\vinext\dist\cli.js" (
  echo Installing app dependencies for the first run. This may take a few minutes.
  where npm >nul 2>nul
  if errorlevel 1 (
    echo npm is required. Install Node.js with npm and try again.
    goto failed
  )
  call npm ci
  if errorlevel 1 goto failed
)
if not exist "%~dp0checker\package\BrowserExtension\manifest.json" (
  echo Preparing the browser extension.
  call npm run build:extension
  if errorlevel 1 goto failed
)
if defined CPW_SETUP (
  call "%~dp0checker\package\tools\Setup Browser Extension.cmd"
  if errorlevel 1 goto failed
)
if defined CPW_SETUP_ONLY goto finished
node --experimental-strip-types scripts/start-local.ts %*
if errorlevel 1 goto failed
:finished
echo.
echo Club Price Watch launcher finished.
pause
exit /b 0
:failed
echo.
echo Club Price Watch could not start. Review the error above, then try again.
pause
exit /b 1
