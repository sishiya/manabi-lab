@echo off
rem 神の視点マップ: ローカルのサーバーを起動してブラウザで開く（file:// では地球が表示できないため）
rem すでに 8765 番でサーバーが動いていれば、ブラウザを開くだけ
cd /d "%~dp0.."
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost',8765); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "god-view server" /min powershell -NoProfile -ExecutionPolicy Bypass -File .claude\serve.ps1 -Port 8765
  timeout /t 2 /nobreak >nul
)
start "" http://localhost:8765/god-view/
