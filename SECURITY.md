# Pitaya OS — Security Notes

## Environment Variables

Never commit `.env.local`. Required secrets:

- `FIREBASE_SERVICE_ACCOUNT_KEY` — Admin SDK (server only)
- `ENCRYPTION_KEY` — AES-256 for PII (64-char hex)
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
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
