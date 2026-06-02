import { NextResponse } from 'next/server';

/** Vercel/GitHub cron 공통 — CRON_SECRET 또는 HYGIENE_CRON_SECRET */
export function getCronSecret(): string {
  return (
    process.env.CRON_SECRET?.trim()
    || process.env.HYGIENE_CRON_SECRET?.trim()
    || ''
  );
}

export function isCronAuthorized(req: Request): boolean {
  const expected = getCronSecret();
  if (!expected) return true;
  const header = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === expected || bearer === expected;
}

export function cronUnauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
