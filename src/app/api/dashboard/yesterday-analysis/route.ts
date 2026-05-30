import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';

const CACHE_TTL_MS = 60 * 1000; // 1분

function toYMD(d: Date) {
  // daily_reports의 reportDate 형식: "YYYY-MM-DD"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const refresh = searchParams.get('refresh') === '1'; // 강제 새로고침

  const cacheId  = `yesterday_${storeId || 'global'}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);

  // 캐시 확인 (새로고침 아닐 때만)
  if (!refresh) {
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const d   = cacheDoc.data()!;
        const age = Date.now() - (d.cachedAt?.toMillis?.() || 0);
        if (age < CACHE_TTL_MS) {
          return NextResponse.json({ ...d.result, cached: true });
        }
      }
    } catch { /* ignore */ }
  }

  const yesterday    = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYMD(yesterday); // "YYYY-MM-DD"
  const dateLabel    = `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`;

  try {
    // daily_reports: reportDate == "YYYY-MM-DD" 형식
    let q: FirebaseFirestore.Query = adminDb.collection('daily_reports')
      .where('reportDate', '==', yesterdayStr);
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.limit(20).get();

    // 데이터 없을 경우 오늘 날짜로도 한번 더 시도 (당일 늦게 입력한 경우)
    let docs = snap.docs;
    if (docs.length === 0) {
      const todayStr = toYMD(new Date());
      let q2: FirebaseFirestore.Query = adminDb.collection('daily_reports')
        .where('reportDate', '==', todayStr);
      if (storeId) q2 = q2.where('storeId', '==', storeId);
      const snap2 = await q2.limit(20).get();
      docs = snap2.docs;
    }

    // 품목 집계
    const itemMap: Record<string, { name: string; qty: number; amount: number }> = {};
    docs.forEach(doc => {
      const items: any[] = doc.data().items || [];
      items.forEach((item: any) => {
        const name = item.name || item.barcode || '(알 수 없음)';
        if (!name || name.length > 50) return;
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0 };
        itemMap[name].qty    += Number(item.qty     || 0);
        itemMap[name].amount += Number(item.netSales || item.amount || 0);
      });
    });

    const sorted = Object.values(itemMap).filter(i => i.qty > 0).sort((a, b) => b.qty - a.qty);

    if (sorted.length === 0) {
      return NextResponse.json({ dateLabel, top: [], bottom: [], cached: false, noData: true });
    }

    const summaryText = sorted.slice(0, 30).map(i =>
      `${i.name}: 수량=${i.qty}, 금액=${i.amount.toLocaleString()}원`
    ).join('\n');

    let top:    any[] = [];
    let bottom: any[] = [];

    if (hasAnyAiProvider()) {
      try {
        const prompt = `다음은 정육점의 어제(${dateLabel}) 판매 데이터입니다.\n${summaryText}\n\n분석해서 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이):\n{"top":[{"name":"품목명","qty":숫자,"amount":숫자}],"bottom":[{"name":"품목명","qty":숫자,"amount":숫자}]}\ntop은 판매량 상위 5개, bottom은 판매량 하위 5개(qty>0).`;

        const { text } = await generateTextWithFallback({ prompt, json: true });
        const parsed = JSON.parse(stripJsonMarkdown(text));
        top    = (parsed.top    || []).slice(0, 5);
        bottom = (parsed.bottom || []).slice(0, 5);
      } catch {
        top    = sorted.slice(0, 5).map(i => ({ name: i.name, qty: i.qty, amount: i.amount }));
        bottom = sorted.slice(-5).reverse().map(i => ({ name: i.name, qty: i.qty, amount: i.amount }));
      }
    } else {
      top    = sorted.slice(0, 5).map(i => ({ name: i.name, qty: i.qty, amount: i.amount }));
      bottom = sorted.slice(-5).reverse().map(i => ({ name: i.name, qty: i.qty, amount: i.amount }));
    }

    const resultObj = { dateLabel, top, bottom };

    try {
      await cacheRef.set({ result: resultObj, cachedAt: FieldValue.serverTimestamp() });
    } catch { /* ignore */ }

    return NextResponse.json({ ...resultObj, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
