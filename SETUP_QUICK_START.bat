@echo off
REM JE Fitness Mobile App - Capacitor Quick Start Script (Windows)
REM Run this script to automate the initial setup process
REM Usage: SETUP_QUICK_START.bat

setlocal enabledelayedexpansion

echo.
echo ========================================
echo JE Fitness - Capacitor Mobile Setup
echo ========================================
echo.

REM Check prerequisites
echo Checking prerequisites...
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js not found. Please install Node.js v16+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [OK] Node.js !NODE_VER!

where npm >nul 2>nul
if errorlevel 1 (
    echo Error: npm not found. Please install npm
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo [OK] npm !NPM_VER!

where java >nul 2>nul
if errorlevel 1 (
    echo Error: Java not found. Please install JDK 11+
    pause
    exit /b 1
)
echo [OK] Java installed

echo.

REM Step 1: Install Capacitor
echo Step 1: Installing Capacitor...
call npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios --save
if errorlevel 1 (
    echo Error installing Capacitor
    pause
    exit /b 1
)
echo [OK] Capacitor installed
echo.

REM Step 2: Create www folder
echo Step 2: Creating www folder...
if not exist "www" (
    mkdir www
    echo [OK] www folder created
) else (
    echo [WARN] www folder already exists
)

REM Copy public files to www
echo Copying public files to www...
robocopy public www /E /IS
echo [OK] Public files copied
echo.

REM Step 3: Verify capacitor.config.ts exists
echo Step 3: Verifying Capacitor config...
if not exist "capacitor.config.ts" (
    echo Error: capacitor.config.ts not found
    echo Please create capacitor.config.ts at the project root
    pause
    exit /b 1
)
echo [OK] capacitor.config.ts found
echo.

REM Step 4: Initialize Capacitor
echo Step 4: Initializing Capacitor...
call npx cap init
if errorlevel 1 (
    echo Error initializing Capacitor
    pause
    exit /b 1
)
echo [OK] Capacitor initialized
echo.

REM Step 5: Add Android platform
echo Step 5: Adding Android platform...
call npx cap add android
if errorlevel 1 (
    echo Error adding Android platform
    pause
    exit /b 1
)
echo [OK] Android platform added
echo.

REM Step 6: Copy web files to platforms
echo Step 6: Syncing web files to platforms...
call npx cap sync
if errorlevel 1 (
    echo Error syncing files
    pause
    exit /b 1
)
echo [OK] Web files synced
echo.

REM Step 7: Run diagnostics
echo Step 7: Running Capacitor diagnostics...
call npx cap doctor
echo.

echo.
echo ========================================
echo [OK] Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Update API endpoints in public/js/api.config.js
echo 2. Update navigation links to use data-route attribute
echo 3. Convert fetch calls to use API class
echo 4. Test on Android Emulator:
echo    npx cap run android
echo.
echo For detailed instructions, see CAPACITOR_MIGRATION_GUIDE.md
echo.

pause