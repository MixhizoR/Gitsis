@echo off
REM pre-push-check.bat — Pre-push kontrol: her push oncesi calistir.
REM Tum islemler ephemeral Docker containerlarinda calisir (bkz. docker-compose.dev-tools.yml).

echo ==^> Pre-push: format duzeltme (Docker)...
call scripts\format-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: lint (Docker)...
call scripts\lint-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: format kontrol (Docker)...
call scripts\format-check-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: test (Docker)...
call scripts\test-docker.bat
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Tum kontroller basarili. Push devam edebilir.