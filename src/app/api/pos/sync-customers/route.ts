import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encrypt } from '@/lib/encryption';
import { timingSafeEqual } from 'crypto';

function authenticate(req: Request): boolean {
  const key = process.env.POS_BRIDGE_KEY || '';
  if (!key) return false;
  const auth  = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(key));
  } catch { return false; }
}

interface RawCustomer {
  Cus_Code:   string;
  Cus_Name?:  string;
  Cus_HP?:    string;
  Cus_Birth?: string;
  Cus_Grade?: string;
  Cus_Point?: number;
  Write_Date?: string;
}

// POST /api/pos/sync-customers
export async function POST(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'ENCRYPTION_KEY not configured' }, { status: 500 });
  }

  let body: { storeId?: string; customers?: RawCustomer[]; syncedAt?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const storeId   = body.storeId || process.env.POS_STORE_ID || '';
  const customers = Array.isArray(body.customers) ? body.customers : [];
  const syncedAt  = body.syncedAt || new Date().toISOString();

  if (!storeId || !customers.length) {
    return NextResponse.json({ error: 'storeId and customers[] required' }, { status: 400 });
  }

  const BATCH_SIZE = 450;
  let saved = 0, failed = 0;

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const chunk = customers.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const c of chunk) {
      const code = String(c.Cus_Code || '').trim();
      if (!code) { failed++; continue; }

      try {
        const docRef = adminDb.collection('pos_customers').doc(`${storeId}_${code}`);
        batch.set(docRef, {
          cusCode:        code,
          storeId,
          nameEncrypted:  encrypt(String(c.Cus_Name  || '')),
          phoneEncrypted: encrypt(String(c.Cus_HP    || '')),
          birthEncrypted: encrypt(String(c.Cus_Birth || '')),
          grade:          String(c.Cus_Grade || ''),
          point:          Number(c.Cus_Point || 0),
          writeDate:      String(c.Write_Date || ''),
          syncedAt,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        saved++;
      } catch { failed++; }
    }

    await batch.commit();
  }

  return NextResponse.json({ success: true, saved, failed });
}
