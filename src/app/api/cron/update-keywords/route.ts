import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyToken } from '@/lib/authVerify';
import { fetchTopSellingItems } from '@/lib/dashboardSalesData';

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
    // 처리할 매장 목록 결정
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
        // 최근 30일 판매 상위 10개 품목 (daily_reports → pos_sales_detail fallback)
        const topSelling = await fetchTopSellingItems(storeId, 30, 10);
        const topItems = topSelling.map((item, rank) => ({ name: item.name, rank: rank + 1 }));

        if (topItems.length === 0) {
          results.push({ storeId, status: 'skipped', reason: '판매 데이터 없음' });
          continue;
        }

        // Gemini로 키워드 자동 생성
        let generatedGroups: any[] = [];
        if (process.env.GEMINI_API_KEY) {
          const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
          const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const prompt = `다음 정육점 판매 품목들의 네이버 검색 최적화 키워드를 각 품목당 3~5개씩 JSON으로 생성해줘.
소비자가 실제로 검색할 법한 자연스러운 키워드로.
품목: ${topItems.map(i => i.name).join(', ')}
형식: [{ "groupName": "품목명", "keywords": ["키워드1", "키워드2", "키워드3"] }]
다른 텍스트 없이 순수 JSON 배열만 반환.`;

          const res  = await model.generateContent(prompt);
          const text = res.response.text().trim().replace(/```json|```/g, '').trim();
          generatedGroups = JSON.parse(text);
        } else {
          generatedGroups = topItems.map(i => ({
            groupName: i.name,
            keywords:  [i.name],
          }));
        }

        // 기존 키워드 문서 로드
        const docRef  = adminDb.collection('naver_trend_keywords').doc(storeId);
        const docSnap = await docRef.get();
        const existing: any[] = docSnap.exists ? (docSnap.data()?.keywordGroups || []) : [];

        // 기존 map: groupName → item
        const existingMap: Record<string, any> = {};
        existing.forEach(g => { existingMap[g.groupName] = g; });

        const topNames = new Set(topItems.map(i => i.name));
        const updatedGroups: any[] = [];

        generatedGroups.forEach((gen: any, idx: number) => {
          const existing = existingMap[gen.groupName];
          if (existing?.admin_edited) {
            // admin이 수정한 항목은 건드리지 않음
            updatedGroups.push({ ...existing, salesRank: idx + 1 });
          } else {
            updatedGroups.push({
              id:           existing?.id || crypto.randomUUID(),
              groupName:    gen.groupName,
              keywords:     gen.keywords,
              active:       updatedGroups.filter(g => g.active).length < 5,
              source:       'auto',
              admin_edited: false,
              lastUpdated:  FieldValue.serverTimestamp(),
              salesRank:    idx + 1,
            });
          }
        });

        // 기존 admin_edited 항목 중 상위 품목에 없는 것은 active: false
        existing.forEach(g => {
          if (g.admin_edited && !topNames.has(g.groupName)) {
            const alreadyIncluded = updatedGroups.find(u => u.groupName === g.groupName);
            if (!alreadyIncluded) {
              updatedGroups.push({ ...g, active: false, salesRank: 99 });
            }
          }
        });

        const nextUpdate = nextMonday5am();
        await docRef.set({
          keywordGroups:  updatedGroups,
          lastAutoUpdate: FieldValue.serverTimestamp(),
          nextAutoUpdate: nextUpdate,
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

// Vercel Cron은 GET도 허용
export async function GET(req: Request) {
  return POST(req);
}
