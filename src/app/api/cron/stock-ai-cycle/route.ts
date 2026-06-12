import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS, STOCK_SUPERUSER_EMAIL } from '@/lib/stock/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorizeCron(req: Request): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

async function getSuperuserUid(): Promise<string | null> {
  const snap = await adminDb.collection('users')
    .where('email', '==', STOCK_SUPERUSER_EMAIL)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

/** 장중 5분 / 장마감 / 자정 AI 사이클 (Vercel Cron) */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'ACCESS_DENIED', message: '권한이 없습니다', code: 403 }, { status: 403 });
  }

  const uid = await getSuperuserUid();
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'superuser uid not found' }, { status: 404 });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const token = process.env.STOCK_CRON_ID_TOKEN;
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: 'STOCK_CRON_ID_TOKEN 미설정 — Vercel env에 슈퍼유저 Firebase ID 토큰 추가',
      hint: 'scan-only skipped; POS PitayaTrader 장중 스케줄은 별도 동작',
    }, { status: 503 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const steps: Record<string, unknown> = {};

  try {
    const scanRes = await fetch(`${base}/api/stock/scan`, { method: 'POST', headers });
    steps.scan = await scanRes.json();
  } catch (e: unknown) {
    steps.scan = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const settingsRes = await fetch(`${base}/api/stock/settings`, { headers });
    const settingsData = await settingsRes.json();
    const masterOn = settingsData?.settings?.masterEnabled === true;

    if (masterOn) {
      const execRes = await fetch(`${base}/api/stock/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dryRun: false, source: 'cron' }),
      });
      steps.execute = await execRes.json();
    } else {
      steps.execute = { ok: true, skipped: true, reason: 'master OFF' };
    }
  } catch (e: unknown) {
    steps.execute = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const riskRes = await fetch(`${base}/api/stock/risk`, { headers });
    steps.risk = await riskRes.json();
  } catch (e: unknown) {
    steps.risk = { error: e instanceof Error ? e.message : String(e) };
  }

  await adminDb.collection(STOCK_COLLECTIONS.aiAnalysis).doc(new Date().toISOString().slice(0, 10)).set({
    cronRun: true,
    steps,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true, steps });
}
