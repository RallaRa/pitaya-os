# Pitaya OS — 에이전트 공통 안내

**구조·모듈 문서:** [ARCHITECTURE.md](ARCHITECTURE.md) · [docs/README.md](docs/README.md)

| 작업 영역 | 읽을 문서 |
|-----------|-----------|
| AI 매입·원본 Storage | [docs/modules/purchases.md](docs/modules/purchases.md) |
| 공개 주문 | [docs/modules/public-orders.md](docs/modules/public-orders.md) |
| POS·일마감 | [docs/modules/pos-bridge.md](docs/modules/pos-bridge.md), [docs/modules/sales-and-reports.md](docs/modules/sales-and-reports.md) |
| Firestore 이름 | [docs/data/firestore-collections.md](docs/data/firestore-collections.md) |
| 배포·크론 | [docs/ops/deploy.md](docs/ops/deploy.md), [docs/ops/cron.md](docs/ops/cron.md) |

## 시간대 (필수)

**모든 날짜·시각 해석은 한국 표준시(KST, `Asia/Seoul`, UTC+9) 기준.**

- 서버/Firestore `syncedAt`, `toISOString()` → **UTC** → 사용자·운영 설명 시 **+9시간**.
- `04:09` 같은 UTC 시각을 “새벽 4시”로 말하지 않는다 (예: 6/2 04:09 UTC = **6/2 13:09 KST**).
- 앱·리포트 영업일: `src/lib/dateUtils.ts` (`getKSTTodayYMD` 등).
- 포스 PC `pos_bridge/bridge.js`: 로그에 `KST` 표기, `getKSTTodayYMD()`로 “오늘” 계산.

상세: `.cursor/rules/kst-timezone.mdc`

## POS PC SSH (Cursor 전용 — 직접 실행)

POS 작업 필요 시 **아래 SSH로 접속해 에이전트가 직접 실행**한다. 포트 **2222 사용 금지**.

```bash
ssh -p 2223 -i ~/.ssh/pitaya_pos User@pitayaos.iptime.org
```

- OS: Windows 10 · **PowerShell** · 작업 경로: `C:\pitaya-os`
- Node v18 · `storeId=STR-1779194754785` · POS DB: `localhost:18973` / `tips` / sa
- 한 줄씩 실행·결과 확인 후 다음 단계 · 한글 경로는 따옴표

상세: `.cursor/rules/pos-pc-ssh.mdc` · [docs/modules/pos-bridge.md](docs/modules/pos-bridge.md)

## POS → 일마감 동기화

1. 포스 PC `C:\pitaya-os\.env` — `DB_PORT=18973`, `DB_DATABASE=tips`, `STORE_ID=STR-1779194754785`
2. `cd C:\pitaya-os` → `node bridge.js check-tables` → `migrate` / `today` / `realtime`
3. Pitaya **일마감내역** ← Firestore `daily_reports` (`pos_{storeId}_{date}`)

가이드: `포스PC_브릿지_설치가이드.txt` · `pos_bridge/작업순서_*.txt`

## 카카오 알림 연동

- Google 로그인 후 **설정 → 내 계정**에서 카카오 연동 (`talk_message` 필수, `account_email` 불필요).
- 프로덕션: Vercel `KAKAO_*` 환경변수 필요.
