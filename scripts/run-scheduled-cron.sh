#!/usr/bin/env bash
# 로컬/GitHub Actions 공용 — Pitaya 시간 민감 cron 호출
set -euo pipefail

BASE="${PITAYA_APP_URL:-https://pitaya-osv1.vercel.app}"
BASE="${BASE%/}"
SECRET="${HYGIENE_CRON_SECRET:-${CRON_SECRET:-}}"

if [ -z "$SECRET" ]; then
  if [ -f .env.local ]; then
    SECRET=$(grep -E '^HYGIENE_CRON_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
  fi
fi

if [ -z "$SECRET" ]; then
  echo "HYGIENE_CRON_SECRET or CRON_SECRET required"
  exit 1
fi

call() {
  local path="$1"
  echo "==> POST ${BASE}${path}"
  HTTP=$(curl -sS -o /tmp/pitaya-cron.json -w '%{http_code}' \
    -X POST -H "x-cron-secret: ${SECRET}" "${BASE}${path}")
  echo "HTTP ${HTTP}"
  cat /tmp/pitaya-cron.json
  echo ""
  if [ "$HTTP" -lt 200 ] || [ "$HTTP" -ge 300 ]; then
    return 1
  fi
}

JOB="${1:-all}"

case "$JOB" in
  hygiene-morning) call "/api/cron/hygiene-alert?kind=morning" ;;
  hygiene-midday)  call "/api/cron/hygiene-alert?kind=midday" ;;
  hygiene-closing) call "/api/cron/hygiene-alert?kind=closing" ;;
  ai-0)  call "/api/cron/prediction-ai-slot?slot=0" ;;
  ai-10) call "/api/cron/prediction-ai-slot?slot=10" ;;
  ai-15) call "/api/cron/prediction-ai-slot?slot=15" ;;
  ai-18) call "/api/cron/prediction-ai-slot?slot=18" ;;
  all)
    call "/api/cron/hygiene-alert?kind=morning" || true
    call "/api/cron/hygiene-alert?kind=midday" || true
    call "/api/cron/hygiene-alert?kind=closing" || true
    echo "(AI slots are heavy — run individually: ai-0 ai-10 ai-15 ai-18)"
    ;;
  *)
    echo "Usage: $0 [hygiene-morning|hygiene-midday|hygiene-closing|ai-0|ai-10|ai-15|ai-18|all]"
    exit 1
    ;;
esac
