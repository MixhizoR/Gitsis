#!/bin/bash
# Pre-push kontrol: her push oncesi calistir. Hata varsa duzeltir veya durdurur.
# Tum islemler dogrudan pnpm ile (Docker'siz) calisir.
set -euo pipefail

echo "==> Pre-push: format duzeltme (backend + frontend)..."
( cd backend  && pnpm run format )
( cd frontend && pnpm run format )

echo "==> Pre-push: lint (backend)..."
( cd backend  && pnpm run lint )

echo "==> Pre-push: lint (frontend)..."
( cd frontend && pnpm run lint )

echo "==> Pre-push: format kontrol (backend + frontend)..."
( cd backend  && pnpm run format:check )
( cd frontend && pnpm run format:check )

echo "==> Pre-push: test (backend, DB servisi gerekir)..."
( cd backend  && JWT_SECRET="${JWT_SECRET:-ci-test-secret}" pnpm run test )

echo "==> Pre-push: test (frontend)..."
( cd frontend && pnpm run test )

echo "==> Tum kontroller basarili. Push devam edebilir."
