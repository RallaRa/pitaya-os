' Hidden KT Caller loop — no CMD flash
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd /c """ & root & "\kt-caller-run.cmd"""
sh.Run cmd, 0, False
