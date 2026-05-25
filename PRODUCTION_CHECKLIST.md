# Pitaya OS v1 — 실서비스 전환 체크리스트

> 최초 작성: 2026-05-19 / 최종 업데이트: 2026-05-22  
> 기준 브랜치: `main`

---

## 1단계: 코드 수정 (필수)

### 1-1. AuthContext — 실 Google 로그인 복원
**파일:** `src/context/AuthContext.tsx`

- [x] `signInWithGoogle()` mock 블록 전체 제거 완료
- [x] `signInWithPopup` 실제 구현으로 교체 완료
- [x] 로그인 성공 직후 `/api/users` POST 호출 추가 완료 (→ 1-4)
- [x] `user.name` → `user.displayName` 전체 교체 완료

---

### 1-2. StoreContext — 초기값 null로 변경
**파일:** `src/context/StoreContext.tsx`

- [x] `currentStore` 초기값 `null`로 변경 완료 (mock 객체 제거)

---

### 1-3. 개발 전용 파일 제거
- [x] `src/app/api/dev/` 폴더 전체 삭제 완료 (2026-05-22)
- [x] `src/app/dashboard/messenger/page.tsx` — DEV 시드 패널 UI 블록 삭제 완료
- [x] messenger/page.tsx — `handleSeed`, `isSeedLoading`, `seedResult` state·함수 제거 완료
- [x] messenger/page.tsx — 시드 전용 import (`setDoc`, `addDoc`, `getDocs`, `serverTimestamp`) 제거 완료

---

### 1-4. 로그인 후 유저 프로필 Firestore 자동 등록
**파일:** `src/context/AuthContext.tsx`

- [x] `signInWithPopup` 성공 직후 `/api/users` POST 호출 추가 완료

---

### 1-5. Sidebar 권한 연동
**파일:** `src/components/Sidebar.tsx`

- [x] `/api/permissions?type=myAccess` 기반 menuAccess 필터링 완료 (2026-05-22)
  - 로딩 중 스켈레톤 UI (animate-pulse, 깜빡임 방지)
  - 위생 점검일지 메뉴 추가 (sales 권한 연동)
  - 스토어 전환 시 즉시 리셋
- [ ] 모바일 햄버거 메뉴 (`hidden md:flex`) 실제 동작 구현

---

## 2단계: Firebase 설정

### 2-1. Firebase Auth 도메인 허용
- [ ] Firebase Console → Authentication → Settings → 승인된 도메인에 **실 서비스 도메인** 추가

### 2-2. Firestore 보안 규칙
- [x] `firestore.rules` 작성 완료 (2026-05-19)
- [x] `firebase.json` firestore 섹션 추가 완료
- [x] `firebase deploy --only firestore:rules` 배포 완료

  **현재 적용된 규칙 요약 (Phase 1):**

  | 컬렉션 | 읽기 | 쓰기 | 비고 |
  |---|---|---|---|
  | `users` | 인증된 모두 | 본인만 | |
  | `stores` | 인증된 모두 | 인증된 모두 | Phase 2: false |
  | `user_store_map` | 인증된 모두 | 인증된 모두 | Phase 2: false |
  | `role_permissions` | 인증된 모두 | 인증된 모두 | Phase 2: false |
  | `ai_conversations` | **본인 uid만** | **본인 uid만** | uid 필드 강제 검증 |
  | `daily_reports` | 인증된 모두 | 인증된 모두 | Phase 2 규칙 주석 준비됨 |
  | `chat_rooms` | **멤버만** | **멤버만** | members 배열 교차검증 |
  | `chat_messages` | **방 멤버만** | **발신자+방 멤버** | get()으로 방 멤버 교차검증 |
  | 미정의 컬렉션 | 차단 | 차단 | 와일드카드 전면 차단 |

- [ ] **Phase 2 규칙 강화** (Admin SDK 전환 완료 후)
  - `stores`, `user_store_map`, `role_permissions` → `allow write: if false` 주석 해제
  - `daily_reports` → uid·storeId 기반 격리 규칙 주석 해제

### 2-3. Firestore 인덱스
- [x] `firestore.indexes.json` 작성 완료 (5개 복합 인덱스)
- [x] `firebase deploy --only firestore:indexes` 배포 완료
- [ ] Firebase Console에서 인덱스 빌드 완료 확인 (빌드 중이면 채팅방 쿼리 오류 발생)

---

## 3단계: 환경변수 설정

### 3-1. `.env.local` → 실 서비스 값으로 교체
- [x] `NEXT_PUBLIC_FIREBASE_API_KEY`
- [x] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [x] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [x] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [x] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [x] `NEXT_PUBLIC_FIREBASE_APP_ID`
- [x] `GEMINI_API_KEY`
- [x] `FIREBASE_SERVICE_ACCOUNT_KEY` (Admin SDK용 JSON — 6단계 구현 시 사용)

### 3-2. 배포 플랫폼 환경변수 등록
- [x] Vercel Production에 Firebase Client SDK 6개 변수 등록 완료 (2026-05-22 확인)
- [x] `GEMINI_API_KEY` Vercel Production 등록 완료
- [x] `FIREBASE_SERVICE_ACCOUNT_KEY` Vercel Production 등록 완료
- [x] `NEXT_PUBLIC_` 변수는 클라이언트 번들에 포함됨 → Firebase API Key는 도메인 제한으로 보호 예정
- [ ] **Admin SDK 개별 변수** — 6단계 구현 시점에 `FIREBASE_SERVICE_ACCOUNT_KEY` 방식 또는 개별 변수 방식 결정 후 추가

---

## 4단계: 보안 점검

- [ ] Firebase Console → API Key → **HTTP 리퍼러 제한** (실 도메인만 허용)
- [ ] Gemini API Key → Google Cloud Console → IP/리퍼러 제한 또는 Secret Manager 이관
- [x] `/api/dev/seed` 삭제 완료 (2026-05-22)
- [ ] `/api/permissions` POST — 현재 클라이언트가 `requestorRole` 직접 전송 → Admin SDK로 서버에서 실제 role 검증으로 교체
- [ ] `daily_reports` Phase 2 규칙 강화 후 쿼리에 `uid` / `storeId` 필터 추가 확인

---

## 5단계: 기능 완성도

| 기능 | 상태 | 비고 |
|---|---|---|
| Google 로그인 | ⚠️ 테스트 필요 | mock 코드 제거 완료, 실 환경 테스트 필요 |
| 매장 생성 / 연결 | ✅ 완료 | |
| AI 대화 (히스토리 포함) | ✅ 완료 | |
| AI 일마감보고 작성 | ✅ 완료 | |
| 위생 점검일지 | ✅ 완료 | |
| 전체 보고서 조회 | ✅ 완료 | |
| 메신저 (실시간 채팅) | ✅ 완료 | 인덱스 배포 완료 |
| 역할별 권한 설정 | ✅ 완료 | Sidebar 연동 미완 |
| 매장 설정 | ✅ 완료 | |
| Firestore 보안 규칙 | ✅ Phase 1 배포 완료 | Phase 2는 Admin SDK 후 |
| Firestore 인덱스 | ✅ 배포 완료 | 빌드 완료 여부 콘솔 확인 필요 |
| `daily_reports` uid·storeId | ✅ 완료 | 신규 저장부터 적용 |
| Sidebar 권한 필터링 | ✅ 완료 | menuAccess 기반 필터링 |
| 모바일 반응형 | ⚠️ 부분 | 햄버거 메뉴 미동작 |
| 유저 프로필 자동 등록 | ✅ 완료 | 로그인 시 /api/users POST 자동 호출 |

---

## 6단계: Admin SDK 전환 (Phase 2 전제조건)

모든 API Route가 Admin SDK(`adminDb`)로 전환 완료. Firestore 규칙 Phase 2 배포 완료 (2026-05-22).

- [x] `firebase-admin` 초기화 파일 생성 (`src/lib/firebase/admin.ts`)
  - named app `'admin'` 방식, Proxy 지연 초기화, `adminStorage` export 포함
- [x] `FIREBASE_SERVICE_ACCOUNT_KEY` 환경변수 등록 완료 (Vercel Production)
- [x] 아래 API Route 전부 `adminDb`로 전환 완료

  | API Route | 교체 대상 컬렉션 | 상태 |
  |---|---|---|
  | `/api/store` | `stores`, `user_store_map` | ✅ |
  | `/api/users` | `users` | ✅ |
  | `/api/permissions` | `role_permissions`, `permission_groups` | ✅ |
  | `/api/conversations` | `ai_conversations` | ✅ |
  | `/api/sales_ai` | `daily_reports` | ✅ |
  | `/api/messenger/rooms` | `chat_rooms` | ✅ |
  | `/api/messenger/messages` | `chat_messages` | ✅ |

- [x] `firestore.rules` Phase 2 규칙 강화 완료 (2026-05-22)
  - 클라이언트 `write: if false` 전면 적용
  - `users`, `user_store_map`: 본인 uid 기반 격리
  - `hygiene_checklists`: 클라이언트 read/write 유지 (직접 사용 중)

---

## 7단계: 빌드 및 배포

```bash
# 1. 타입 오류 확인
npx tsc --noEmit

# 2. 프로덕션 빌드 테스트
npm run build

# 3. Firestore 규칙 + 인덱스 배포
firebase deploy --only firestore

# 4. 앱 배포
# Vercel: git push → 자동 배포
# 직접:   npm run build && firebase deploy --only hosting
```

---

## 긴급도 우선순위

| 우선순위 | 항목 | 완료 |
|---|---|---|
| 🔴 필수 (배포 전) | mock 코드 제거 | ✅ 2026-05-22 |
| 🔴 필수 (배포 전) | `/api/dev/seed` 삭제 | ✅ 2026-05-22 |
| 🔴 필수 (배포 전) | Firestore 보안 규칙 | ✅ Phase 2 완료 2026-05-22 |
| 🔴 필수 (배포 전) | Firestore 인덱스 | ✅ 완료 |
| 🔴 필수 (배포 전) | 환경변수 설정 | ✅ 2026-05-22 |
| 🟠 높음 (초기 운영 전) | 로그인 후 유저 프로필 등록 | ✅ 완료 |
| 🟠 높음 (초기 운영 전) | Admin SDK 전환 + Phase 2 규칙 | ✅ 2026-05-22 |
| 🟠 높음 (초기 운영 전) | 권한 검증 서버 이전 | ⬜ |
| 🟡 중간 (운영 중 개선) | Sidebar 권한 필터링 | ✅ 2026-05-22 |
| 🟡 중간 (운영 중 개선) | 모바일 햄버거 메뉴 | ⬜ |
| 🟢 낮음 (추후) | 알림 기능 (FCM) | ⬜ |
