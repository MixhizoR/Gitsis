@echo off
REM lint-docker.bat — backend + frontend lint inside ephemeral Docker containers.

echo ==^> Lint: backend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm backend-lint
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Lint: frontend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm frontend-lint
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Lint tamamlandi.