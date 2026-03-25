@echo off
setlocal EnableExtensions

REM NOTE: Keep this file ASCII-only to avoid encoding issues.

set "API_PORT=3001"
set "WEB_PORT=5173"

pushd "%~dp0" || (
  echo Failed to enter script directory: "%~dp0"
  pause
  exit /b 1
)

echo.
echo [JML] ROOT: %CD%
echo [JML] API : http://localhost:%API_PORT%/
echo [JML] WEB : http://localhost:%WEB_PORT%/
echo.

echo [JML] Starting API...
REM Force local API to use repo data folder (server\data)
start "JML API (Local)" cmd /k call set "DATA_DIR=%~dp0server\data" ^&^& call node "%~dp0server\server.js"

echo [JML] Starting WEB...
start "JML WEB (docs)" cmd /k call npx http-server "%~dp0docs" -p %WEB_PORT% -c-1

echo [JML] Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/"

popd
endlocal
exit /b 0

