import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'prices';
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const groupKey = searchParams.get('groupKey');

    if (type === 'meta') {
      const metaDoc = await adminDb.collection('scraper_meta').doc('last_run').get();
      return NextResponse.json({ meta: metaDoc.exists ? metaDoc.data() : null });
    }

    if (type === 'pending') {
      const aliasDoc = await adminDb.collection('alias_dictionary').doc('global').get();
      const pending = aliasDoc.exists ? (aliasDoc.data()?.pending || []) : [];
      return NextResponse.json({ pending });
    }

    if (type === 'history' && groupKey) {
      const snap = await adminDb.collection('market_price_history')
        .where('groupKey', '==', groupKey)
        .limit(500)
        .get();
      const history = snap.docs.map(d => d.data());
      return NextResponse.json({ history });
    }

    const snap = await adminDb.collection('market_prices')
      .where('scrapedAt', '==', date)
      .get();

    const prices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ prices, date });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, originalName, source, standardName, animalType, origin, brand } = body;

    if (action !== 'mergeAlias' || !originalName || !standardName) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const aliasRef = adminDb.collection('alias_dictionary').doc('global');
    const aliasDoc = await aliasRef.get();
    const existing = aliasDoc.exists ? aliasDoc.data() : {};

    const items = existing?.items || {};
    items[originalName] = {
      standard: standardName,
      animalType: animalType || '기타',
      origin: origin || '기타',
      brand: brand || '',
      addedAt: new Date().toISOString(),
      addedBy: authUser.uid,
    };

    const pending = (existing?.pending || []).filter(
      (p: any) => !(p.originalName === originalName && (!source || p.source === source))
    );

    await aliasRef.set({
      items,
      pending,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
