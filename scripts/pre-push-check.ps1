#!/usr/bin/env pwsh
# pre-push-check.ps1 — Pre-push kontrol: her push oncesi calistir.
# Tum islemler ephemeral Docker containerlarinda calisir (bkz. docker-compose.dev-tools.yml).
Set-StrictMode -Version Latest

Write-Host "==> Pre-push: format duzeltme (Docker)..."
& .\scripts\format-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Pre-push: lint (Docker)..."
& .\scripts\lint-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Pre-push: format kontrol (Docker)..."
& .\scripts\format-check-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Pre-push: test (Docker)..."
& .\scripts\test-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Tum kontroller basarili. Push devam edebilir."