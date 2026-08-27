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
echo  This script will download and install it automatically.
echo.
echo  Press any key to continue, or close this window to cancel...
pause >nul

echo.
echo  [1/2] Downloading VC++ Redistributable...
echo  ----------------------------------------
set "VCREDIST_EXE=%TEMP%\vc_redist.x64.exe"
set "VCREDIST_URL=https://aka.ms/vs/17/release/vc_redist.x64.exe"

echo   URL: %VCREDIST_URL%
echo   Save to: %VCREDIST_EXE%
echo.

REM Try PowerShell to download (available on all modern Windows)
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%VCREDIST_URL%' -OutFile '%VCREDIST_EXE%' -UseBasicParsing; Write-Host '✓ Download complete' } catch { Write-Host '✗ Download failed:' $_.Exception.Message; exit 1 }"

if not exist "%VCREDIST_EXE%" (
    echo.
    echo   ✗ Download failed. Please download manually from:
    echo   %VCREDIST_URL%
    pause
    exit /b 1
)

echo.
echo  [2/2] Installing VC++ Redistributable...
echo  ----------------------------------------
echo   Running installer (may show UAC prompt)...
echo.

"%VCREDIST_EXE%" /install /quiet /norestart
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% EQU 0 (
    echo   ✓ Installation successful!
    echo   VC++ Runtime is now installed.
    echo.
    echo   You can now run ARAY.exe
) else if %EXITCODE% EQU 1638 (
    echo   ✓ Already installed (newer version exists)
    echo   VC++ Runtime is present on your system.
) else (
    echo   ⚠ Installer exited with code: %EXITCODE%
    echo   Try running this script as Administrator.
)

echo.
echo  Press any key to close...
pause >nul

REM Cleanup
del "%VCREDIST_EXE%" 2>nul
