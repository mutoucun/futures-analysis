' Launcher: Futures Data Analysis Platform (offline)
' ==================================================
' Double-click : make sure local service (127.0.0.1:4173) is running, then open default browser
' With "silent": start service in background only (used by Windows startup shortcut)
' The node service runs hidden; stop it via Task Manager (node.exe) if needed.
Option Explicit

Dim fso, shell, projDir, url, silent, running, http, arg

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:4173"

silent = False
For Each arg In WScript.Arguments
  If LCase(arg) = "silent" Then silent = True
Next

' probe whether the service is already up
running = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", url, False
http.Send
If Err.Number = 0 Then
  If http.Status = 200 Then running = True
End If
Err.Clear
On Error Goto 0

' start hidden if not running (node process stays in background)
If Not running Then
  shell.CurrentDirectory = projDir
  shell.Run "cmd /c node scripts\serve_local.js", 0, False
  WScript.Sleep 1200
End If

If Not silent Then
  shell.Run url
End If
