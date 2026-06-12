import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { verifyHometaxSession } from '@/lib/purchase/hometaxSession.server';

/** 매일 KST 06:30 — 연결된 홈택스 세션 검증 및 만료 알림 (Vercel cron UTC 21:30) */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  try {
    const snap = await adminDb.collection('store_hometax_sessions').get();
    const results: Array<{ storeId: string; valid: boolean; notified: boolean }> = [];

    for (const doc of snap.docs) {
      const verify = await verifyHometaxSession(doc.id);
      results.push({ storeId: doc.id, valid: verify.valid, notified: !verify.valid });
    }

    return NextResponse.json({
      ok: true,
      checked: snap.size,
      expired: results.filter(r => !r.valid).length,
      notified: results.filter(r => r.notified).length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'hometax-session-check failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
