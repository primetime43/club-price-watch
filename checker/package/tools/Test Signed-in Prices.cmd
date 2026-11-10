@echo off
setlocal
title Club Price Watch - Test Signed-in Prices
echo Keep the local app running. This test will not save prices.
echo Complete any BJ's verification in its product tabs if prompted.
"%~dp0ClubPriceWatch.Checker.exe" --dry-run
echo.
echo Read the checker tab for results. Opening a tab does not verify prices.
pause
