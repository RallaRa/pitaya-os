@echo off
chcp 65001 >nul
cd /d C:\pitaya-bridge
if not exist pos-member-watcher.js (
  echo [member-watcher] pos-member-watcher.js 없음>> member-watcher.log
  exit /b 1
)
:loop
echo [%date% %time%] start>> member-watcher.log
node pos-member-watcher.js >> member-watcher.log 2>&1
echo [%date% %time%] exit code %ERRORLEVEL%, restart in 5s>> member-watcher.log
ping 127.0.0.1 -n 6 >nul
goto loop
