Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run chr(34) & strPath & "\run_desktop.bat" & Chr(34), 0
Set WshShell = Nothing
