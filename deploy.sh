#!/bin/bash
# Vercel 프로덕션 배포 스크립트
# 사용법: ./deploy.sh "커밋 메시지"

set -e

MSG="${1:-chore: deploy}"

VERCEL_TOKEN=$(grep VERCEL_TOKEN .env.local | cut -d= -f2)

echo "🔨 빌드 확인 중..."
npm run build 2>&1 | tail -3

echo "📦 git 커밋 & 푸시..."
git add -A
git commit -m "$MSG" || echo "변경사항 없음"
git push origin main

echo "🚀 Vercel 배포 중..."
VERCEL_ORG_ID="uHTKPUbcSx6LsJDHgBsvE91q" \
VERCEL_PROJECT_ID="prj_sovM7cPLxCAgDMN7nUgWX5el25Pa" \
npx vercel deploy --prod --token="$VERCEL_TOKEN" --yes

echo "✅ 배포 완료!"
