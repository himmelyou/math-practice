@echo off
setlocal EnableExtensions

REM ASCII-only file to avoid encoding issues.
REM Admin static server on 8080 will use Render API per docs/config.js.

set "ADMIN_PORT=8080"

pushd "%~dp0" || exit /b 1

echo [ADMIN] Starting local admin static server on %ADMIN_PORT%...
echo [ADMIN] (This will use Render API per docs/config.js)

start "JML ADMIN (Prod 8080)" cmd /k call set "ADMIN_PORT=%ADMIN_PORT%" ^&^& call node "%~dp0local-admin-server.js"

timeout /t 1 /nobreak >nul
start "" "http://localhost:%ADMIN_PORT%/admin/"

popd
endlocal
exit /b 0

