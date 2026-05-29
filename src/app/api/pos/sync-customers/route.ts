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
  const apiKey = req.headers.get('x-api-key') || '';
  const candidate = token || apiKey;
  if (!candidate) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(key));
  } catch { return false; }
}

interface LegacyCustomer {
  Cus_Code:   string;
  Cus_Name?:  string;
  Cus_HP?:    string;
  Cus_Birth?: string;
  Cus_Grade?: string;
  Cus_Point?: number;
  Write_Date?: string;
}

interface InfoCustomer {
  cusCode:        string;
  name?:          string;
  cusGubun?:      string;
  cusClass?:      string;
  mobile?:        string;
  tel?:           string;
  birthday?:      string;
  joinDate?:      string;
  lastVisitDate?: string;
  lastEventDate?: string;
  point?:         number;
  totalPoint?:    number;
  usedPoint?:     number;
  totalPurchase?: number;
  totalDiscount?: number;
  visitCount?:    number;
  pointUseYn?:    string;
  isActive?:      string;
  email?:         string;
}

function isInfoCustomer(c: LegacyCustomer | InfoCustomer): c is InfoCustomer {
  return 'cusCode' in c && !!c.cusCode;
}

// POST /api/pos/sync-customers
export async function POST(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'ENCRYPTION_KEY not configured' }, { status: 500 });
  }

  let body: { storeId?: string; customers?: (LegacyCustomer | InfoCustomer)[]; syncedAt?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const storeId   = body.storeId || process.env.POS_STORE_ID || '';
  const customers = Array.isArray(body.customers) ? body.customers : [];
  const syncedAt  = body.syncedAt || new Date().toISOString();

  if (!storeId || !customers.length) {
    return NextResponse.json({ error: 'storeId and customers[] required' }, { status: 400 });
  }

  const BATCH_SIZE = 450;
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const chunk = customers.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const c of chunk) {
      try {
        if (isInfoCustomer(c)) {
          const code = String(c.cusCode || '').trim();
          if (!code) { failed++; continue; }

          const docRef = adminDb.collection('pos_customers').doc(`${storeId}_${code}`);
          batch.set(docRef, {
            cusCode:        code,
            storeId,
            nameEncrypted:  encrypt(String(c.name || '')),
            phoneEncrypted: encrypt(String(c.mobile || c.tel || '')),
            birthEncrypted: encrypt(String(c.birthday || '')),
            emailEncrypted: c.email ? encrypt(String(c.email)) : '',
            phoneMasked:    String(c.mobile || c.tel || ''),
            grade:          String(c.cusClass || ''),
            cusGubun:       String(c.cusGubun || ''),
            point:          Number(c.point || 0),
            totalPoint:     Number(c.totalPoint || 0),
            usedPoint:      Number(c.usedPoint || 0),
            totalPurchase:  Number(c.totalPurchase || 0),
            totalDiscount:  Number(c.totalDiscount || 0),
            visitCount:     Number(c.visitCount || 0),
            joinDate:       String(c.joinDate || ''),
            lastVisitDate:  String(c.lastVisitDate || ''),
            lastEventDate:  String(c.lastEventDate || ''),
            writeDate:      String(c.joinDate || ''),
            pointUseYn:     String(c.pointUseYn || ''),
            isActive:       String(c.isActive || '1'),
            syncedAt,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          saved++;
        } else {
          const code = String(c.Cus_Code || '').trim();
          if (!code) { failed++; continue; }

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
        }
      } catch { failed++; }
    }

    await batch.commit();
  }

  return NextResponse.json({ success: true, saved, failed, synced: saved });
}
