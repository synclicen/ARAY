@echo off
chcp 65001 >nul
title Install Visual C++ Runtime for ARAY
color 0E

echo.
echo  ========================================
echo   ARAY — VC++ Runtime Installer
echo  ========================================
echo.
echo  Electron apps (like ARAY) require Microsoft Visual
echo  C++ Redistributable 2015-2022 to run.
echo.
echo  This script will install it. If a local copy of
echo  vc_redist.x64.exe exists in this folder, it will be used
echo  (no internet needed). Otherwise it will download.
echo.
echo  Press any key to continue, or close this window to cancel...
pause >nul

echo.
echo  [1/2] Locating VC++ Redistributable installer...
echo  ----------------------------------------

REM Try local copy first (bundled with ARAY)
set "VCREDIST_EXE=%~dp0vc_redist.x64.exe"

if exist "%VCREDIST_EXE%" (
    echo   ✓ Found local copy: %VCREDIST_EXE%
    goto :install
)

REM No local copy — download it
echo   Local copy not found. Downloading from Microsoft...
set "VCREDIST_EXE=%TEMP%\vc_redist.x64.exe"
set "VCREDIST_URL=https://aka.ms/vs/17/release/vc_redist.x64.exe"

powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%VCREDIST_URL%' -OutFile '%VCREDIST_EXE%' -UseBasicParsing; Write-Host '✓ Download complete' } catch { Write-Host '✗ Download failed:' $_.Exception.Message; exit 1 }"

if not exist "%VCREDIST_EXE%" (
    echo.
    echo   ✗ Download failed. Please download manually from:
    echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

:install
echo.
echo  [2/2] Installing VC++ Redistributable...
echo  ----------------------------------------
echo   Running: %VCREDIST_EXE%
echo.
echo   If you see a User Account Control (UAC) prompt,
echo   click YES to allow the installation.
echo.

"%VCREDIST_EXE%" /install /quiet /norestart
set EXITCODE=%ERRORLEVEL%

echo.
echo  ----------------------------------------
if %EXITCODE% EQU 0 (
    echo   ✓ Installation successful!
    echo   VC++ Runtime is now installed.
    echo.
    echo   You can now run ARAY.exe
) else if %EXITCODE% EQU 1638 (
    echo   ✓ Already installed (newer version exists)
    echo   VC++ Runtime is present on your system.
    echo.
    echo   You can now run ARAY.exe
) else if %EXITCODE% EQU 5100 (
    echo   ⚠ Installation failed (exit 5100)
    echo   Your Windows version may be too old.
    echo   ARAY requires Windows 10 or newer.
) else (
    echo   ⚠ Installer exited with code: %EXITCODE%
    echo   Try right-clicking this BAT file and choosing
    echo   "Run as administrator"
)

echo  ----------------------------------------
echo.
echo  Press any key to close...
pause >nul
