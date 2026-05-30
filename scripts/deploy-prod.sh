#!/bin/bash
# Pitaya OS 프로덕션 배포 (환경변수 안전 병합)
# 사용법: ./scripts/deploy-prod.sh ["커밋 메시지"]
#
# 환경변수 정책:
# - 기존 .vercel/.env.production.local 값은 삭제하지 않음
# - .env.local의 빈 값으로 기존 키를 덮어쓰지 않음
# - 없는 키는 추가, 새 값(비어있지 않음)은 갱신
# - vercel env pull 로 .env.local 전체 덮어쓰기 금지

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG="${1:-chore: deploy}"

echo "💾 환경변수 백업..."
bash scripts/env-backup.sh

echo "🔀 환경변수 안전 병합 (.env.local → .vercel/.env.production.local)..."
mkdir -p .vercel
if [[ ! -f .vercel/.env.production.local ]]; then
  touch .vercel/.env.production.local
fi
node scripts/merge-env.mjs .vercel/.env.production.local .env.local

echo "🔨 Vercel production 빌드..."
vercel build --prod

echo "🚀 Vercel production 배포..."
vercel deploy --prebuilt --prod --archive=tgz

echo "✅ 배포 완료 → https://pitaya-osv1.vercel.app"
