@echo off
REM Hidden KT Caller restart loop (no timeout popup)
cd /d C:\pitaya-os
:loop
echo [%date% %time%] kt-caller start>>kt-caller-supervisor.log
node kt-caller.js >>kt-caller-supervisor.log 2>&1
echo [%date% %time%] kt-caller exit %ERRORLEVEL% restart>>kt-caller-supervisor.log
ping 127.0.0.1 -n 6 >nul
goto loop
