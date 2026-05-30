#!/bin/bash
# Vercel 프로덕션 배포 스크립트 (git push + 안전 env 병합)
# 사용법: ./deploy.sh "커밋 메시지"

set -euo pipefail

MSG="${1:-chore: deploy}"

echo "📦 git 커밋 & 푸시..."
git add -A
git commit -m "$MSG" || echo "변경사항 없음"
git push origin main

exec bash scripts/deploy-prod.sh "$MSG"
