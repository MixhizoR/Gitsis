@echo off
REM format-docker.bat — backend + frontend format (auto-fix) inside ephemeral Docker containers.
REM Source is mounted so prettier --write lands on host files.

echo ==^> Format: backend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm backend-format
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Format: frontend (Docker)...
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

echo ==^> Format tamamlandi.