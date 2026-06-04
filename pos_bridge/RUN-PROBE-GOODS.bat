@echo off
cd /d C:\pitaya-bridge
echo [1/2] probe-goods-info.js ...
node probe-goods-info.js
if errorlevel 1 (
  echo FAILED - check DB .env or: npm install mssql dotenv
  pause
  exit /b 1
)
echo.
echo [2/2] 결과 파일:
type probe-goods-info.txt
echo.
echo 완료. notepad probe-goods-info.txt 로 전체 확인
pause
