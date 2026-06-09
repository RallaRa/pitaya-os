' CMD 창 없이 bridge realtime 실행 (더블클릭 또는 작업 스케줄러에서 이 파일 실행)
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c cd /d """ & root & """ && node bridge.js realtime >> """ & root & "\realtime.log"" 2>&1"
sh.Run cmd, 0, False
