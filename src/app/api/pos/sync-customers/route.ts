import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encrypt } from '@/lib/encryption';
import { buildPhonePiiFields } from '@/lib/phonePii';

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
  cusHp?:         string;
  phoneFull?:     string;
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

/** 원본 숫자만 phoneEncrypted 저장. 마스킹 값은 phoneEncrypted 덮어쓰지 않음 */
function applyPhoneFields(
  doc: Record<string, unknown>,
  ...candidates: (string | undefined | null)[]
): 'full' | 'masked_only' | 'empty' {
  const fields = buildPhonePiiFields(...candidates);

  doc.phoneSource = fields.phoneSource;
  doc.phonePiiIncomplete = fields.phoneSource !== 'full';

  if (fields.phoneSource === 'full') {
    doc.phoneEncrypted = encrypt(fields.phoneDigits);
    doc.phoneMasked = fields.phoneMasked;
    doc.phoneDigitsLen = fields.phoneDigits.length;
    return 'full';
  }
  if (fields.phoneSource === 'masked_only') {
    doc.phoneMasked = fields.phoneMasked;
    return 'masked_only';
  }
  return 'empty';
}

// POST /api/pos/sync-customers
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-api-key');
  if (apiKey !== process.env.POS_BRIDGE_KEY) {
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
  let phoneFull = 0;
  let phoneMaskedOnly = 0;
  let phoneEmpty = 0;

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const chunk = customers.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const c of chunk) {
      try {
        if (isInfoCustomer(c)) {
          const code = String(c.cusCode || '').trim();
          if (!code) { failed++; continue; }

          const docRef = adminDb.collection('pos_customers').doc(`${storeId}_${code}`);
          const doc: Record<string, unknown> = {
            cusCode:        code,
            storeId,
            nameEncrypted:  encrypt(String(c.name || '')),
            birthEncrypted: encrypt(String(c.birthday || '')),
            emailEncrypted: c.email ? encrypt(String(c.email)) : '',
            grade:          String(c.cusClass || ''),
            cusGubun:       String(c.cusGubun || ''),
            point:          Number(c.point || 0),
            totalPoint:     Number(c.totalPoint || 0),
            usedPoint:      Number(c.usedPoint || 0),
            totalPurchase:  Number(c.totalPurchase || 0),
            totalDiscount:  Number(c.totalDiscount || 0),
            visitCount:     Number(c.visitCount || 0),
            joinDate:       String(c.joinDate || ''),
            lastVisitDate:  String(c.lastVisitDate || c.joinDate || ''),
            lastEventDate:  String(c.lastEventDate || ''),
            writeDate:      String(c.joinDate || ''),
            pointUseYn:     String(c.pointUseYn || ''),
            isActive:       String(c.isActive || '1'),
            syncedAt,
            updatedAt: FieldValue.serverTimestamp(),
          };

          const phoneStatus = applyPhoneFields(
            doc,
            c.phoneFull,
            c.cusHp,
            c.tel,
            c.mobile,
          );
          if (phoneStatus === 'full') phoneFull++;
          else if (phoneStatus === 'masked_only') phoneMaskedOnly++;
          else phoneEmpty++;

          batch.set(docRef, doc, { merge: true });
          saved++;
        } else {
          const code = String(c.Cus_Code || '').trim();
          if (!code) { failed++; continue; }

          const docRef = adminDb.collection('pos_customers').doc(`${storeId}_${code}`);
          const doc: Record<string, unknown> = {
            cusCode:        code,
            storeId,
            nameEncrypted:  encrypt(String(c.Cus_Name  || '')),
            birthEncrypted: encrypt(String(c.Cus_Birth || '')),
            grade:          String(c.Cus_Grade || ''),
            point:          Number(c.Cus_Point || 0),
            writeDate:      String(c.Write_Date || ''),
            lastVisitDate:  String(c.Write_Date || ''),
            joinDate:       String(c.Write_Date || ''),
            visitCount:     0,
            totalPurchase:  0,
            syncedAt,
            updatedAt: FieldValue.serverTimestamp(),
          };

          const phoneStatus = applyPhoneFields(doc, c.Cus_HP);
          if (phoneStatus === 'full') phoneFull++;
          else if (phoneStatus === 'masked_only') phoneMaskedOnly++;
          else phoneEmpty++;

          batch.set(docRef, doc, { merge: true });
          saved++;
        }
      } catch { failed++; }
    }

    await batch.commit();
  }

  return NextResponse.json({
    success: true,
    saved,
    failed,
    synced: saved,
    phoneStats: { full: phoneFull, maskedOnly: phoneMaskedOnly, empty: phoneEmpty },
  });
}
