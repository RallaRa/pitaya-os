# Pitaya OS

Next.js 15 App Router 기반 정육점 ERP/POS. Firebase Firestore + Vercel 배포.

## 기술 스택

- Next.js 15 App Router
- Firestore (onSnapshot 실시간)
- Tailwind slate-950 / teal-400
- TypeScript strict
- storeId: `STR-1779194754785`
- superuser: `hipona00@gmail.com`

## 폴더 구조

- `src/app/dashboard/` — 대시보드 페이지
- `src/app/api/` — API 라우트
- `src/components/` — 공통 컴포넌트
- `src/lib/` — 유틸 · Firebase 설정

## 개발 규칙

- 파일 전체 재작성 금지 (diff만)
- 기존 컴포넌트 재사용 우선
- CMD 호환 명령어만 사용
- 에러 발생 시 즉시 보고
- 한 번에 하나의 기능만 구현
- 날짜·시각은 KST (`Asia/Seoul`) 기준
- Firestore 쓰기는 Admin SDK (`src/lib/firebase/admin`)만 사용

## 요청 방식

`@src/app/dashboard/...` 로 파일 지정 후 작업. 상세는 [WORKFLOW.md](WORKFLOW.md).
