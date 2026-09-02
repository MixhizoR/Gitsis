@echo off
REM run-dev.bat — Dev stack (compose up with hot reload)
REM Usage: run-dev.bat [--force]
REM --force: docker compose down -v first (wipes DB volume)

set FORCE=0
if "%~1"=="--force" set FORCE=1

if %FORCE%==1 (
    echo ==^> Stopping and removing volumes...
    docker compose down -v
    if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
)

echo ==^> Starting dev stack (hot reload enabled)...
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:4001
echo    Database: localhost:5433
docker compose up --build