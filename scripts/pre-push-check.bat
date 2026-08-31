@echo off
REM Pre-push kontrol: her push oncesi calistir. Hata varsa duzeltir veya durdurur.
REM Windows equivalent of pre-push-check.sh

setlocal enabledelayedexpansion

echo ==^> Pre-push: format duzeltme...
cd /d "%~dp0..\backend" && npm run format || exit /b 1
cd /d "%~dp0..\frontend" && npm run format || exit /b 1

echo ==^> Pre-push: lint (backend)...
cd /d "%~dp0..\backend" && npm run lint || exit /b 1

echo ==^> Pre-push: lint (frontend)...
cd /d "%~dp0..\frontend" && npm run lint || exit /b 1

echo ==^> Pre-push: format kontrol (backend + frontend)...
cd /d "%~dp0..\backend" && npm run format:check || exit /b 1
cd /d "%~dp0..\frontend" && npm run format:check || exit /b 1

echo ==^> Pre-push: test (backend, DB servisi gerekir)...
cd /d "%~dp0..\backend" && set JWT_SECRET=ci-test-secret && npm test || exit /b 1

echo ==^> Pre-push: test (frontend)...
cd /d "%~dp0..\frontend" && npm test || exit /b 1

echo ==^> Tum kontroller basarili. Push devam edebilir.