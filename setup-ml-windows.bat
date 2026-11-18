@echo off
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
 echo Python 3.11+ was not found. Install from https://www.python.org/downloads/ and select Add to PATH.
 pause
 exit /b 1
)
python -m pip install -r ml\requirements.txt
if errorlevel 1 (pause & exit /b 1)
echo.
echo ML dependencies installed. Train a model from historical data before requesting predictions.
pause
