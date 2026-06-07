' CMD 창 없이 회원 감시 루프 실행 (작업 스케줄러 / 더블클릭)
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c """ & root & "\run-member-watcher-loop.bat"""
sh.Run cmd, 0, False
