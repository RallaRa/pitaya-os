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

### Vercel (권장 — 외부 8787 서버 불필요)

Vercel Production에 아래를 설정하면 **Pitaya가 KIS API를 직접 호출**합니다 (`localhost` 불필요).

```env
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NO=44736181-01
KIS_IS_PAPER=false
LIVE_TRADING=true
STOCK_TRADER_API_TOKEN=dev-token-stock-trader-2026   # optional
```

### 로컬 개발 (8787 프록시 병행 가능)

```env
STOCK_TRADER_API_URL=http://localhost:8787
STOCK_TRADER_API_TOKEN=dev-token-stock-trader-2026
```

로컬에서는 8787 서버가 켜져 있으면 프록시, Vercel(`VERCEL=1`)에서는 항상 내장 KIS.

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
