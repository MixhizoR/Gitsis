#!/bin/bash
# pre-push-check-docker.sh — full pipeline inside Docker:
#   format-check → lint → test
# Each step is a gate (exit code propagates). DB starts automatically for
# backend tests via the db service dependency.
set -euo pipefail

echo "==> Pre-push: format kontrol (Docker)..."
bash scripts/format-check-docker.sh

echo "==> Pre-push: lint (Docker)..."
bash scripts/lint-docker.sh

echo "==> Pre-push: test (Docker)..."
bash scripts/test-docker.sh

echo "==> Tum kontroller basarili. Push devam edebilir."