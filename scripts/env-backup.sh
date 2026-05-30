#!/bin/bash
# .env.local 타임스탬프 백업 (값은 git에 커밋하지 않음)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.env.local"
DEST_DIR="$ROOT/backups/env"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DEST_DIR/.env.local.$STAMP"

if [[ ! -f "$SRC" ]]; then
  echo "⚠️  .env.local 없음 — 백업 스킵"
  exit 0
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
echo "💾 env 백업: backups/env/.env.local.$STAMP"

# 최근 20개만 유지
if compgen -G "$DEST_DIR/.env.local.*" > /dev/null; then
  ls -1t "$DEST_DIR"/.env.local.* 2>/dev/null | tail -n +21 | while IFS= read -r f; do rm -f "$f"; done
fi
