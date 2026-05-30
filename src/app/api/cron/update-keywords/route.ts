import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import {
  buildKeywordMarketContext,
  generateSearchKeywordGroups,
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

    const results: any[] = [];

    for (const storeId of storeIds) {
      try {
        const marketCtx = await buildKeywordMarketContext(storeId);
        const generatedGroups = await generateSearchKeywordGroups(marketCtx);

        if (generatedGroups.length === 0) {
          results.push({ storeId, status: 'skipped', reason: '키워드 그룹 생성 실패' });
          continue;
        }

        const docRef = adminDb.collection('naver_trend_keywords').doc(storeId);
        const docSnap = await docRef.get();
        const existing: any[] = docSnap.exists ? (docSnap.data()?.keywordGroups || []) : [];

        const existingMap: Record<string, any> = {};
        existing.forEach(g => { existingMap[g.groupName] = g; });

        const updatedGroups: any[] = [];
        const usedIds = new Set<string>();

        generatedGroups.forEach((gen, idx) => {
          const prev = existingMap[gen.groupName];
          if (prev?.admin_edited) {
            updatedGroups.push({ ...prev, salesRank: idx + 1 });
            usedIds.add(prev.id);
          } else {
            const id = prev?.id || crypto.randomUUID();
            updatedGroups.push({
              id,
              groupName: gen.groupName,
              keywords: gen.keywords,
              analysisNote: gen.analysisNote,
              priorityScore: gen.priorityScore ?? 100 - idx * 5,
              active: updatedGroups.filter(g => g.active).length < 5,
              source: 'auto',
              admin_edited: false,
              lastUpdated: FieldValue.serverTimestamp(),
              salesRank: idx + 1,
            });
            usedIds.add(id);
          }
        });

        // 관리자 수정 그룹은 AI 갱신과 무관하게 유지
        existing.forEach(g => {
          if (!g.admin_edited || usedIds.has(g.id)) return;
          updatedGroups.push(g);
        });

        const nextUpdate = nextMonday5am();
        await docRef.set({
          keywordGroups: updatedGroups,
          lastAutoUpdate: FieldValue.serverTimestamp(),
          nextAutoUpdate: nextUpdate,
          lastMarketContext: {
            today: marketCtx.today,
            season: marketCtx.season,
            salesTrend: marketCtx.salesTrend,
            categoryMix: marketCtx.categoryMix,
          },
        }, { merge: true });

        results.push({ storeId, status: 'updated', count: updatedGroups.length });
      } catch (e: any) {
        results.push({ storeId, status: 'error', error: e.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
