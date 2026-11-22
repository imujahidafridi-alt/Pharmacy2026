@echo off
setlocal
title Pharmacy POS Development Environment

echo ========================================================
echo         STARTING DEVELOPMENT SERVERS (C++ + VITE)
echo ========================================================
echo.

if exist "C:\msys64\ucrt64\bin" (
    set "PATH=C:\msys64\ucrt64\bin;%PATH%"
)

echo Starting C++ Backend on http://127.0.0.1:8085...
cd /d "%~dp0backend"
start "C++ Pharmacy REST Engine" cmd /k "pharmacy_server.exe --server-only"

ping 127.0.0.1 -n 3 > nul

echo Starting Vite React Dev Server on http://localhost:5173...
cd /d "%~dp0frontend"
start "Vite Dev Server" cmd /k "npm run dev"

echo.
echo Both servers started:
echo   - Backend REST API: http://127.0.0.1:8085
echo   - Frontend Vite UI: http://localhost:5173 (Hot Reloading)
echo.
pause
