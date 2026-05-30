import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyToken } from '@/lib/authVerify';
import { fetchWeeklyItemAggregates } from '@/lib/dashboardSalesData';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function formatYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) {
    return NextResponse.json({ top: [], bottom: [], insight: '매장을 선택해주세요.', cached: false });
  }

  const cacheId = `weekly_${storeId}`;
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
  } catch { /* ignore */ }

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  const sinceStr = formatYMD(since);
  const midStr = formatYMD(new Date(since.getTime() + 3.5 * 24 * 60 * 60 * 1000));

  try {
    const { itemMap, prevItemMap } = await fetchWeeklyItemAggregates(storeId, sinceStr, midStr);
    const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty);

    if (sorted.length === 0) {
      return NextResponse.json({
        top: [],
        bottom: [],
        insight: '최근 7일 판매 데이터가 없습니다. POS 브릿지 동기화를 확인해주세요.',
        cached: false,
      });
    }

    const summaryText = sorted.slice(0, 30).map(i =>
      `${i.name}: 수량=${i.qty}, 금액=${i.amount.toLocaleString()}원`,
    ).join('\n');

    let top: Array<{ name: string; qty: number; amount?: number; pctChange: number | null }> = [];
    let bottom: Array<{ name: string; qty: number }> = [];
    let insight = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const models = ['gemini-2.0-flash'];
        const prompt = `다음은 정육점의 최근 7일 판매 데이터입니다.\n${summaryText}\n\n분석해서 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이):\n{"top":[{"name":"품목명","qty":숫자,"amount":숫자}],"bottom":[{"name":"품목명","qty":숫자}],"insight":"한 줄 인사이트"}\ntop은 판매량 상위 3개, bottom은 판매량 하위 3개(qty>0), insight는 50자 이내 한국어.`;

        let parsed: { top?: unknown[]; bottom?: unknown[]; insight?: string } | null = null;
        for (const modelName of models) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim().replace(/```json|```/g, '').trim();
            parsed = JSON.parse(text);
            break;
          } catch { /* try next model */ }
        }

        if (parsed) {
          top = (parsed.top || []).slice(0, 3).map((t: { name: string; qty: number; amount?: number }) => ({
            ...t,
            pctChange: prevItemMap[t.name]?.qty
              ? Math.round(((t.qty - prevItemMap[t.name].qty) / prevItemMap[t.name].qty) * 100)
              : null,
          }));
          bottom = (parsed.bottom || []).slice(0, 3) as typeof bottom;
          insight = parsed.insight || '';
        }
      } catch {
        /* fallback below */
      }
    }

    if (top.length === 0) {
      top = sorted.slice(0, 3).map(i => ({
        name: i.name,
        qty: i.qty,
        amount: i.amount,
        pctChange: prevItemMap[i.name]?.qty
          ? Math.round(((i.qty - prevItemMap[i.name].qty) / prevItemMap[i.name].qty) * 100)
          : null,
      }));
      bottom = sorted.filter(i => i.qty > 0).slice(-3).reverse().map(i => ({ name: i.name, qty: i.qty }));
      insight = insight || '최근 7일 판매 데이터 기준 집계입니다.';
    }

    const resultObj = { top, bottom, insight };
    await cacheRef.set({ result: resultObj, cachedAt: FieldValue.serverTimestamp() }).catch(() => {});
    return NextResponse.json({ ...resultObj, cached: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[weekly-analysis]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
