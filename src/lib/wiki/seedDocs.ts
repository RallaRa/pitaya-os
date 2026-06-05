import type { WikiDoc } from './types';

/** 전 매장 공통 시드 (세스코·캡스·외부 TIC 인증 문구 없음) */
export const GLOBAL_WIKI_SEEDS: Omit<WikiDoc, 'id' | 'updatedAt'>[] = [
  {
    slug: 'morning-report',
    title: '오전 마감 보고서',
    category: '매출·보고',
    relatedModule: 'pos',
    relatedPath: '/dashboard/report/view',
    status: 'published',
    storeId: 'global',
    order: 10,
    content: `# 오전 마감 보고서

**오전 마감**은 전날 밤~당일 오전까지의 매출을 정리해 점장에게 공유하는 절차입니다.

## 언제 하나요?
- 보통 **11:00~12:00** 전후, 오전 영업이 끊길 때
- POS 브릿지가 연결된 매장은 **일마감내역**에 자동 반영됩니다

## Pitaya OS에서 확인
1. 사이드바 **일마감내역** (/dashboard/report/view)
2. 날짜를 오늘로 선택
3. **순매출·건수·결제수단** 요약 확인

## AI에게 물어보기
- "어제 대비 오전 매출 어때?"
- "이번 주 오전 마감 추이 보여줘"

> 관련: [[일마감·달력매출|report-calendar]], [[품목별 매출 추이|sales-forecast]]
`,
  },
  {
    slug: 'hanwoo-sale-alert',
    title: '한우 세일 알림톡',
    category: '고객·알림',
    relatedModule: 'store',
    relatedPath: '/dashboard/customers',
    status: 'published',
    storeId: 'global',
    order: 20,
    content: `# 한우 세일 알림톡

특가 한우·세일 품목을 **카카오 알림톡**으로 고객·직원에게 보내는 흐름입니다.

## 준비
- 매장 **카카오 연동** 완료 (설정 → 알림)
- 고객 DB에 **휴대폰 번호** 등록

## 발송 경로
1. **고객 관리**에서 세그먼트 선택
2. 쿠폰·이벤트 메뉴와 연동 시 **쿠폰 링크** 포함 가능
3. 매출 알림은 **시간대별 자동 알림** 설정과 별도

## 문구 팁
- 품목명·g단가·한정수량을 한 줄에
- 픽업·배송 마감 시각 명시

> 관련: [[공개 주문 처리|public-orders]], [[쿠폰·이벤트|coupons]]
`,
  },
  {
    slug: 'showcase-hygiene',
    title: '쇼케이스 위생관리',
    category: '위생',
    relatedModule: 'hygiene',
    relatedPath: '/dashboard/hygiene',
    status: 'published',
    storeId: 'global',
    order: 30,
    content: `# 쇼케이스 위생관리

냉장·냉동 **쇼케이스**는 정육점 HACCP 자체 점검의 핵심 구역입니다. Pitaya OS **위생 점검일지**에 매일 기록합니다.

## 매일 점검 (요약)
| 항목 | 기준 |
|------|------|
| 온도 | 냉장 0~5℃, 냉동 -18℃ 이하 |
| 청결 | 유리·손잡이·바닥 물기·이물 |
| 진열 | 유통기한 선입선출, 라벨 부착 |
| 교차오염 | 생육·조리 구역 분리 |

## Pitaya OS 절차
1. **위생 점검일지** 메뉴 진입
2. 오늘 날짜·점검자 확인
3. 섹션별 **적정/부적정** 선택 후 저장
4. 부적정 시 **조치 메모** 필수

## AI 활용
- "오늘 위생일지 뭐부터 채워?"
- "쇼케이스 온도 기록 항목 알려줘"

> 외부 방역 업체 일정은 별도 캘린더에 메모하고, **자체 일지**는 Pitaya에만 남깁니다.
`,
  },
  {
    slug: 'report-calendar',
    title: '일마감·달력매출',
    category: '매출·보고',
    relatedPath: '/dashboard/report/calendar',
    status: 'published',
    storeId: 'global',
    order: 15,
    content: `# 일마감·달력매출

**달력매출**은 월 단위로 매출 흐름을 한눈에 보는 화면입니다.

## 일마감 vs 달력
- **일마감내역**: 하루 상세(결제·품목)
- **달력매출**: 월별 합계·색상 히트맵

## POS 브릿지
브릿지 연결 시 POS 마감 데이터가 자동 동기화됩니다. 수동 매출키인 매장은 **AI 매출관리**를 병행합니다.
`,
  },
  {
    slug: 'public-orders',
    title: '공개 주문 처리',
    category: '주문',
    relatedPath: '/dashboard/public-orders',
    status: 'published',
    storeId: 'global',
    order: 40,
    content: `# 공개 주문 처리

고객이 **공개 주문 페이지**에서 넣은 주문을 매장에서 확인·처리합니다.

## 처리 순서
1. **공개 주문** 대시보드에서 신규 건 확인
2. 재고·제작 가능 여부 확인
3. 픽업 시간 안내 (카카오 알림 자동 연동 가능)
4. 완료 처리

## 알림
- 신규 주문 시 **피드형 카카오** + 매장 로고 템플릿 사용
`,
  },
  {
    slug: 'signage-ai',
    title: '사이니지 AI 이미지',
    category: '매장기능',
    relatedPath: '/dashboard/signage',
    status: 'published',
    storeId: 'global',
    order: 50,
    content: `# 사이니지 AI 이미지

매장 TV·모니터용 **프로모션 이미지**를 AI로 생성합니다.

## 사용법
1. **사이니지** 메뉴
2. 문구·스타일 입력 후 생성
3. 생성 완료까지 최대 2분 (서버 처리)

## 팁
- "한우 특가, 빨간 배너, 정육점 로고 느낌"처럼 구체적으로
- 실패 시 문구를 짧게 줄여 재시도
`,
  },
  {
    slug: 'purchase-ai',
    title: 'AI 매입 등록',
    category: '매입',
    relatedPath: '/dashboard/report/purchases',
    status: 'published',
    storeId: 'global',
    order: 60,
    content: `# AI 매입 등록

거래명세서 사진을 올리면 AI가 **품목·수량·단가**를 추출합니다.

## 절차
1. **AI 매입관리** → 신규 등록
2. 사진 촬영 또는 업로드
3. AI 결과 검토 후 확정
4. 거래처·품목 매칭 확인

## 주의
- 흐린 사진은 OCR 오류 증가 → 재촬영 권장
- 매입 시트에는 **OCR 품명**만 편집 (POS 품목코드 선택 없음)
- 거래량(kg)은 **소수점 2자리** (예: 21.80)

> 품목명·단가 표준화 설계: [[핵심품목코드|core-item-code]]
`,
  },
  {
    slug: 'core-item-code',
    title: '핵심품목코드 (설계)',
    category: '매입',
    relatedModule: 'items',
    relatedPath: '/dashboard/items',
    status: 'published',
    storeId: 'global',
    order: 65,
    content: `# 핵심품목코드 (설계)

정육점에서 **매입명·매출명이 업체·POS마다 제각각**인 문제를 풀기 위한 **기준 키**입니다.

> **재고관리가 아닙니다.** Pitaya OS의 포커스는 **매입단가 표준화·추적**입니다.

## 왜 필요한가?

| 구분 | 현실 |
|------|------|
| **매입** | 같은 부위도 \`한돈 앞다리살\`, \`앞다리국내산\`, \`앞다리국산\` … 업체마다 다름 |
| **매출** | \`앞다리 불고기\`, \`앞다리찌개\`, \`앞다리수육\` … POS 품목명 각각 다름 |

핵심품목코드 하나를 중심에 두고, 매입·매출 **알리아스**를 따로 연결합니다.

\`\`\`
              ┌──────────────────┐
              │  핵심품목코드     │  ← 기준 (예: 한돈 앞다리)
              │  + 표준 매입단가  │
              └────────┬─────────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  [매입 알리아스]  [매출 알리아스]   (미연결 허용)
  돈섬: 앞다리살   POS: 앞다리불고기
\`\`\`

## 설계 원칙

### 1. 매입·매출은 분리
- **매입 트랙**: 거래명세 OCR 원문 → (선택) 핵심코드 연결
- **매출 트랙**: POS 품목명 → (향후) 핵심코드 연결
- 두 트랙을 **재고 하나로 합치지 않음**

### 2. 연결은 선택 (미연결 = 정상)
- 매입: **대부분** 핵심코드에 연결, **일부** 미연결 가능
- 매출: **일부만** 연결돼도 OK, 나머지는 POS명 그대로
- 미연결 = 오류가 아니라 **단가 분석 대상에서만 제외**

### 3. 포커스 = 매입단가 표준화
- 핵심코드별 **표준 매입단가·이력** 관리
- 업체별·시기별 단가 비교, 품목별 단가 분석의 기준점
- [[AI 매입 등록|purchase-ai]] 후 **품목별 단가** 화면에서 핵심코드 기준 비교 (향후)

## 예외: 묶음 전표 (수동 처리)

한우 **양지·앞치마·업진안살·업진살·치마** 등을 **한 전표에 싸게 묶어** 사는 경우:

- AI/OCR이 한 줄로 읽거나 금액만 맞고 품목이 섞일 수 있음
- → **매입 시트에서 수동 분할·수정**이 정상 플로우
- 자동 분해를 목표로 하지 않음

## 현재 구현 상태 (2026-06)

| 항목 | 상태 |
|------|------|
| 매입 OCR + 품명 편집 | ✅ |
| 매입 시트 POS 품목코드 선택 | ❌ 제거 (핵심코드 수동 정리 전) |
| \`item_aliases\` (alias → 표준명) | ✅ 기존 |
| 핵심품목코드 마스터 UI | 🔜 예정 |
| 매입 줄 ↔ 핵심코드 연결 UI | 🔜 예정 |
| 매출 ↔ 핵심코드 연결 | 🔜 향후 |
| 상위/하위 계층 (부위 트리) | 🔜 고도화 |

## 향후 데이터 모델 (초안)

\`\`\`
core_items          핵심품목코드 (code, name, category, standardUnit, priceHistory)
purchase_aliases    매입명 + 거래처 → coreItemId
sales_aliases       POS 품목명 → coreItemId (선택)
\`\`\`

## 운영 순서 (권장)

1. **핵심품목코드**를 품목관리에서 하나씩 등록 (직접 입력)
2. 자주 나오는 **매입 OCR 품명**을 알리아스로 핵심코드에 연결
3. 단가 분석·업체 비교는 **핵심코드 기준**으로 확인
4. 묶음·특수 전표는 시트에서 **수동 보정**

> 관련: [[AI 매입 등록|purchase-ai]], [[품목별 매출 추이|sales-forecast]], [[유통기한 알림|expiry-reminder]]
`,
  },
  {
    slug: 'expiry-reminder',
    title: '유통기한 알림',
    category: '품목',
    relatedPath: '/dashboard/items',
    status: 'published',
    storeId: 'global',
    order: 70,
    content: `# 유통기한 알림

AI 대화에서 **"유통기한 6/10 한우 등심 3kg"**처럼 말하면 자동 등록됩니다.

## 확인
- **품목관리** 또는 대시보드 위젯
- 임박·만료 품목 정렬

## AI 예시
\`\`\`
유통기한 2026-06-10 한우 등심 3kg 냉장 2번
\`\`\`
`,
  },
  {
    slug: 'coupons',
    title: '쿠폰·이벤트',
    category: '매장기능',
    relatedPath: '/dashboard/coupons',
    status: 'published',
    storeId: 'global',
    order: 45,
    content: `# 쿠폰·이벤트

디지털 쿠폰을 만들고 고객에게 배포합니다. [[한우 세일 알림톡|hanwoo-sale-alert]]와 함께 쓰면 효과적입니다.
`,
  },
  {
    slug: 'sales-forecast',
    title: '품목별 매출 추이',
    category: '매출·분석',
    relatedPath: '/dashboard/sales-forecast',
    status: 'published',
    storeId: 'global',
    order: 25,
    content: `# 품목별 매출 추이

품목·카테고리별 **매출 추이 그래프**를 확인합니다. 세일 기획·발주 참고용입니다.
`,
  },
];
