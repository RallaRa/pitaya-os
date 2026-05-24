import { NextResponse } from 'next/server';

const API_KEY = process.env.PUBLIC_DATA_API_KEY;
const BASE_URL = 'http://apis.data.go.kr/1390802/AucDrgtService/getAucDrgtList';

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API 키 미설정', auction: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const today = new Date();
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      numOfRows: '100',
      pageNo: '1',
      resultType: 'json',
      aucDt: yyyymmdd,
    });

    const res = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rawItems = data?.response?.body?.items?.item;
    const items: any[] = Array.isArray(rawItems)
      ? rawItems
      : rawItems ? [rawItems] : [];

    if (items.length === 0) {
      return NextResponse.json(
        { auction: null, message: '금일 경매 데이터 없음', date: yyyymmdd },
        { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } }
      );
    }

    const prices = items.map(i => Number(i.aucAmt || i.avgAmt || 0)).filter(p => p > 0);
    const auction = {
      date: yyyymmdd,
      count: items.length,
      avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      minPrice: prices.length ? Math.min(...prices) : 0,
    };

    return NextResponse.json(
      { auction, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message, auction: null }, { status: 500 });
  }
}
