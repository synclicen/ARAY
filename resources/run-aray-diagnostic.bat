@echo off
chcp 65001 >nul
title ARAY Diagnostic Launcher
color 0A

echo.
echo  ========================================
echo   ARAY — Are you Ready? and....Yapping!
echo   Diagnostic Launcher v1.0
echo  ========================================
echo.
echo  This script will:
echo   1. Check if Visual C++ Runtime is installed
echo   2. Run ARAY.exe and capture any errors
echo   3. Show you exactly what's happening
echo.
echo  Press any key to start...
pause >nul

echo.
echo  [1/3] Checking Visual C++ Runtime...
echo  ----------------------------------------

REM Check for VCRUNTIME140.dll in System32
if exist "C:\Windows\System32\VCRUNTIME140.dll" (
    echo   ✓ VCRUNTIME140.dll found in System32
) else (
    echo   ✗ VCRUNTIME140.dll NOT FOUND — Visual C++ Runtime missing!
    echo.
    echo   This is why ARAY won't open!
    echo   Electron requires Microsoft Visual C++ Redistributable.
    echo.
    echo   Please install it from:
    echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo.
    echo   After installing, run ARAY again.
    echo.
    pause
    exit /b 1
)

if exist "C:\Windows\System32\MSVCP140.dll" (
    echo   ✓ MSVCP140.dll found in System32
) else (
    echo   ✗ MSVCP140.dll NOT FOUND — Visual C++ Runtime missing!
    echo   Please install: https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

echo.
echo  [2/3] Checking ARAY.exe...
echo  ----------------------------------------
set "ARAY_EXE=%~dp0ARAY.exe"
if exist "%ARAY_EXE%" (
    echo   ✓ ARAY.exe found at: %ARAY_EXE%
) else (
    echo   ✗ ARAY.exe NOT FOUND at: %ARAY_EXE%
    echo   Make sure this BAT file is in the same folder as ARAY.exe
    pause
    exit /b 1
)

echo.
echo  [3/3] Launching ARAY.exe...
echo  ----------------------------------------
echo   Running: %ARAY_EXE%
echo.
echo   If ARAY closes immediately, the exit code below will tell us why:
echo   - 0 = success
echo   - -1073741515 (0xC0000135) = missing DLL
echo   - -1073741819 (0xC0000005) = access violation
echo   - 1 = generic error
echo.

"%ARAY_EXE%"
set EXITCODE=%ERRORLEVEL%

echo.
echo  ----------------------------------------
echo   ARAY.exe exited with code: %EXITCODE%
echo  ----------------------------------------
echo.

if %EXITCODE% EQU 0 (
    echo   ✓ ARAY ran successfully. Did you see the window?
) else if %EXITCODE% EQU -1073741515 (
    echo   ✗ ERROR: Missing DLL (STATUS_DLL_NOT_FOUND)
    echo   Install Visual C++ Redistributable:
    echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
) else if %EXITCODE% EQU -1073741819 (
    echo   ✗ ERROR: Access violation (STATUS_ACCESS_VIOLATION)
    echo   Try running as Administrator.
) else (
    echo   ⚠ ARAY exited with unexpected code.
    echo   Please screenshot this window and report it.
)

echo.
echo  Press any key to close...
pause >nul
