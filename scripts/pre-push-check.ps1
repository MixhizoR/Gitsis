#!/usr/bin/env pwsh
# pre-push-check.ps1 — Pre-push kontrol: her push oncesi calistir.
# Tum islemler dogrudan pnpm ile (Docker'siz) calisir.
$ErrorActionPreference = 'Stop'

Write-Host "==> Pre-push: format duzeltme (backend + frontend)..."
Push-Location backend;  pnpm run format;  Pop-Location
Push-Location frontend; pnpm run format;  Pop-Location

Write-Host "==> Pre-push: lint (backend)..."
Push-Location backend;  pnpm run lint;    Pop-Location

Write-Host "==> Pre-push: lint (frontend)..."
Push-Location frontend; pnpm run lint;    Pop-Location

Write-Host "==> Pre-push: format kontrol (backend + frontend)..."
Push-Location backend;  pnpm run format:check; Pop-Location
Push-Location frontend; pnpm run format:check; Pop-Location

Write-Host "==> Pre-push: test (backend, DB servisi gerekir)..."
Push-Location backend
$env:JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { 'ci-test-secret' }
pnpm run test
Pop-Location

Write-Host "==> Pre-push: test (frontend)..."
Push-Location frontend; pnpm run test; Pop-Location

Write-Host "==> Tum kontroller basarili. Push devam edebilir."
