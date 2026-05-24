import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const uid     = searchParams.get('uid') || '';

  try {
    const snap = await adminDb
      .collection('calendars')
      .where('storeId', '==', storeId)
      .where('uid', '==', uid)
      .get();

    let cals = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (cals.length === 0) {
      // 기본 캘린더 생성
      const defaults = [
        { name: '내 캘린더', color: '#4299e1', visible: true, isDefault: true, isSystem: false, type: 'personal' },
        { name: '연차/휴무', color: '#48bb78', visible: true, isDefault: false, isSystem: true, type: 'hr' },
        { name: '공휴일',   color: '#fc8181', visible: true, isDefault: false, isSystem: true, type: 'holiday' },
      ];
      const created = await Promise.all(defaults.map(d =>
        adminDb.collection('calendars').add({
          ...d, storeId, uid,
          createdAt: FieldValue.serverTimestamp(),
        })
      ));
      cals = created.map((ref, i) => ({ id: ref.id, ...defaults[i], storeId, uid }));
    }

    return NextResponse.json({ calendars: cals });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { storeId, uid, name, color } = body;
    if (!name) return NextResponse.json({ error: '이름 필수' }, { status: 400 });

    const ref = await adminDb.collection('calendars').add({
      storeId: storeId || '', uid: uid || '', name, color: color || '#4299e1',
      visible: true, isDefault: false, isSystem: false, type: 'personal',
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    await adminDb.collection('calendars').doc(id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  try {
    await adminDb.collection('calendars').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
