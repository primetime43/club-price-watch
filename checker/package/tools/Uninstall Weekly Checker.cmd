@echo off
setlocal
title Remove Old Club Price Watch Weekly Task
echo This removes the old weekly task. It does not delete app files or prices.
schtasks /Query /TN "Club Price Watch Weekly Check" >nul 2>&1
if errorlevel 1 (
  echo The old task was not found or could not be queried. No changes made.
  pause
  exit /b 1
)
schtasks /Delete /TN "Club Price Watch Weekly Check" /F
if errorlevel 1 (
  echo Windows could not remove the task. Check its permissions in Task Scheduler.
  pause
  exit /b 1
)
echo The old weekly task was removed. Manual price checks are unchanged.
pause
