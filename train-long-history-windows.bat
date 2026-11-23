@echo off
cd /d "%~dp0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0train-long-history-windows.ps1"
if errorlevel 1 pause
