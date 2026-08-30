@echo off
chcp 65001 >nul 2>&1
title 期货数据分析平台

:: 设置工作目录为脚本所在目录
cd /d "%~dp0"

:: 检查 serve_local.js
if not exist "scripts\serve_local.js" (
    echo [错误] 找不到 scripts\serve_local.js
    pause
    exit /b 1
)

:: 打开浏览器（延迟 2 秒等服务启动）
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:4173"

:: 启动服务（前台运行，窗口关闭即停止）
echo   期货数据分析平台已启动: http://localhost:4173
echo   数据代理: /api/sina/kline
echo   关闭此窗口即可停止服务
echo.
node scripts\serve_local.js
pause
