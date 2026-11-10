@echo off
setlocal
title Club Price Watch - Check Prices Now
echo Keep the local app running before starting a price check.
"%~dp0ClubPriceWatch.Checker.exe"
echo.
echo Read the checker tab for results. Opening a tab does not verify prices.
pause
