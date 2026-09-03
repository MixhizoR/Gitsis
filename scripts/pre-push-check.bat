@echo off
REM pre-push-check.bat — Pre-push kontrol: her push oncesi calistir.
REM Tum islemler dogrudan pnpm ile (Docker'siz) calisir.

echo ==^> Pre-push: format duzeltme (backend + frontend)...
cd /d "%~dp0..\backend"  && pnpm run format
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
cd /d "%~dp0..\frontend" && pnpm run format
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: lint (backend)...
cd /d "%~dp0..\backend" && pnpm run lint
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: lint (frontend)...
cd /d "%~dp0..\frontend" && pnpm run lint
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: format kontrol (backend + frontend)...
cd /d "%~dp0..\backend"  && pnpm run format:check
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
cd /d "%~dp0..\frontend" && pnpm run format:check
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: test (backend, DB servisi gerekir)...
cd /d "%~dp0..\backend" && set "JWT_SECRET=ci-test-secret" && pnpm test
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Pre-push: test (frontend)...
cd /d "%~dp0..\frontend" && pnpm test
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Tum kontroller basarili. Push devam edebilir.
