@echo off
setlocal
rem {{PACK_NAME}} (page {{PAGE_TAG}}, built {{STAMP}}): the SOCOM II parity harness.
rem Starts the harness's checklist page in your browser (http://127.0.0.1:5390/).
rem Keep this window open while you play: closing it stops the harness and everything it started.
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "EPH_PACK=%ROOT%"
set "EPH_RUN_DIR=%ROOT%\pack\run"
set "SOCOM_PC_ROOT=%ROOT%\pack\harness\desktop-stub"
set "PATH=%ROOT%\pack\runtime;%PATH%"
set "PLAYWRIGHT_BROWSERS_PATH=%ROOT%\pack\runtime\ms-playwright"
echo Close this window to stop the harness.
"%ROOT%\pack\runtime\node.exe" "%ROOT%\pack\harness\harness.mjs" gui --open
