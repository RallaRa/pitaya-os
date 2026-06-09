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

## 매장 운영 전제 (AI·분석·개발 공통)

Pitaya OS 대상: **정육 소매점**

| 항목 | 값 |
|------|-----|
| 영업 | **365일 무휴**, **24시간** |
| 유인 | **11:00–21:00 KST** (직원 상주·상담·진열) |
| 무인 | **21:00–11:00 KST** (셀프·키오스크, 대면 서비스 제한) |

- 분석·브리핑·AI 의견: 유인/무인 시간대 구분, 휴무일 가정 금지
- 코드: `src/lib/storeBusinessContext.ts`

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
