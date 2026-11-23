@echo off
cd /d "%~dp0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-live-ml-windows.ps1"
if errorlevel 1 pause
