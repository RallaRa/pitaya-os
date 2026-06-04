# Firestore 컬렉션·Storage 경로

문서 기준일: 2026-06. 새 컬렉션 추가 시 이 표를 갱신하세요.

## 핵심·공통

| 컬렉션 | 문서 ID 패턴 | 용도 |
|--------|--------------|------|
| `stores` | `storeId` | 매장 마스터 |
| `users` | Firebase `uid` | 사용자 프로필·카카오 연동 |
| `user_store_map` | auto | 유저↔매장·권한 그룹 |
| `permission_groups` | groupId | 메뉴·기능 권한 |
| `store_settings` | `storeId` | 매장별 설정 (Drive, 공개주문 훅 등) |
| `notifications` | auto | 앱 내 알림 |

## POS·매출

| 컬렉션 | 문서 ID 패턴 | 용도 |
|--------|--------------|------|
| `daily_reports` | `pos_{storeId}_{YYYY-MM-DD}` | 일마감 (Pitaya 화면) |
| `pos_daily_sales` | `{storeId}_{date}` | POS 일별 매출 요약 |
| `pos_sales_header` | `{storeId}_{date}` | POS 매출 헤더 |
| `pos_sales_detail` | `{storeId}_{date}_{barcode}` | POS 품목별 상세 |
| `pos_finish_total` | `{storeId}_{date}` | 마감 합계 |
| `pos_customer_sales` | `{storeId}_{code}_{date}` | 거래처별 매출 |
| `pos_customers` | — | POS 거래처 (암호화 필드) |
| `pos_employees` | — | POS 직원 |
| `pos_sync_log` | auto | 동기화 로그 |
| `pos_sync_meta` | `storeId` | 마지막 동기화 메타 |

## AI 매입

| 컬렉션 | 용도 |
|--------|------|
| `purchase_records` | 저장된 매입 전표 (`purchaseAttachments`, `imageUrls`) |
| `purchases` | (레거시/AI 컨텍스트 조회용) |
| `ocr_corrections` | OCR 수정 학습 |
| `item_aliases` | 품목명 별칭 |
| `suppliers` | 거래처 마스터 |

**Storage:** `purchase_images/{storeId}/{uid}/{timestamp}_{token}.{ext}`

## 공개 주문

| 컬렉션 | 용도 |
|--------|------|
| `public_order_sessions` | 주문 세션 (token, visitorCount …) |
| `public_order_lines` | 세션 품목 라인 |
| `public_order_entries` | 고객 제출 주문 (status: unconfirmed/accepted/ready/completed) |
| `public_order_session_visitors` | 방문자 dedup (visitorId) |

## 저울·품목

| 컬렉션 | 용도 |
|--------|------|
| `scale_codes` | 저울 PLU·바코드 매핑 |
| `scale_code_pending` | POS에서 받은 미매칭 코드 |
| `items` | 품목 마스터 |

## 유통기한·캘린더

| 컬렉션 | 용도 |
|--------|------|
| `expiry_reminders` | 유통기한 알림 스케줄 |
| `calendar_events` | 캘린더 (type: `expiry` 등) |

## AI·예측·대시보드 캐시

| 컬렉션 | 용도 |
|--------|------|
| `dashboard_cache` | 종합 의견 등 캐시 |
| `ai_partner_predictions` | 파트너 예측 |
| `ai_partner_accuracy` | 예측 정확도 |
| `weather_impact_variables` | 날씨·매출 변수 |
| `conversations` | AI 대화 이력 |

## 기타

| 컬렉션 | 용도 |
|--------|------|
| `hygiene_*` | 위생 점검 (API `/api/hygiene`) |
| `scraper_sources` | 시세 스크래퍼 소스 |
| `hr/*` 관련 | employees, leave, attendance … |

## Storage 경로 요약

| 경로 prefix | 용도 |
|-------------|------|
| `purchase_images/` | AI 매입 원본 (이미지·PDF) |
| `public-order-images/` | 공개 주문 첨부 (lib 참고) |
| `store-images/` | 매장 이미지 |
