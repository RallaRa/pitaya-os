# Pitaya OS — 에이전트 공통 안내

## 시간대 (필수)

**모든 날짜·시각 해석은 한국 표준시(KST, `Asia/Seoul`, UTC+9) 기준.**

- 서버/Firestore `syncedAt`, `toISOString()` → **UTC** → 사용자·운영 설명 시 **+9시간**.
- `04:09` 같은 UTC 시각을 “새벽 4시”로 말하지 않는다 (예: 6/2 04:09 UTC = **6/2 13:09 KST**).
- 앱·리포트 영업일: `src/lib/dateUtils.ts` (`getKSTTodayYMD` 등).
- 포스 PC `pos_bridge/bridge.js`: 로그에 `KST` 표기, `getKSTTodayYMD()`로 “오늘” 계산.

상세: `.cursor/rules/kst-timezone.mdc`

## POS → 일마감 동기화

1. 포스 PC `C:\pitaya-bridge\.env` — `DB_PORT=18973`, `DB_DATABASE=tips`, `STORE_ID=STR-1779194754785`
2. `node bridge.js check-tables` → `node bridge.js migrate …` / `today` / `realtime`
3. Pitaya **일마감내역** ← Firestore `daily_reports` (`pos_{storeId}_{date}`)

가이드: `포스PC_브릿지_설치가이드.txt`

## 카카오 알림 연동

- Google 로그인 후 **설정 → 내 계정**에서 카카오 연동 (`talk_message` 필수, `account_email` 불필요).
- 프로덕션: Vercel `KAKAO_*` 환경변수 필요.
