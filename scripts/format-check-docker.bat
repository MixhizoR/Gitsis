@echo off
REM format-check-docker.bat — backend + frontend format check inside ephemeral Docker containers.
REM Exit code propagates (CI-style gate).

echo ==^> Format check: backend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm backend-format-check
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Format check: frontend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format-check
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Format kontrol tamamlandi.