@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "bridge.js" (
  echo [오류] bridge.js 없음 >> "%~dp0realtime.log"
  exit /b 1
)
echo [%date% %time%] Pitaya bridge realtime 시작 >> "%~dp0realtime.log"
node bridge.js realtime >> "%~dp0realtime.log" 2>&1
