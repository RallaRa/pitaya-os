# 매출·일마감·대시보드

POS 동기화 데이터와 수동 리포트를 바탕으로 **오늘 매출**, **예측**, **시간대 알림**, **AI 인사이트** 제공.

## 데이터 흐름

```mermaid
flowchart TB
  POS[pos_bridge] --> PDS[pos_daily_sales]
  POS --> DR[daily_reports]
  POS --> DET[pos_sales_detail]
  PDS --> Dash[/api/dashboard/today-sales]
  DR --> Report[/dashboard/report/view]
  PDS --> Alert[sales-hourly-alert cron]
  Dash --> Home[/dashboard]
```

## 주요 화면

| 경로 | 역할 |
|------|------|
| `/dashboard` | 위젯·오늘 매출·날씨 등 |
| `/dashboard/report/input` | 수동 일마감 입력 |
| `/dashboard/report/view` | 일마감 목록 |
| `/dashboard/report/view/[id]` | 일마감 상세 (POS별 내역) |
| `/dashboard/report/sales_ai` | AI 매출 분석 |
| `/dashboard/sales-forecast` | 매출 예측 |
| `/dashboard/prediction-analysis` | 예측 분석 |

## 주요 API·lib

| 경로 | 역할 |
|------|------|
| `/api/pos/sync` | POS → Firestore 일괄 |
| `/api/dashboard/today-sales` | 오늘 매출 |
| `/api/dashboard/sales-prediction` | 예측 |
| `/api/dashboard/comprehensive-opinion` | 종합 의견 (캐시) |
| `/api/dashboard/total-partner` | 파트너 AI 예측 |
| `src/lib/posDailySales.ts` | POS 일매출 doc id |
| `src/lib/salesHourlyAlert.ts` | 시간대별 알림 로직 |
| `src/lib/dateUtils.ts` | **KST** 날짜 |

## 일마감 문서 ID

```
daily_reports: pos_{storeId}_{YYYY-MM-DD}
pos_daily_sales: {storeId}_{YYYY-MM-DD}
```

## POS별 상세 표시

`daily_reports` / `pos_sales_detail` 데이터가 채워져 있어야  
`/dashboard/report/view/[id]` 에서 POS별 품목 내역이 보입니다.  
재적재: `node bridge.js migrate …` (포스 PC).

## 관련

- [POS 브릿지](pos-bridge.md)
- [크론](../ops/cron.md) — `sales-hourly-alert`, `prediction-*`
