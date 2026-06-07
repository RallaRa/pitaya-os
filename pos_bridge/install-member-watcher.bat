@echo off
chcp 65001 >nul
cd /d C:\pitaya-bridge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-member-watcher.ps1"
pause
