#!/bin/bash
# test-docker.sh — backend + frontend tests inside ephemeral Docker containers.
# Backend test starts its own Postgres (db service) via depends_on.
set -euo pipefail

echo "==> Test: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-test

echo "==> Test: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-test