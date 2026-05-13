@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ASCII-only. LAN phone test: http-server on 8081.
REM - Phone: open http://<auto-ip>:8081/docs/?jml_api=render  (force Render API)
REM - Desktop: open localhost docs with ?jml_api=render, then open admin page for management.

set "WEB_PORT=8081"
set "LAN_IP="

REM Prefer private IPv4; skip common virtual adapters
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "$c = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.') -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|Virtual|VMware|Hyper-V|WSL|Loopback|TAP' } ^| Select-Object -First 1; if ($c) { $c.IPAddress }"`) do set "LAN_IP=%%a"

if not defined LAN_IP (
  for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "$c = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1; if ($c) { $c.IPAddress }"`) do set "LAN_IP=%%a"
)

pushd "%~dp0" || exit /b 1

echo [JML] ROOT: %CD%
REM Pipe in (...) must use ^| or cmd breaks with bogus errors (e.g. tlocal)
if defined LAN_IP (
  echo [JML] Phone URL: http://%LAN_IP%:%WEB_PORT%/docs/?jml_api=render
  echo http://%LAN_IP%:%WEB_PORT%/docs/?jml_api=render ^| clip
  echo [JML] Copied URL to clipboard. Paste on phone.
) else (
  echo [JML] Could not auto-detect LAN IPv4. Run ipconfig, use Wi-Fi IPv4 manually.
  echo [JML] Example: http://192.168.x.x:%WEB_PORT%/docs/?jml_api=render
)
echo.
echo [JML] Starting http-server on 0.0.0.0:%WEB_PORT% ...
echo [JML] If blocked, allow through Windows Firewall (Private network).

start "JML WEB (LAN 8081 docs)" cmd /k call npx http-server . -a 0.0.0.0 -p %WEB_PORT% -c-1

timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/docs/?jml_api=render"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%WEB_PORT%/admin/index.html?jml_api=render"

popd
endlocal
exit /b 0
