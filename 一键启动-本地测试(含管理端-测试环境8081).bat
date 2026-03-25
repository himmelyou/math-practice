@echo off
setlocal EnableExtensions

REM ASCII-only file to avoid encoding issues.
REM This script starts:
REM - Local API (DATA_DIR points to repo server\data)
REM - One static server on :8081 serving repo root
REM   - User app: /docs/  (uses local API because host is localhost:8081)
REM   - Admin:    /admin/ (also uses local API on :8081)

set "API_PORT=3001"
set "WEB_PORT=8081"

pushd "%~dp0" || exit /b 1

echo [JML] ROOT: %CD%
echo [JML] API : http://localhost:%API_PORT%/
echo [JML] WEB : http://localhost:%WEB_PORT%/
echo.

echo [JML] Starting API (repo data)...
start "JML API (Local)" cmd /k call set "DATA_DIR=%~dp0server\data" ^&^& call node "%~dp0server\server.js"

echo [JML] Starting WEB (root on 8081)...
REM Use "." after pushd to avoid quoting issues on non-ascii paths.
REM Bind to 127.0.0.1 only to avoid LAN exposure.
start "JML WEB (8081 root)" cmd /k call npx http-server . -a 127.0.0.1 -p %WEB_PORT% -c-1

echo [JML] Opening browser tabs...
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/docs/"
start "" "http://localhost:%WEB_PORT%/admin/"

popd
endlocal
exit /b 0

