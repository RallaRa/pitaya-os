@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  Pitaya POS Bridge - 고객 전화 재동기화
echo ========================================

if not exist "bridge.js" (
  echo [오류] bridge.js 없음
  pause
  exit /b 1
)

if not exist "node_modules" call npm install

echo.
echo [1/2] dry-run
node bridge.js sync-customers --dry-run
echo.

set /p GO="실제 동기화? (Y/N): "
if /i not "%GO%"=="Y" exit /b 0

echo [2/2] sync-customers
node bridge.js sync-customers
pause
