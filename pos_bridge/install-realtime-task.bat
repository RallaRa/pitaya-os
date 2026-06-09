@echo off
chcp 65001 >nul
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set BAT=%ROOT%\run-realtime.bat
set VBS=%ROOT%\run-realtime-hidden.vbs

if not exist "%ROOT%\bridge.js" (
  echo [오류] bridge.js 없음: %ROOT%
  pause
  exit /b 1
)

echo Pitaya POS Bridge — Windows 작업 등록 (로그인 시 백그라운드)
echo 폴더: %ROOT%
echo.

schtasks /create /tn "PitayaPosBridgeRealtime" /tr "\"%VBS%\"" /sc onlogon /rl highest /f
if errorlevel 1 (
  echo [실패] 관리자 권한 CMD에서 다시 실행하세요.
  pause
  exit /b 1
)

echo.
echo 등록 완료: PitayaPosBridgeRealtime
echo - PC 로그인할 때마다 자동 실행 (창 없음)
echo - 로그: %ROOT%\realtime.log
echo.
echo 지금 바로 시작:
start "" "%VBS%"
echo.
echo 중지:  schtasks /end /tn "PitayaPosBridgeRealtime"
echo 삭제:  schtasks /delete /tn "PitayaPosBridgeRealtime" /f
pause
