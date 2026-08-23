Option Explicit

Dim shell, fileSystem, scriptDirectory, powershellPath, watcherPath, command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & _
  "\System32\WindowsPowerShell\v1.0\powershell.exe"
watcherPath = fileSystem.BuildPath(scriptDirectory, "watch-ideal-day.ps1")
command = Chr(34) & powershellPath & Chr(34) & _
  " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & _
  Chr(34) & watcherPath & Chr(34)

' Window style 0 is fully hidden. WScript itself is a GUI process, so there is
' no console window to flash before PowerShell applies -WindowStyle Hidden.
shell.Run command, 0, False
