#!/usr/bin/env pwsh
# run-prod.ps1 — Prod stack (compose up, production-like)
# Usage: run-prod.ps1 [-Force]
# -Force: docker compose down -v first (wipes DB volume)
Set-StrictMode -Version Latest

param(
    [switch]$Force
)

if ($Force) {
    Write-Host "==> Stopping and removing volumes..."
    docker compose down -v
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "==> Starting production stack..."
Write-Host "    Frontend (nginx): http://localhost:5173"
Write-Host "    Backend:          http://localhost:4001"
Write-Host "    Database:         localhost:5433"
docker compose up --build