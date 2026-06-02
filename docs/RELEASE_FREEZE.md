# Pitaya OS — 배포 고정(Release Freeze) 절차

임의 변경·회귀를 막기 위한 **최소 필수** 운영 규칙입니다.

## 1. 기준선(Baseline) 잠금

| 항목 | 값 | 변경 시 |
|------|-----|---------|
| `PREDICTION_LOCK_VERSION` | `src/lib/predictionDailyLock.ts` | 예측 스키마/로직 변경 시 **+1** (캐시 자동 무효화) |
| `RELEASE_TAG` | Git tag `release-YYYY-MM-DD-N` | 프로덕션 배포 직후 태그 생성 |
| `vercel.json` crons | POS 3시간마다(서버) + 위젯 30분(클라) + AI 4슬롯 | Hobby: `*/30` 불가 → Pro 시 30분 cron 가능 |

배포 직후:

```bash
git tag -a release-2026-06-02-1 -m "AI예측 30분POS+4슬롯AI, 근거접기, 날씨보정"
git push origin release-2026-06-02-1
```

## 2. 변경 3단계 (모든 기능 수정)

1. **브랜치** — `main` 직접 수정 금지 → `feat/...` 또는 `fix/...`
2. **PR 체크리스트**
   - [ ] `PREDICTION_LOCK_VERSION` bump 필요 여부
   - [ ] Firestore 인덱스/규칙 변경 여부
   - [ ] Cron·env(`CRON_SECRET`) 영향
   - [ ] 예측·HR·POS 중 **의도한 영역만** diff
3. **배포 후** — 강서정육점 `STR-1779194754785`에서 위젯·예측변수·출퇴근 스모크 1회

## 3. 데이터·캐시 무결성

- **예측 문서** `predictions/{날짜}_{storeId}` — AI 본문은 슬롯(00·10·15·18)만 덮어씀
- **당일 실매출** — `todayActualUpdatedAt` 30분 주기만 갱신 (`prediction-today-actual` cron)
- **수동 초기화** — 로직 변경 후: `npx tsx scripts/clear-prediction-cache.ts [storeId]`

## 4. 환경·비밀 분리

- `.env.local` / `pitaya-prod.env` — **Git 제외**, Vercel Environment Variables만
- 배포 전후 env diff 금지 (키 롤테이션은 별도 작업)

## 5. 회귀 방지 (권장 GitHub 설정)

- `main` 브랜치 protection: PR 필수, force-push 금지
- Vercel Production = `main`만 연결
- Preview URL로 merge 전 검증

## 6. 긴급 롤백

```bash
git checkout release-YYYY-MM-DD-N
# 또는 Vercel Dashboard → Deployments → 이전 Production Promote
```

---

**현재 스택 요약 (2026-06-02)**

- AI 예측: KST 00·10·15·18 (`prediction-ai-slot`)
- 당일 POS: 30분 (`prediction-today-actual` + 위젯 폴링)
- 품목 근거: `<details>` 기본 **접힘**
- 날씨·품목 `itemEffects`: `weather_impact_variables` + 재분석 API
