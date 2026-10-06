@echo off
rem Start the local server (if needed) and open "Manabi Lab" in the browser.
rem   start.bat            -> entrance page (all apps)
rem   start.bat god-view   -> one app (folder name)
rem Apps split into css/js files do not run from file://, so open them through this.
rem Keep this file ASCII only (cmd.exe reads .bat in the ANSI code page, so UTF-8 Japanese turns into garbage).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\start.ps1 %1
if errorlevel 1 pause
