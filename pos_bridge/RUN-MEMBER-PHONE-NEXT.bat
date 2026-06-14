@echo off
REM Pitaya — 회원 전화번호 다음단계 (POS PC에서 실행)
cd /d C:\pitaya-bridge

echo [1/5] Pitaya 서버에서 bridge/watcher 최신 파일 다운로드...
powershell -NoProfile -ExecutionPolicy Bypass -File RUN-MEMBER-PHONE-NEXT.ps1 -SkipSync
if errorlevel 1 goto :fail

set CODE=%1
if "%CODE%"=="" set CODE=98000001

echo.
echo [2/5] DB 건별 점검: %CODE%
node bridge.js probe-customer-one %CODE%
if errorlevel 1 goto :fail

echo.
echo [3/5] Pitaya 동기화: %CODE%
node bridge.js sync-customer-one %CODE%
if errorlevel 1 (
  echo sync-customer-one 실패 — Cus_HP/en_uKey2 없음. 회원정보 화면을 연 채 probe 실행...
  powershell -NoProfile -ExecutionPolicy Bypass -File probe-pos-member-screen.ps1
  goto :recent
)

:recent
echo.
echo [4/5] 최근 3일 방문 회원 일괄 동기화
node bridge.js sync-recent-customers 3

echo.
echo [5/5] 왓쳐 재설치
powershell -NoProfile -ExecutionPolicy Bypass -File install-member-watcher.ps1

echo.
echo 완료. Pitaya 고객관리에서 %CODE% 전화번호 확인하세요.
pause
exit /b 0

:fail
echo 실패. member-watcher.log / bridge 로그 확인
pause
exit /b 1
