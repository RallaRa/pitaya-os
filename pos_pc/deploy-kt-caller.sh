#!/bin/bash
# Mac → POS PC KT Caller 배포
set -euo pipefail
HOST="${KT_SSH_HOST:-pitayaos.iptime.org}"
PORT="${KT_SSH_PORT:-2223}"
KEY="${KT_SSH_KEY:-$HOME/.ssh/pitaya_pos}"
USER="${KT_SSH_USER:-User}"
REMOTE="C:/pitaya-os"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "=== SSH 연결 확인 ($HOST:$PORT) ==="
ssh -p "$PORT" -i "$KEY" -o ConnectTimeout=15 -o BatchMode=yes "${USER}@${HOST}" \
  "powershell -NoProfile -Command \"Write-Host connected; cd C:\\pitaya-os\""

echo "=== 파일 복사 ==="
scp -P "$PORT" -i "$KEY" \
  "$SRC/kt-caller.js" \
  "$SRC/kt-caller-poll.py" \
  "$SRC/install-kt-caller.ps1" \
  "${USER}@${HOST}:${REMOTE}/"

echo "=== 설치 (node-notifier + schtasks) ==="
ssh -p "$PORT" -i "$KEY" "${USER}@${HOST}" \
  "powershell -NoProfile -ExecutionPolicy Bypass -File ${REMOTE}/install-kt-caller.ps1"

echo "=== 자가 테스트 ==="
ssh -p "$PORT" -i "$KEY" "${USER}@${HOST}" \
  "cd C:\\pitaya-os && node kt-caller.js --test"

echo ""
echo "배포 완료. 상시 실행은 schtasks PitayaKTCaller (부팅 시)"
echo "수동: ssh -p $PORT -i $KEY ${USER}@${HOST}  →  node C:\\pitaya-os\\kt-caller.js"
