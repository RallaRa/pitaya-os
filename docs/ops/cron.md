# 크론·스케줄 작업

Pitaya는 **Vercel Cron**과 **GitHub Actions 스케줄** 두 경로를 사용합니다.

## Vercel Cron (`vercel.json`)

Vercel이 정해진 UTC 시각에 GET/POST로 호출.  
**한국 시간 = UTC+9** (아래 KST는 대략 변환).

| 경로 | UTC cron | 대략 KST | 용도 |
|------|----------|----------|------|
| `/api/cron/update-keywords` | `0 5 * * 1` | 월 14:00 | 키워드 갱신 |
| `/api/cron/calendar-notifications` | `0 0 * * *` | 09:00 | 캘린더 알림 |
| `/api/cron/expiry-reminder-notifications` | `0 0 * * *` | 09:00 | 유통기한 알림 |
| `/api/cron/holiday-notification` | `0 0 * * *` | 09:00 | 휴일 알림 |
| `/api/cron/sales-hourly-alert` | `0 4 * * *` | 13:00 | 시간대 매출 알림 |
| `/api/cron/prediction-today-actual` | `0 6 * * *` | 15:00 | 예측 실적 반영 |
| `/api/cron/order-notification` | `0 8 * * *` | 17:00 | 주문 알림 |
| `/api/cron/sync-order-calendar` | `0 6 * * 1` | 월 15:00 | 주문→캘린더 |
| `/api/cron/recalibrate-variables` | `0 7 * * 1` | 월 16:00 | 날씨 변수 보정 |
| `/api/cron/generate-partner-analysis` | `0 6 * * *` | 15:00 | 파트너 분석 |
| `/api/cron/pos-sync-check` | `0 12 * * *` | 21:00 | POS 동기화 점검 |

인증: 각 route에서 `src/lib/cronAuth.ts` 패턴 (`CRON_SECRET` 등).

## GitHub Actions (`.github/workflows/deploy.yml`)

`schedule` + `workflow_dispatch`로 **POST** 호출 (`x-cron-secret`).

| GitHub schedule (UTC) | job | API |
|----------------------|-----|-----|
| `0 2 * * *` | hygiene-morning | `/api/cron/hygiene-alert?kind=morning` |
| `0 5 * * *` | hygiene-midday | `… kind=midday` |
| `30 11 * * *` | hygiene-closing | `… kind=closing` |
| `5 15 * * *` | ai-0 | `/api/cron/prediction-ai-slot?slot=0` |
| `5 1 * * *` | ai-10 | `slot=10` |
| `5 6 * * *` | ai-15 | `slot=15` |
| `5 9 * * *` | ai-18 | `slot=18` |

Secrets: `HYGIENE_CRON_SECRET`, `PITAYA_APP_URL`

## 기타 크론 API (수동·확장)

`src/app/api/cron/` 아래 다수 (hygiene-auto-check, daily-prediction, annual-leave-generate …).  
Vercel/GitHub에 없으면 외부 스케줄러 또는 수동 호출.

## 주의

- 로그·문서의 “4시”가 **UTC 04:00**이면 한국 **13:00**입니다.
- 영업일 계산: `getKSTTodayYMD()` (`src/lib/dateUtils.ts`)
