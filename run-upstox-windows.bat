@echo off
cd /d "%~dp0"
REM Required Upstox-only launcher: never silently starts the synthetic demo.
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-upstox-windows.ps1"
if errorlevel 1 pause
