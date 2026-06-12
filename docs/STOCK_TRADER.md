# Pitaya × KIS AI 자동매매

슈퍼유저 전용 메뉴. Pitaya 웹에서 `stock-trader-android/server`를 프록시해 운영합니다.

## 메뉴

사이드바 **KIS AI매매** (SU 배지) — 슈퍼유저 이메일만 표시

| 화면 | 경로 |
|------|------|
| 현황 | `/dashboard/stock-trader` |
| AI 자동 | `/dashboard/stock-trader/ai` |
| 수동 매매 | `/dashboard/stock-trader/trade` |
| 실행 로그 | `/dashboard/stock-trader/logs` |
| 연동 설정 | `/dashboard/stock-trader/settings` |

## 환경변수 (Pitaya)

```env
STOCK_TRADER_API_URL=http://localhost:8787
STOCK_TRADER_API_TOKEN=dev-token-stock-trader-2026
```

Vercel 배포 시 `localhost` 불가 — 공인 IP/VPS URL 사용.

## 권한

- `menuAccessKeys`: `stockTrader` — admin/staff 기본 **off**, superuser **on**
- API: `requireSuperuser` (개발 큐와 동일)
- 페이지: `StockTraderGuard`

## stock-trader 서버

```bash
cd ../stock-trader-android
./scripts/start-server.sh
```

KIS 실전: `stock-trader-android/docs/KIS_LIVE.md`
