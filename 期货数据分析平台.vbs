' 期货数据分析平台 - 启动脚本
' 后台启动本地服务（含新浪数据代理），然后打开浏览器

Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")

' 项目根目录（本文件所在目录）
projectDir = Fso.GetParentFolderName(WScript.ScriptFullName)
serveScript = projectDir & "\scripts\serve_local.js"

' 查找 node.exe（优先完整路径，其次 PATH）
nodeExe = ""
If Fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf Fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
    nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
Else
    ' 尝试从 PATH 中查找
    On Error Resume Next
    Set exec = WshShell.Exec("cmd /c where node")
    nodeExe = Trim(exec.StdOut.ReadLine())
    On Error GoTo 0
End If

If nodeExe = "" Then
    MsgBox "未检测到 Node.js，请先安装" & vbCrLf & "https://nodejs.org", 16, "期货数据分析平台"
    WScript.Quit
End If

If Not Fso.FileExists(serveScript) Then
    MsgBox "找不到 scripts\serve_local.js" & vbCrLf & "项目路径: " & projectDir, 16, "期货数据分析平台"
    WScript.Quit
End If

' 后台启动服务（窗口隐藏）
cmd = """" & nodeExe & """ """ & serveScript & """"
WshShell.Run cmd, 0, False
WScript.Sleep 2000

' 打开浏览器
WshShell.Run "http://localhost:4173"
