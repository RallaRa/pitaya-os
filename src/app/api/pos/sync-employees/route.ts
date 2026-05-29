import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'crypto';

function authenticate(req: Request): boolean {
  const key = process.env.POS_BRIDGE_KEY || '';
  if (!key) return false;
  const auth  = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const apiKey = req.headers.get('x-api-key') || '';
  const candidate = token || apiKey;
  if (!candidate) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(key));
  } catch { return false; }
}

interface PosEmployee {
  userId: string;
  name?: string;
  jobPosition?: string;
  paymentType?: string;
  salary?: number;
  enterDate?: string;
  retireDate?: string;
  adminGrade?: string;
  officeCode?: string;
  writeDate?: string;
  editDate?: string;
  tel1Masked?: string | null;
  tel2Masked?: string | null;
  storeId?: string;
  syncedAt?: string;
  source?: string;
}

// POST /api/pos/sync-employees
export async function POST(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storeId?: string; employees?: PosEmployee[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const storeId   = body.storeId || process.env.POS_STORE_ID || '';
  const employees = Array.isArray(body.employees) ? body.employees : [];

  if (!storeId || !employees.length) {
    return NextResponse.json({ error: 'storeId and employees[] required' }, { status: 400 });
  }

  const BATCH_SIZE = 450;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < employees.length; i += BATCH_SIZE) {
    const chunk = employees.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const emp of chunk) {
      const userId = String(emp.userId || '').trim();
      if (!userId) { failed++; continue; }

      try {
        const docRef = adminDb.collection('pos_employees').doc(`${storeId}_${userId}`);
        batch.set(docRef, {
          userId,
          storeId,
          name:        String(emp.name        || ''),
          jobPosition: String(emp.jobPosition || ''),
          paymentType: String(emp.paymentType || ''),
          salary:      Number(emp.salary || 0),
          enterDate:   String(emp.enterDate   || ''),
          retireDate:  String(emp.retireDate  || ''),
          adminGrade:  String(emp.adminGrade  || ''),
          officeCode:  String(emp.officeCode  || ''),
          writeDate:   String(emp.writeDate   || ''),
          editDate:    String(emp.editDate    || ''),
          tel1Masked:  emp.tel1Masked ?? '',
          tel2Masked:  emp.tel2Masked ?? '',
          syncedAt:    emp.syncedAt || new Date().toISOString(),
          source:      emp.source || 'pos_bridge',
          updatedAt:   FieldValue.serverTimestamp(),
        }, { merge: true });
        synced++;
      } catch { failed++; }
    }

    await batch.commit();
  }

  return NextResponse.json({ success: true, synced, failed });
}
