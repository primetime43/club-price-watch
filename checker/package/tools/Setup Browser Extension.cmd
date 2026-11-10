@echo off
setlocal
title Club Price Watch - Browser Extension Setup
for %%I in ("%~dp0..\BrowserExtension") do set "CPW_EXTENSION_FOLDER=%%~fI"
if not exist "%CPW_EXTENSION_FOLDER%\manifest.json" (
  echo The extension files are missing from:
  echo %CPW_EXTENSION_FOLDER%
  echo Run npm run build:extension from the source folder, then retry.
  if /i not "%~1"=="--check-only" pause
  exit /b 1
)
if /i "%~1"=="--check-only" (
  echo Extension folder found: %CPW_EXTENSION_FOLDER%
  exit /b 0
)
echo.
echo ADD CLUB PRICE WATCH TO YOUR BROWSER
echo.
echo 1. On the Extensions page, turn ON Developer mode.
echo 2. Click Load unpacked.
echo 3. In the folder picker, press Ctrl+L, then Ctrl+V, then Enter.
echo 4. Click Select Folder. Keep this extension folder in place.
echo 5. Return to the app and refresh it. Look for Browser checker connected.
echo.
echo If Club Price Watch is already listed, click Reload on its card instead.
echo.
echo Extension folder:
echo %CPW_EXTENSION_FOLDER%
echo.
powershell.exe -NoProfile -NonInteractive -Command "Set-Clipboard -Value $env:CPW_EXTENSION_FOLDER"
if errorlevel 1 (
  echo Could not copy the path. Copy the extension folder path shown above.
) else (
  echo The folder path is copied. Paste it into the Load unpacked folder picker.
)
start "" explorer.exe "%CPW_EXTENSION_FOLDER%"
echo.
echo Opening your default browser's Extensions page...
"%~dp0ClubPriceWatch.Checker.exe" --setup-browser-extension
if errorlevel 1 (
  echo Open your browser and type chrome://extensions in its address bar.
)
echo.
echo After loading the extension, return here and press any key.
pause >nul
exit /b 0
