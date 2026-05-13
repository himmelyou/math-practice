@echo off
setlocal EnableExtensions

REM ASCII-only file to avoid encoding issues.
REM This script starts:
REM - Local API (DATA_DIR points to repo server\data)
REM - One static server on :8081 serving repo root
REM   - User app: /docs/?jml_api=local  (force local API even on LAN IP)
REM   - Admin:    /admin/index.html?jml_api=local

set "API_PORT=3001"
set "WEB_PORT=8081"

pushd "%~dp0" || exit /b 1

echo [JML] ROOT: %CD%
echo [JML] API : http://localhost:%API_PORT%/
echo [JML] WEB : http://localhost:%WEB_PORT%/
echo.

REM Try to detect a LAN IPv4 address for phone testing.
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%i"
if not "%LAN_IP%"=="" (
  echo [JML] PHONE: http://%LAN_IP%:%WEB_PORT%/docs/?jml_api=local
  echo http://%LAN_IP%:%WEB_PORT%/docs/?jml_api=local | clip
  echo [JML] (copied phone URL to clipboard)
  echo.
)

echo [JML] Starting API (repo data)...
start "JML API (Local)" cmd /k call set "DATA_DIR=%~dp0server\data" ^&^& call node "%~dp0server\server.js"

echo [JML] Starting WEB (root on 8081)...
REM Use "." after pushd to avoid quoting issues on non-ascii paths.
REM Bind to 0.0.0.0 so phones on same WiFi can access.
start "JML WEB (8081 root)" cmd /k call npx http-server . -a 0.0.0.0 -p %WEB_PORT% -c-1

echo [JML] Opening browser tabs...
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/docs/?jml_api=local"
start "" "http://localhost:%WEB_PORT%/admin/index.html?jml_api=local"

popd
endlocal
exit /b 0

