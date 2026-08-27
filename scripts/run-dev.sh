#!/usr/bin/env bash
# ============================================================================
# run-dev.sh  —  Dev stack (compose.yaml + compose.dev.yaml) baslatir.
#  - Mevcut ehsim_* container'lari calisiyorsa uyari verir (--force ile bypass).
#  - Once down ile temizler, sonra -d --build ile up eder.
#  - Vite dev server (frontend) log takibi icin komut oneerir.
#  - Durum ozetini yazdirir. -v kullanmaz (postgres volume korunur).
#  - Kullanim: bash scripts/run-dev.sh [--force]
# ============================================================================
set -euo pipefail

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

echo ">>> Mevcut ehsim_* container'lari kontrol ediliyor..."
if docker ps --format '{{.Names}}' | grep -Eq '^ehsim_(pg|api|web|migrate)$'; then
  if [ "$FORCE" -ne 1 ]; then
    echo "!!! Calisan ehsim container'lari var. Once 'docker compose down' ile durdur"
    echo "    veya --force ile devam et (port conflict riski var)."
    exit 1
  fi
  echo ">>> --force: mevcut container'lar yikilacak, devam ediliyor."
fi

echo ">>> Prod-benzeri stack indiriliyor (varsa)..."
docker compose down --remove-orphans || true

echo ">>> Dev stack build + up (detached)..."
docker compose -f compose.yaml -f compose.dev.yaml up -d --build

echo ">>> Servis durumu:"
docker compose ps
echo ""
echo ">>> Frontend (vite) loglari:  docker compose logs -f frontend"
echo ">>> Tum loglar:               docker compose logs -f"
echo ">>> Durdur:                   docker compose -f compose.yaml -f compose.dev.yaml down"
