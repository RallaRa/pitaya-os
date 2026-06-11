import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  classifyPosGoods,
  type PosGoodInput,
} from '@/lib/posBarCode';
import { processGoodsSyncChanges } from '@/lib/pos/goodsSync.server';

function getCategory(name: string, categoryName?: string): string {
  const n = `${name} ${categoryName || ''}`;
  if (/한우/.test(n)) return '한우';
  if (/한돈/.test(n)) return '한돈';
  if (/수입|호주|미국|미산|호산/.test(n)) return '수입육';
  return '기타';
}

// POST /api/pos/sync-goods — POS Goods → scale_codes + pending
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-api-key');
  if (apiKey !== process.env.POS_BRIDGE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storeId?: string; goods?: PosGoodInput[]; syncedAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || process.env.POS_STORE_ID || '';
  const goods = Array.isArray(body.goods) ? body.goods : [];
  if (!storeId || !goods.length) {
    return NextResponse.json({ error: 'storeId and goods[] required' }, { status: 400 });
  }

  const { unique, pending } = classifyPosGoods(goods);
  const syncedAt = body.syncedAt || new Date().toISOString();

  let synced = 0;
  let pendingGroups = 0;
  const BATCH = 400;

  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const batch = adminDb.batch();
    for (const g of chunk) {
      const docId = `${storeId}_${g.posBarCode}`;
      batch.set(
        adminDb.collection('scale_codes').doc(docId),
        {
          storeId,
          posBarCode: g.posBarCode,
          scaleCode3: g.scaleCode3,
          prefix3: g.prefix3,
          code: g.code,
          name: g.name,
          category: getCategory(g.name, g.categoryName),
          categoryCode: g.categoryCode || '',
          categoryName: g.categoryName || '',
          scaleUse: g.scaleUse || '',
          sellPri: g.sellPri ?? 0,
          active: true,
          source: 'pos_sync',
          syncedAt,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      synced++;
    }
    await batch.commit();
  }

  // 펜딩: 뒤3자리 중복만 (사용자 확인 대기)
  const pendingRef = adminDb.collection('scale_code_pending').doc(storeId);
  await pendingRef.set({
    storeId,
    status: 'pending',
    groups: pending.map(p => ({
      scaleCode3: p.scaleCode3,
      items: p.items.map(it => ({
        posBarCode: it.posBarCode,
        prefix3: it.prefix3,
        code: it.code,
        name: it.name,
        categoryCode: it.categoryCode || '',
        categoryName: it.categoryName || '',
        scaleUse: it.scaleUse || '',
      })),
    })),
    groupCount: pending.length,
    itemCount: pending.reduce((s, p) => s + p.items.length, 0),
    syncedAt,
    updatedAt: FieldValue.serverTimestamp(),
  });

  pendingGroups = pending.length;

  await adminDb.collection('pos_sync_meta').doc(storeId).set({
    lastGoodsSyncAt: syncedAt,
    uniqueCount: synced,
    pendingGroupCount: pendingGroups,
    totalInput: goods.length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const pendingItems = pending.reduce((s, p) => s + p.items.length, 0);
  const processed = unique.length + pendingItems;

  let changeResult = null;
  try {
    changeResult = await processGoodsSyncChanges(storeId, goods, syncedAt);
  } catch (err) {
    console.error('[pos/sync-goods] change detection failed:', err);
  }

  return NextResponse.json({
    success: true,
    synced,
    pendingGroups,
    pendingItems,
    skipped: Math.max(0, goods.length - processed),
    changes: changeResult ? {
      initialized: changeResult.changes.initialized,
      added: changeResult.changes.added.length,
      removed: changeResult.changes.removed.length,
      priceChanged: changeResult.changes.priceChanged.length,
      notified: changeResult.notified,
    } : null,
  });
}
