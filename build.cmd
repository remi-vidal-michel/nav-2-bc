@echo off
rem Double-cliquez sur ce fichier pour construire dist\Mapping_NAV_BC.html
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node build.js
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
)
pause
