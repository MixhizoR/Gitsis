#!/bin/bash
# Pre-push kontrol: her push oncesi calistir. Hata varsa duzeltir veya durdurur.
# Tum islemler ephemeral Docker containerlarinda calisir (bkz. docker-compose.dev-tools.yml).
set -euo pipefail

echo "==> Pre-push: format duzeltme (Docker)..."
bash scripts/format-docker.sh

echo "==> Pre-push: lint (Docker)..."
bash scripts/lint-docker.sh

echo "==> Pre-push: format kontrol (Docker)..."
bash scripts/format-check-docker.sh

echo "==> Pre-push: test (Docker)..."
bash scripts/test-docker.sh

echo "==> Tum kontroller basarili. Push devam edebilir."