import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isHrStoreAdmin } from '@/lib/hr/storeAdmin';
import { loadPayrollSettings } from '@/lib/hr-system/payrollService';
import { mergePayrollSettings } from '@/lib/hr-system/payrollCalculator';
import type { PayrollSettings } from '@/lib/hr-system/types';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const settings = await loadPayrollSettings(storeId);
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Partial<PayrollSettings> & { storeId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const allowed = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const merged = mergePayrollSettings(storeId, body);
  const payload = {
    ...merged,
    updatedAt: new Date().toISOString(),
    updatedBy: authUser.uid,
    savedAt: FieldValue.serverTimestamp(),
  };

  await adminDb.collection('hr_payroll_settings').doc(storeId).set(payload, { merge: true });
  return NextResponse.json({ settings: payload });
}
