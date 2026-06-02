import { NextResponse } from 'next/server';

/** @deprecated prediction-ai-slot(00·10·15·18 KST) 사용 — 하위 호환 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  const headers: Record<string, string> = {};
  if (secret) headers['x-cron-secret'] = secret;
  try {
    const res = await fetch(`${baseUrl}/api/cron/prediction-ai-slot`, {
      method: 'POST',
      headers,
    });
    const data = await res.json();
    return NextResponse.json({ ok: true, delegated: 'prediction-ai-slot', ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
