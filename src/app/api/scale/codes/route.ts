import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

function getCategory(name: string): string {
  if (/한우/.test(name))               return '한우';
  if (/한돈/.test(name))               return '한돈';
  if (/수입|호주|미국|미산|호산/.test(name)) return '수입육';
  return '기타';
}

const SAMPLE_DATA = [
  { code: 9,   name: '한우곱창' },
  { code: 10,  name: '한우국거리' },
  { code: 21,  name: '한우등심불고기' },
  { code: 52,  name: '한우새우살' },
  { code: 63,  name: '한우아롱사태' },
  { code: 65,  name: '한우안심스테이크' },
  { code: 66,  name: '한우안심추리' },
  { code: 71,  name: '한우앞치마' },
  { code: 78,  name: '한우우족' },
  { code: 80,  name: '한우차돌박이사시미' },
  { code: 81,  name: '한우홍두께육전용' },
  { code: 85,  name: '한우잡채용' },
  { code: 108, name: '한우홍두깨' },
  { code: 237, name: '한돈소짚두갈비' },
  { code: 341, name: '한돈LA갈비' },
  { code: 352, name: '한돈대패목살' },
  { code: 353, name: '한돈대패삼겹' },
  { code: 354, name: '한돈대패오겹살' },
  { code: 378, name: '한돈벌집목살' },
  { code: 398, name: '한돈미박사태' },
  { code: 406, name: '한돈한입우대삼겹살' },
  { code: 421, name: '한돈목살찌개' },
  { code: 422, name: '한돈쫄갈비용' },
  { code: 425, name: '한돈칼집삼겹살' },
  { code: 436, name: '한돈이겹살' },
  { code: 523, name: '한돈생삼겹찌개' },
];

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  try {
    const snap = await adminDb.collection('scale_codes')
      .where('storeId', '==', storeId)
      .orderBy('code')
      .limit(2000)
      .get();

    if (snap.empty) {
      // 샘플 데이터 자동 삽입
      const batch = adminDb.batch();
      SAMPLE_DATA.forEach(item => {
        const ref = adminDb.collection('scale_codes').doc();
        batch.set(ref, {
          storeId,
          code:      item.code,
          name:      item.name,
          category:  getCategory(item.name),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: 'system',
        });
      });
      await batch.commit();

      const snap2 = await adminDb.collection('scale_codes')
        .where('storeId', '==', storeId)
        .orderBy('code')
        .limit(2000)
        .get();
      const items = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ items, seeded: true });
    }

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items });
  } catch (e: any) {
    // orderBy 인덱스 없을 때 fallback
    try {
      const snap2 = await adminDb.collection('scale_codes')
        .where('storeId', '==', storeId)
        .limit(2000)
        .get();

      if (snap2.empty) {
        const batch = adminDb.batch();
        SAMPLE_DATA.forEach(item => {
          const ref = adminDb.collection('scale_codes').doc();
          batch.set(ref, {
            storeId, code: item.code, name: item.name,
            category: getCategory(item.name),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdBy: 'system',
          });
        });
        await batch.commit();
        const snap3 = await adminDb.collection('scale_codes').where('storeId', '==', storeId).limit(2000).get();
        return NextResponse.json({ items: snap3.docs.map(d => ({ id: d.id, ...d.data() })), seeded: true });
      }

      const items = snap2.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.code - b.code);
      return NextResponse.json({ items });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, items, createdBy } = body;

    if (!items?.length) return NextResponse.json({ error: '항목 없음' }, { status: 400 });

    const batch = adminDb.batch();
    const results: string[] = [];

    for (const item of items) {
      // 같은 storeId + code 중복 확인
      const existing = await adminDb.collection('scale_codes')
        .where('storeId', '==', storeId)
        .where('code', '==', Number(item.code))
        .limit(1).get();

      if (!existing.empty) {
        // 이미 존재 → 업데이트
        const ref = existing.docs[0].ref;
        batch.update(ref, {
          name:      item.name,
          category:  getCategory(item.name),
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.push(existing.docs[0].id);
      } else {
        const ref = adminDb.collection('scale_codes').doc();
        batch.set(ref, {
          storeId:   storeId || '',
          code:      Number(item.code),
          name:      item.name,
          category:  getCategory(item.name),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: createdBy || '',
        });
        results.push(ref.id);
      }
    }

    await batch.commit();
    return NextResponse.json({ ids: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, name, code } = body;
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const updates: any = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) { updates.name = name; updates.category = getCategory(name); }
    if (code !== undefined) updates.code = Number(code);

    await adminDb.collection('scale_codes').doc(id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id      = searchParams.get('id');
  const storeId = searchParams.get('storeId');
  const code    = searchParams.get('code');
  const clearAll = searchParams.get('clearAll');

  try {
    if (clearAll === '1' && storeId) {
      const snap = await adminDb.collection('scale_codes').where('storeId', '==', storeId).limit(500).get();
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({ ok: true, deleted: snap.size });
    }

    if (id) {
      await adminDb.collection('scale_codes').doc(id).delete();
      return NextResponse.json({ ok: true });
    }

    if (code && storeId) {
      const snap = await adminDb.collection('scale_codes')
        .where('storeId', '==', storeId)
        .where('code', '==', Number(code))
        .limit(5).get();
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'id 또는 code 필수' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
