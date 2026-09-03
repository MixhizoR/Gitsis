#!/usr/bin/env pwsh
# lint-docker.ps1 — backend + frontend lint inside ephemeral Docker containers.
Set-StrictMode -Version Latest

Write-Host "==> Lint: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Lint: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Lint tamamlandi."