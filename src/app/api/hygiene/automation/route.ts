import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  generateHygieneMonthlyReport,
  getHygieneAutomationStatus,
} from '@/lib/hygieneAutomation.server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const date = searchParams.get('date') || undefined;
  const month = searchParams.get('month');

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    if (month) {
      const doc = await adminDb.collection('hygiene_monthly_reports').doc(`${storeId}_${month}`).get();
      if (doc.exists) return NextResponse.json({ report: doc.data() });
      const report = await generateHygieneMonthlyReport(storeId, month);
      return NextResponse.json({ report });
    }
    const status = await getHygieneAutomationStatus(storeId, date);
    return NextResponse.json(status);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; month?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, month = new Date().toISOString().slice(0, 7) } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const report = await generateHygieneMonthlyReport(storeId, month);
    return NextResponse.json({ success: true, report });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
