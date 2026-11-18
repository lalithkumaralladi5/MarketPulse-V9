@echo off
cd /d "%~dp0"
where javac >nul 2>&1
if errorlevel 1 (
  echo Java JDK 21 was not found. Install Java 21 JDK and reopen this file.
  pause
  exit /b 1
)
if not exist backend\classes mkdir backend\classes
javac --release 21 -d backend\classes backend\MarketPulseServer.java backend\UpstoxAdapter.java backend\PulseCopilot.java backend\MarketUniverse.java backend\MlBridge.java
if errorlevel 1 (pause & exit /b 1)
echo.
echo OPEN http://127.0.0.1:8765 in your browser
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process http://127.0.0.1:8765"
java -cp backend\classes MarketPulseServer
pause
