import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function formatYMD(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  // 캐시 확인
  const cacheId  = `weekly_${storeId || 'global'}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);
  try {
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const d = cacheDoc.data()!;
      const age = Date.now() - (d.cachedAt?.toMillis?.() || 0);
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ ...d.result, cached: true });
      }
    }
  } catch { /* ignore cache read error */ }

  // Firestore에서 최근 7일 daily_reports 집계
  const now   = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  const sinceStr = formatYMD(since);

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('daily_reports')
      .where('reportDate', '>=', sinceStr);
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.limit(100).get();

    // 품목별 집계
    const itemMap: Record<string, { name: string; qty: number; amount: number; days: Set<string> }> = {};
    let prevItemMap: Record<string, { qty: number }> = {};

    snap.docs.forEach(doc => {
      const d    = doc.data();
      const date = d.reportDate || '';
      const items: any[] = d.items || [];

      // 지난주 데이터 vs 이번주 분리 (3.5일 기준)
      const midStr = formatYMD(new Date(since.getTime() + 3.5 * 24 * 60 * 60 * 1000));
      const isThisWeek = date >= midStr;

      items.forEach((item: any) => {
        const name = item.name || item.barcode || '(알 수 없음)';
        if (!name || name.length > 50) return;

        if (isThisWeek) {
          if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0, days: new Set() };
          itemMap[name].qty    += Number(item.qty    || 0);
          itemMap[name].amount += Number(item.netSales || item.amount || 0);
          itemMap[name].days.add(date);
        } else {
          if (!prevItemMap[name]) prevItemMap[name] = { qty: 0 };
          prevItemMap[name].qty += Number(item.qty || 0);
        }
      });
    });

    const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
    if (sorted.length === 0) {
      return NextResponse.json({ top: [], bottom: [], insight: '판매 데이터가 없습니다.', cached: false });
    }

    // Gemini 분석
    const summaryText = sorted.slice(0, 30).map(i =>
      `${i.name}: 수량=${i.qty}, 금액=${i.amount.toLocaleString()}원`
    ).join('\n');

    let top:    any[] = [];
    let bottom: any[] = [];
    let insight = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `다음은 정육점의 최근 7일 판매 데이터입니다.\n${summaryText}\n\n분석해서 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이):\n{"top":[{"name":"품목명","qty":숫자,"amount":숫자,"prevQty":숫자}],"bottom":[{"name":"품목명","qty":숫자}],"insight":"한 줄 인사이트"}\ntop은 판매량 상위 3개, bottom은 판매량 하위 3개(qty>0인 것), insight는 50자 이내 한국어 한 줄 인사이트.`;

        const result = await model.generateContent(prompt);
        const text   = result.response.text().trim().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);

        top    = (parsed.top    || []).slice(0, 3).map((t: any) => ({
          ...t,
          pctChange: prevItemMap[t.name]?.qty
            ? Math.round(((t.qty - prevItemMap[t.name].qty) / prevItemMap[t.name].qty) * 100)
            : null,
        }));
        bottom  = (parsed.bottom  || []).slice(0, 3);
        insight = parsed.insight || '';
      } catch {
        // Gemini 실패 시 단순 집계
        top    = sorted.slice(0, 3).map(i => ({ name: i.name, qty: i.qty, amount: i.amount, pctChange: null }));
        bottom = sorted.slice(-3).reverse().map(i => ({ name: i.name, qty: i.qty }));
      }
    } else {
      top    = sorted.slice(0, 3).map(i => ({ name: i.name, qty: i.qty, amount: i.amount, pctChange: null }));
      bottom = sorted.slice(-3).reverse().map(i => ({ name: i.name, qty: i.qty }));
      insight = 'GEMINI_API_KEY 설정 시 AI 분석을 이용할 수 있습니다.';
    }

    const resultObj = { top, bottom, insight };

    // 캐시 저장
    try {
      await cacheRef.set({ result: resultObj, cachedAt: FieldValue.serverTimestamp() });
    } catch { /* ignore */ }

    return NextResponse.json({ ...resultObj, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
