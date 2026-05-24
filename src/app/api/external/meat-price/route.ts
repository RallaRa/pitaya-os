import { NextResponse } from 'next/server';

const API_KEY = process.env.PUBLIC_DATA_API_KEY;
const BASE_URL = 'http://apis.data.go.kr/1390802/SurveyYHCityPriceService/getSurveyYHCityPriceList';

const ITEMS = [
  { itemCode: '00010', itemName: '한우등심', gradeCode: '1' },
  { itemCode: '00020', itemName: '한우불고기', gradeCode: '1' },
  { itemCode: '00030', itemName: '한우갈비', gradeCode: '1' },
  { itemCode: '00200', itemName: '돼지삼겹살', gradeCode: '' },
  { itemCode: '00210', itemName: '돼지목살', gradeCode: '' },
  { itemCode: '00220', itemName: '돼지갈비', gradeCode: '' },
];

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API 키 미설정', prices: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const today = new Date();
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  try {
    const results = await Promise.allSettled(
      ITEMS.map(async (item) => {
        const params = new URLSearchParams({
          serviceKey: API_KEY,
          numOfRows: '5',
          pageNo: '1',
          resultType: 'json',
          stYear: String(today.getFullYear()),
          stMonth: String(today.getMonth() + 1).padStart(2, '0'),
          stDay: String(today.getDate()).padStart(2, '0'),
          itemCode: item.itemCode,
        });
        const res = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = data?.response?.body?.items?.item || [];
        const first = Array.isArray(items) ? items[0] : items;
        if (!first) return null;
        return {
          itemName: item.itemName,
          price: Number(first.price || first.avgPrice || 0),
          unit: first.unit || '100g',
          date: first.stDate || yyyymmdd,
        };
      })
    );

    const prices = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    return NextResponse.json(
      { prices, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message, prices: [] }, { status: 500 });
  }
}
