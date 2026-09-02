#!/usr/bin/env pwsh
# format-check-docker.ps1 — backend + frontend format check inside ephemeral Docker containers.
# Exit code propagates (CI-style gate).
Set-StrictMode -Version Latest

Write-Host "==> Format check: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-format-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Format check: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Format kontrol tamamlandi."