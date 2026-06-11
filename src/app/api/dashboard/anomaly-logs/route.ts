import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  const limit = Number(new URL(req.url).searchParams.get('limit') || 30);
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const snap = await adminDb.collection('anomaly_logs')
    .where('storeId', '==', storeId)
    .limit(Math.min(limit, 100))
    .get();

  const logs = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string; date?: string }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return NextResponse.json({ logs });
}
