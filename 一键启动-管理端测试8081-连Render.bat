@echo off
setlocal EnableExtensions

REM Like "一键启动-本地测试(含管理端-测试环境8081).bat" but NO local API.
REM Repo root on 8081; API = Render (open docs first with ?jml_api=render so sessionStorage is set).
REM Switch back to local API: open http://localhost:8081/docs/?jml_api=local

set "WEB_PORT=8081"

pushd "%~dp0" || exit /b 1

echo [JML] ROOT: %CD%
echo [JML] WEB : http://localhost:%WEB_PORT%/docs/?jml_api=render  (Render API)
echo [JML] (No local node server)
echo.

start "JML WEB (8081 Render)" cmd /k call npx http-server . -a 127.0.0.1 -p %WEB_PORT% -c-1

timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/docs/?jml_api=render"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/admin/index.html?jml_api=render"

popd
endlocal
exit /b 0
