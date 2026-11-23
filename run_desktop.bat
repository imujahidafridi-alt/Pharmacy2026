@echo off
setlocal
title "A1 Pharmacy — Desktop Launcher"

echo ========================================================
echo   PAK PHARMACY & RETAIL POS - DESKTOP NATIVE LAUNCHER
echo ========================================================
echo.

:: Ensure MinGW / MSYS2 ucrt64 runtime DLLs are in PATH
if exist "C:\msys64\ucrt64\bin" (
    set "PATH=C:\msys64\ucrt64\bin;%PATH%"
)

cd /d "%~dp0backend"

if not exist "pharmacy_server.exe" (
    echo [Error] pharmacy_server.exe not found! Please build the backend first.
    pause
    exit /b 1
)

:: Check if pharmacy_server.exe is already running
tasklist /fi "imagename eq pharmacy_server.exe" 2>NUL | find /i "pharmacy_server.exe" >NUL
if errorlevel 1 (
    echo Starting C++ High-Performance Server...
    start /min "" pharmacy_server.exe --no-window
    timeout /t 1 /nobreak >nul
) else (
    echo Server is already running.
)

:: Launch Dedicated Native Desktop Window (Standalone App Mode)
:: A private profile gives the app its own taskbar icon and keeps it separate
:: from the user's normal browser windows and settings.
echo Launching A1 Pharmacy Counter Terminal...
set "APP_PROFILE=%LOCALAPPDATA%\PharmacyPOS\DesktopApp"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:8085/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:8085/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:8085/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else (
    start http://127.0.0.1:8085/
)

exit /b 0
