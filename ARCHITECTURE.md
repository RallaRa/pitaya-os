# Pitaya OS Architecture

## 모듈 구조
- report/sales: AI 매출관리
- report/purchases: AI 매입관리
- hygiene: 위생점검일지
- ai: AI 대화모드
- messenger: 사내 메신저
- hr: 인사 관리
- accounting: 회계 (예정)
- settings: 시스템 설정

## 권한 그룹 (permission_groups)
master > 관리자 > 사용자 > 직원

## API 구조
/api/store - 매장 관리
/api/users - 유저 관리
/api/permissions - 권한 그룹
/api/sales_ai - AI 매출 분석
/api/hygiene - 위생일지
/api/messenger - 메신저
/api/conversations - AI 대화 이력
