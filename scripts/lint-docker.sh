#!/bin/bash
# lint-docker.sh — backend + frontend lint inside ephemeral Docker containers.
set -euo pipefail

echo "==> Lint: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-lint

echo "==> Lint: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-lint