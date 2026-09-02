@echo off
REM test-docker.bat — backend + frontend tests inside ephemeral Docker containers.
REM Backend test starts its own Postgres (db service) via depends_on.

echo ==^> Test: backend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm backend-test
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Test: frontend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm frontend-test
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Test tamamlandi.