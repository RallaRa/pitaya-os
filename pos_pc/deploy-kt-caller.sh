#!/bin/bash
# Mac → POS PC 배포 (SSH 키: ~/.ssh/pitaya_pos, 포트 2223)
set -euo pipefail
HOST="${KT_SSH_HOST:-pitayaos.iptime.org}"
PORT="${KT_SSH_PORT:-2223}"
KEY="${KT_SSH_KEY:-$HOME/.ssh/pitaya_pos}"
USER="${KT_SSH_USER:-User}"
REMOTE="C:/pitaya-os"
SRC="$(cd "$(dirname "$0")" && pwd)"

scp -P "$PORT" -i "$KEY" \
  "$SRC/kt-caller.js" \
  "$SRC/kt-caller-poll.py" \
  "$SRC/install-kt-caller.ps1" \
  "${USER}@${HOST}:${REMOTE}/"

ssh -p "$PORT" -i "$KEY" "${USER}@${HOST}" \
  "powershell -NoProfile -ExecutionPolicy Bypass -File ${REMOTE}/install-kt-caller.ps1"

echo "배포 완료. 수동 테스트:"
echo "  ssh -p $PORT -i $KEY ${USER}@${HOST}"
echo "  cd C:\\pitaya-os && node kt-caller.js"
