#!/usr/bin/env pwsh
# format-docker.ps1 — backend + frontend format (auto-fix) inside ephemeral Docker containers.
# Source is mounted so prettier --write lands on host files.
Set-StrictMode -Version Latest

Write-Host "==> Format: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-format
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Format: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Format tamamlandi."