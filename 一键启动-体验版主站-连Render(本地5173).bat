@echo off
setlocal EnableExtensions

REM ASCII-only. Same as "一键启动-本地测试.bat" but NO local API: only static docs.
REM API: Render (via docs/config.js + ?jml_api=render + sessionStorage).
REM To use local server again later: open http://localhost:5173/?jml_api=local

set "WEB_PORT=5173"

pushd "%~dp0" || (
  echo Failed to enter script directory: "%~dp0"
  pause
  exit /b 1
)

echo.
echo [JML] ROOT: %CD%
echo [JML] WEB : http://localhost:%WEB_PORT%/?jml_api=render  (Render API)
echo [JML] (No local node server; data is on Render)
echo.

echo [JML] Starting WEB (docs only)...
start "JML WEB (docs Render)" cmd /k call npx http-server "%~dp0docs" -p %WEB_PORT% -c-1

echo [JML] Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/?jml_api=render"

popd
endlocal
exit /b 0
