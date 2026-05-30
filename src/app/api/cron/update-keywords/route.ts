import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import {
  NAVER_TREND_GROUP_MAX,
  buildKeywordMarketContext,
  buildTrendGroupsFromKeywords,
  generateMarketKeywords,
} from '@/lib/naverKeywordGenerate';

function nextMonday5am(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(5, 0, 0, 0);
  return d;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const authUser = await verifyToken(req);
  const cronOk = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!authUser && !cronOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const targetStoreId = searchParams.get('storeId') || '';

  try {
    let storeIds: string[] = [];
    if (targetStoreId) {
      storeIds = [targetStoreId];
    } else {
      const storesSnap = await adminDb.collection('stores').where('active', '==', true).limit(50).get();
      storeIds = storesSnap.docs.map(d => d.id);
      if (storeIds.length === 0) storeIds = ['global'];
    }

    const results: Array<Record<string, unknown>> = [];

    for (const storeId of storeIds) {
      try {
        const marketCtx = await buildKeywordMarketContext(storeId);
        const generated = await generateMarketKeywords(marketCtx);

        const marketKeywords = generated.marketKeywords || [];
        let groups = generated.groups || [];
        if (groups.length === 0 && marketKeywords.length > 0) {
          groups = buildTrendGroupsFromKeywords(marketKeywords);
        }

        if (marketKeywords.length === 0 || groups.length === 0) {
          results.push({ storeId, status: 'skipped', reason: '키워드 생성 실패' });
          continue;
        }

        const docRef = adminDb.collection('naver_trend_keywords').doc(storeId);
        const docSnap = await docRef.get();
        const existing: Array<Record<string, unknown>> = docSnap.exists
          ? (docSnap.data()?.keywordGroups || [])
          : [];

        const existingMap: Record<string, Record<string, unknown>> = {};
        existing.forEach(g => { existingMap[String(g.groupName)] = g; });

        const updatedGroups: Record<string, unknown>[] = [];
        const usedIds = new Set<string>();
        const nowIso = new Date().toISOString();

        groups.forEach((gen, idx) => {
          const prev = existingMap[gen.groupName];
          if (prev?.admin_edited) {
            updatedGroups.push({ ...prev, salesRank: idx + 1 });
            usedIds.add(String(prev.id));
          } else {
            const id = String(prev?.id || crypto.randomUUID());
            updatedGroups.push({
              id,
              groupName: gen.groupName,
              keywords: gen.keywords,
              analysisNote: gen.analysisNote,
              priorityScore: gen.priorityScore ?? 100 - idx * 5,
              active: idx < NAVER_TREND_GROUP_MAX,
              source: 'auto',
              admin_edited: false,
              lastUpdated: nowIso,
              salesRank: idx + 1,
            });
            usedIds.add(id);
          }
        });

        existing.forEach(g => {
          if (!g.admin_edited || usedIds.has(String(g.id))) return;
          updatedGroups.push(g);
        });

        const nextUpdate = nextMonday5am();
        await docRef.set({
          keywordGroups: updatedGroups,
          marketKeywords,
          operationHint: generated.operationHint || '',
          lastAutoUpdate: FieldValue.serverTimestamp(),
          nextAutoUpdate: nextUpdate,
          lastMarketContext: {
            today: marketCtx.today,
            season: marketCtx.season,
            salesTrend: marketCtx.salesTrend,
          },
        }, { merge: true });

        results.push({
          storeId,
          status: 'updated',
          keywordCount: marketKeywords.length,
          groupCount: updatedGroups.length,
          marketKeywords,
          operationHint: generated.operationHint,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[update-keywords]', storeId, msg);
        results.push({ storeId, status: 'error', error: msg });
      }
    }

    const failed = results.filter(r => r.status !== 'updated');
    return NextResponse.json({
      success: failed.length === 0,
      results,
    }, { status: failed.length === results.length && results.length > 0 ? 500 : 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
