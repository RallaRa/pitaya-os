@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Pitaya bridge.js 자동 교체
echo ========================================
echo.

REM bridge.js 위치 찾기
echo [1/4] bridge.js 위치 찾는 중...
for /f "delims=" %%i in ('where /r C:\ bridge.js 2^>nul') do set BRIDGE_PATH=%%i

if "%BRIDGE_PATH%"=="" (
  echo 찾지 못했습니다. 폴더를 직접 지정하세요.
  set /p BRIDGE_PATH="bridge.js 전체 경로 입력 (예: C:\pitaya\bridge.js): "
)

echo 발견: %BRIDGE_PATH%
for %%i in ("%BRIDGE_PATH%") do set BRIDGE_DIR=%%~dpi

REM 해당 폴더로 이동
cd /d "%BRIDGE_DIR%"
echo [2/4] 폴더 이동: %BRIDGE_DIR%

REM 기존 파일 백업
echo [3/4] 기존 파일 백업 중...
copy bridge.js bridge.js.bak >nul
echo 백업 완료: bridge.js.bak

REM 새 파일 다운로드
echo [4/4] 새 파일 다운로드 중...
curl -s -o bridge.js https://raw.githubusercontent.com/RallaRa/pitaya-os/main/pos_bridge/bridge.js

if %errorlevel% neq 0 (
  echo.
  echo 다운로드 실패. 인터넷 연결 확인 후 다시 실행하세요.
  echo 실패 시 bridge.js.bak 으로 복구: copy bridge.js.bak bridge.js
  pause
  exit /b 1
)

echo.
echo ========================================
echo   교체 완료!
echo ========================================
echo.
echo 정상 작동 확인 중...
echo.
node bridge.js --dry-run

echo.
echo 위에 오류 없으면 완료입니다.
echo.
pause
