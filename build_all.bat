@echo off
setlocal
title "Build Pharmacy POS and Khata System"

echo ========================================================
echo    BUILDING PHARMACY POS (C++ BACKEND + BOOTSTRAP UI)
echo ========================================================
echo.

if exist "C:\msys64\ucrt64\bin" (
    set "PATH=C:\msys64\ucrt64\bin;%PATH%"
)

echo [1/3] Compiling C++ Backend...
cd /d "%~dp0backend"
taskkill /f /im pharmacy_server.exe >nul 2>nul
g++.exe -std=c++20 -O2 -Iinclude src/main.cpp src/db.cpp -lsqlite3 -lws2_32 -lssl -lcrypto -lcrypt32 -o pharmacy_server.exe
if errorlevel 1 (
    echo [Error] C++ build failed!
    exit /b 1
)
echo [OK] C++ Backend compiled successfully.

echo.
echo [2/3] Building React Frontend with Bootstrap 5.3...
cd /d "%~dp0frontend"
call npm.cmd run build
if errorlevel 1 (
    echo [Error] Frontend build failed!
    exit /b 1
)
echo [OK] React Frontend built successfully.

echo.
echo [3/3] Packaging distribution into backend...
cd /d "%~dp0"
if exist "backend\dist" rmdir /s /q "backend\dist"
mkdir "backend\dist"
xcopy /e /i /y "frontend\dist\*" "backend\dist\" > nul
echo [OK] Distribution files copied to backend\dist.

echo.
echo ========================================================
echo           PRODUCTION BUILD COMPLETED SUCCESSFULLY!
echo ========================================================
echo.
exit /b 0
