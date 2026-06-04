@echo off
cd /d C:\pitaya-bridge
echo Download probe-goods-table.js ...
powershell -NoProfile -Command "(New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/RallaRa/pitaya-os/main/pos_bridge/probe-goods-table.js','C:\pitaya-bridge\probe-goods-table.js')"
if not exist probe-goods-table.js (
  echo Download failed. Check internet or copy file manually.
  pause
  exit /b 1
)
node probe-goods-table.js
if errorlevel 1 pause & exit /b 1
echo.
type probe-goods-table.txt
echo.
echo notepad probe-goods-table.txt
pause
