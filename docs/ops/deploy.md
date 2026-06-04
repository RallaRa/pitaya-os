# 배포·환경

## 프로덕션 URL

- https://pitaya-osv1.vercel.app

## 배포 방법

| 방법 | 트리거 |
|------|--------|
| **자동** | `main` 브랜치 `git push` → `.github/workflows/deploy.yml` → `vercel deploy --prod` |
| **수동** | 저장소 루트에서 `npx vercel deploy --prod --yes` |

GitHub Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

## 로컬 개발

```bash
npm install
npm run dev
# http://localhost:3000
```

환경: `.env.local` (Firebase, AI 키, KAKAO 등). **커밋 금지.**

## 주요 환경 변수 (개념)

| 영역 | 예시 키 |
|------|---------|
| Firebase Admin | 서비스 계정 JSON / project id |
| 공개 URL | `NEXT_PUBLIC_APP_URL` |
| 카카오 | `KAKAO_*` |
| AI | Claude, OpenAI, Gemini, Groq |
| 크론 인증 | `HYGIENE_CRON_SECRET` (GitHub Actions → API) |

프로덕션 값: Vercel 프로젝트 Environment Variables.

## 빌드

- Next.js 16 (Turbopack)
- `npm run build` 시 `scraper/` 의존성 설치 포함
- 장시간 API: `vercel.json` `functions.maxDuration`

## 관련

- [크론](cron.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
