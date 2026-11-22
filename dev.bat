@echo off
title Pharmacy POS - Development Mode (Vite HMR)
echo ===================================================
echo   Starting Pharmacy POS in LIVE DEV MODE (Vite HMR)
echo ===================================================
echo.

:: Add MSYS2 compiler to PATH if needed for backend
set "PATH=C:\msys64\ucrt64\bin;%PATH%"

:: 1. Start C++ Backend in the background (server-only mode, port 8085)
echo [1/2] Starting C++ SQLite Backend on port 8085...
start "Pharmacy Backend" /min cmd /c "cd /d %~dp0backend && .\pharmacy_server.exe --server-only"

:: Wait 1 second for backend port to bind
timeout /t 1 /nobreak >nul

:: 2. Start Vite Dev Server (port 5173 with HMR and OneDrive polling)
echo [2/2] Starting Vite Frontend on http://localhost:5173...
cd /d %~dp0frontend
npm run dev
