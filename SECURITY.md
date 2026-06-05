# Pitaya OS — Security Notes

## Environment Variables

Never commit `.env.local`. Required secrets:

- `FIREBASE_SERVICE_ACCOUNT_KEY` — Admin SDK (server only)
- `ENCRYPTION_KEY` — AES-256 for PII (64-char hex)
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` — 사이니지 배경 이미지 (Workers AI FLUX, 무료). [dash.cloudflare.com](https://dash.cloudflare.com) → Workers AI → Use REST API
- `MESSAGE_PROVIDER` — (선택) `solapi` (기본) 또는 `dhn`
- `SOLAPI_API_KEY` — solapi.com API Key
- `SOLAPI_API_SECRET` — solapi.com API Secret
- `SOLAPI_PF_ID` — 카카오 채널 PF ID
- `SOLAPI_SENDER_PHONE` — 발신 전화번호
- `SOLAPI_TEMPLATE_ID` — 기본 알림톡 템플릿 ID (KA...)
- `SOLAPI_BASE_URL` — (선택) 기본 `https://api.solapi.com`
- `SOLAPI_SMS_FALLBACK` — (선택) `N`이 아니면 알림톡 실패 시 SMS 대체
- `DHN_SENDER_PROFILE_KEY` — (레거시) 대형네트웍스 알림톡 발신프로필키
- `DHN_SENDER_PHONE` — 발신 전화번호 (kakao_sender)
- `DHN_TEMPLATE_CODE` — 기본 알림톡 템플릿 코드
- `DHN_API_URL` — (선택) 기본 `http://o2omsg.com/bizmsgapi/alimtalk2nd`
- `DHN_SMS_FALLBACK` — (선택) `N`이 아니면 알림톡 실패 시 SMS 대체 (`Y`)
- `NEXT_PUBLIC_FIREBASE_*` — Client SDK (domain-restrict in Firebase Console)

## Firestore

- Client writes blocked except `hygiene_checklists` and `dashboard_layouts` (superuser).
- All sensitive writes go through Admin SDK API routes with `verifyToken`.

## PII

- Customer phone/name and HR fields encrypted with `ENCRYPTION_KEY`.
- Decrypt only via authenticated API with role checks.

## Cron Endpoints

Protected by `CRON_SECRET` header (`x-cron-secret`).

## Reporting Issues

Contact: hipona00@gmail.com
