#!/bin/bash
# format-docker.sh — backend + frontend format (auto-fix) inside ephemeral
# Docker containers. Source is mounted so prettier --write lands on host files.
set -euo pipefail

echo "==> Format: backend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm backend-format

echo "==> Format: frontend (Docker)..."
docker compose -f docker-compose.dev-tools.yml run --rm frontend-format