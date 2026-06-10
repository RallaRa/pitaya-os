' Hidden sales backfill batch
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c """ & root & "\run-sync-batch.bat"""
sh.Run cmd, 0, False
