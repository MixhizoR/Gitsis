@echo off
REM ============================================================================
REM run-prod.bat  —  Prod-benzeri stack (compose.yaml) baslatir.
REM  - Mevcut ehsim_* container'lari calisiyorsa uyari verir (--force ile bypass).
REM  - Once down ile temizler, sonra -d --build ile up eder.
REM  - Durum ozetini yazdirir. -v kullanmaz (postgres volume korunur).
REM  - Kullanim: scripts\run-prod.bat [--force]
REM ============================================================================

setlocal enabledelayedexpansion

set FORCE=0
if "%~1"=="--force" set FORCE=1

echo ^>^>^> Mevcut ehsim_* container'lari kontrol ediliyor...

docker ps --format "{{.Names}}" | findstr /R "^ehsim_(pg\|api\|web\|migrate)$" >nul
if not errorlevel 1 (
    if %FORCE% neq 1 (
        echo ^!^!^! Calisan ehsim container'lari var. Once 'docker compose down' ile durdur
        echo     veya --force ile devam et (port conflict riski var).
        exit /b 1
    )
    echo ^>^>^> --force: mevcut container'lar yikilacak, devam ediliyor.
)

echo ^>^>^> Prod-benzeri stack indiriliyor (varsa)...
docker compose down --remove-orphans || true

echo ^>^>^> Build + up (detached)...
docker compose up -d --build

echo ^>^>^> Servis durumu:
docker compose ps
echo.
echo ^>^>^> Loglar:    docker compose logs -f
echo ^>^>^> Durdur:    docker compose down