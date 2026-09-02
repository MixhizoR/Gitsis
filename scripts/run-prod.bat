@echo off
REM run-prod.bat — Prod stack (compose up, production-like)
REM Usage: run-prod.bat [--force]
REM --force: docker compose down -v first (wipes DB volume)

set FORCE=0
if "%~1"=="--force" set FORCE=1

if %FORCE%==1 (
    echo ==^> Stopping and removing volumes...
    docker compose down -v
    if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
)

echo ==^> Starting production stack...
echo    Frontend (nginx): http://localhost:5173
echo    Backend:          http://localhost:4001
echo    Database:         localhost:5433
docker compose up --build