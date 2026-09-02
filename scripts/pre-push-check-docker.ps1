#!/usr/bin/env pwsh
# pre-push-check-docker.ps1 — full pipeline inside Docker:
#   format-check -> lint -> test
# Each step is a gate (exit code propagates). DB starts automatically for
# backend tests via the db service dependency.
Set-StrictMode -Version Latest

Write-Host "==> Pre-push: format kontrol (Docker)..."
& .\scripts\format-check-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Pre-push: lint (Docker)..."
& .\scripts\lint-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Pre-push: test (Docker)..."
& .\scripts\test-docker.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Tum kontroller basarili. Push devam edebilir."