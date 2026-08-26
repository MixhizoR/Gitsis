#!/bin/bash
# Pre-push kontrol: her push oncesi calistir. Hata varsa duzeltir veya durdurur.
set -euo pipefail

echo "==> Pre-push: format duzeltme..."
(cd backend && npm run format) || exit 1
(cd frontend && npm run format) || exit 1

echo "==> Pre-push: lint (backend)..."
(cd backend && npm run lint) || exit 1

echo "==> Pre-push: lint (frontend)..."
(cd frontend && npm run lint) || exit 1

echo "==> Pre-push: format kontrol (backend + frontend)..."
(cd backend && npm run format:check) || exit 1
(cd frontend && npm run format:check) || exit 1

echo "==> Pre-push: test (backend, DB servisi gerekir)..."
(cd backend && JWT_SECRET=ci-test-secret npm test) || exit 1

echo "==> Pre-push: test (frontend)..."
(cd frontend && npm test) || exit 1

echo "==> Tum kontroller basarili. Push devam edebilir."
