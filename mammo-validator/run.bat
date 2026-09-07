@echo off
rem ===========================================================================
rem  Mammo QA Workbench - one-click launcher (Windows)
rem  Double-click this file or run it from a terminal.
rem
rem  Usage: run.bat [-Mode dev|build|start] [-Port 3000] [-NoOpen] [-NoInstall]
rem  Example: run.bat -Mode start -Port 8080
rem ===========================================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo Run failed with exit code %EXITCODE%.
    echo Check the message above - usually a missing Node.js or Python install.
    pause
)

endlocal & exit /b %EXITCODE%
