#!/usr/bin/env pwsh
# test-docker.ps1 — backend + frontend tests inside ephemeral Docker containers.
# Backend test starts its own Postgres (db service) via depends_on.
Set-StrictMode -Version Latest

Write-Host "==> Test: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Test: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Test tamamlandi."