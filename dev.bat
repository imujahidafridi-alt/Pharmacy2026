@echo off
setlocal
title Pharmacy POS - Development Mode (Taskbar App Window)
echo ===================================================
echo   Starting Pharmacy POS in LIVE DEV MODE (Vite HMR)
echo ===================================================
echo.

:: Add MSYS2 compiler to PATH if needed for backend
set "PATH=C:\msys64\ucrt64\bin;%PATH%"

:: 1. Start C++ Backend in the background (server-only mode, port 8085)
echo [1/3] Starting C++ SQLite Backend on port 8085...
start "Pharmacy Backend" /min cmd /c "cd /d %~dp0backend && .\pharmacy_server.exe --server-only"

:: Wait for backend port to bind
timeout /t 1 /nobreak >nul

:: 2. Start Vite Dev Server without opening a browser tab
echo [2/3] Starting Vite Frontend on http://127.0.0.1:5173...
start "Pharmacy Vite Dev Server" /min cmd /c "cd /d %~dp0frontend && npm run dev"

:: Wait until Vite is accepting connections
set /a attempts=0
:wait_for_vite
curl.exe -s -o nul http://127.0.0.1:5173/
if not errorlevel 1 goto launch_app
set /a attempts+=1
if %attempts% GEQ 30 (
    echo [Warning] Vite did not respond in time - launching the app window anyway.
    goto launch_app
)
timeout /t 1 /nobreak >nul
goto wait_for_vite

:: 3. Launch a dedicated, standalone taskbar app window (not a browser tab)
:launch_app
echo [3/3] Opening standalone Pharmacy POS app window...
set "APP_PROFILE=%LOCALAPPDATA%\PharmacyPOS\DevAppWindow"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:5173/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:5173/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:5173/ --window-size=1366,768 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check
) else (
    start http://127.0.0.1:5173/
)

echo.
echo Dev environment ready:
echo   - Backend REST API: http://127.0.0.1:8085
echo   - Vite dev server: http://127.0.0.1:5173
echo Close the two minimized server windows to stop the environment.
exit /b 0
