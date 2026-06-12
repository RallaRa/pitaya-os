# Pitaya OS 개발 워크플로우

개발 시 참고할 작업 단위 가이드입니다.

## 크레딧 최소화 원칙

### 파일 지정 방식

- 전체 코드베이스 스캔 금지
- 반드시 `@파일명`으로 지정해서 요청
- 예: `@src/app/dashboard/sales-mgmt/page.tsx` 수정해줘

### 작업 단위

- 한 번에 하나의 기능만 요청
- 여러 파일 동시 수정 최소화
- 큰 작업은 단계별로 나눠서 요청

### 요청 방식 예시

나쁜 예:

```
전체 대시보드 개선해줘
```

→ 코드베이스 전체 스캔 → 크레딧 대량 소모

좋은 예:

```
@src/app/dashboard/page.tsx 에서
매출 위젯 로딩 버그 고쳐줘
```

→ 해당 파일만 읽음 → 크레딧 최소 소모

### 컨텍스트 관리

- 새 작업 시작 시 새 채팅 열기
- 이전 대화 컨텍스트 누적 방지
- 관련 파일만 `@mention`으로 지정

### 모델 선택

- Auto 모드 유지
- Max 모드 절대 사용 금지
- 수동 모델 선택 금지

## 작업별 파일 지도

| 영역 | 경로 |
|------|------|
| 매출 | `src/app/dashboard/sales-mgmt/`, `src/app/dashboard/sales/` |
| 고객 | `src/app/dashboard/customers/` |
| 발주 | `src/app/dashboard/orders/` |
| 매입·증빙 | `src/app/dashboard/report/purchases/`, `src/lib/purchase/` |
| 회계 | `src/app/dashboard/accounting/` |
| 설정 | `src/app/dashboard/settings/` |
| API | `src/app/api/` |
| 공통 컴포넌트 | `src/components/` |
| Firebase | `src/lib/firebase/` |
| Chrome 확장 | `extensions/` |

## Pitaya OS 공통 규칙

- Next.js 15 App Router · TypeScript strict
- Firestore 쓰기는 Admin SDK (`src/lib/firebase/admin`)만
- 날짜·시각은 KST (`Asia/Seoul`) 기준
- diff만 수정 (파일 전체 재작성 금지)
- 기존 컴포넌트·패턴 재사용 우선

상세 스택·규칙은 [CLAUDE.md](CLAUDE.md) 참고.
