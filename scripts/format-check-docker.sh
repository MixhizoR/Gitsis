#!/bin/bash
# format-check-docker.sh — backend + frontend format check inside ephemeral
# Docker containers. Exit code propagates (CI-style gate).
set -euo pipefail

echo "==> Format check: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-format-check

echo "==> Format check: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format-check