@echo off
REM pre-push-check-docker.bat — full pipeline inside Docker:
REM   format-check -> lint -> test
REM Each step is a gate (exit code propagates). DB starts automatically for
REM backend tests via the db service dependency.

echo ==^> Pre-push: format kontrol (Docker)...
call scripts\format-check-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: lint (Docker)...
call scripts\lint-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: test (Docker)...
call scripts\test-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Tum kontroller basarili. Push devam edebilir.