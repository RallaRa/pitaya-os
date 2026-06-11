import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { encrypt } from '@/lib/encryption';
import { mergePhoneSyncToDoc, type PhoneSyncOutcome } from '@/lib/phonePii';

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
  usedPoint?:      number;
  totalPurchase?: number;
  totalDiscount?: number;
  visitCount?:     number;
  pointUseYn?:     string;
  isActive?:       string;
  email?:          string;
  enUKey2?:        string;
}

function isInfoCustomer(c: LegacyCustomer | InfoCustomer): c is InfoCustomer {
  return 'cusCode' in c && !!c.cusCode;
}

function bump(stats: Record<string, number>, key: PhoneSyncOutcome) {
  stats[key] = (stats[key] || 0) + 1;
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
  const phoneStats: Record<string, number> = {};

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const chunk = customers.slice(i, i + BATCH_SIZE);
    const refs: { ref: DocumentReference; code: string; c: LegacyCustomer | InfoCustomer }[] = [];

    for (const c of chunk) {
      const code = isInfoCustomer(c)
        ? String(c.cusCode || '').trim()
        : String(c.Cus_Code || '').trim();
      if (!code) { failed++; continue; }
      refs.push({
        ref: adminDb.collection('pos_customers').doc(`${storeId}_${code}`),
        code,
        c,
      });
    }

    const existingSnaps = refs.length ? await adminDb.getAll(...refs.map(r => r.ref)) : [];
    const existingByCode = new Map<string, Record<string, unknown>>();
    for (const snap of existingSnaps) {
      if (snap.exists) {
        const code = String(snap.data()?.cusCode || snap.id.split('_').slice(1).join('_'));
        existingByCode.set(code, snap.data()!);
      }
    }

    const batch = adminDb.batch();

    for (const { ref, code, c } of refs) {
      try {
        const existing = existingByCode.get(code);

        if (isInfoCustomer(c)) {
          const doc: Record<string, unknown> = {
            cusCode:        code,
            storeId,
            nameEncrypted:  encrypt(String(c.name || '')),
            birthEncrypted: encrypt(String(c.birthday || '')),
            emailEncrypted: c.email ? encrypt(String(c.email)) : '',
            grade:          String(c.cusClass || ''),
            cusGubun:       String(c.cusGubun || ''),
            isBusiness:     /사업|법인|업체|도매|기업/.test(`${c.cusGubun || ''}${c.cusClass || ''}`),
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

          const outcome = mergePhoneSyncToDoc(
            doc,
            existing,
            syncedAt,
            c.enUKey2,
            c.phoneFull,
            c.cusHp,
            c.tel,
            c.mobile,
          );
          bump(phoneStats, outcome);
          batch.set(ref, doc, { merge: true });
          saved++;
        } else {
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

          const outcome = mergePhoneSyncToDoc(doc, existing, syncedAt, undefined, c.Cus_HP);
          bump(phoneStats, outcome);
          batch.set(ref, doc, { merge: true });
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
    phoneStats: {
      full: phoneStats.full || 0,
      maskedOnly: phoneStats.masked_only || 0,
      empty: phoneStats.empty || 0,
      protected: phoneStats.protected || 0,
      fullFromUKey2: phoneStats.full_from_ukey2 || 0,
      needsReconcile: phoneStats.needs_reconcile || 0,
    },
  });
}
