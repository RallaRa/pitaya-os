const API_KEY = process.env.PUBLIC_DATA_API_KEY;
const PRICE_URL = 'http://apis.data.go.kr/1390802/SurveyYHCityPriceService/getSurveyYHCityPriceList';
const AUCTION_URL = 'http://apis.data.go.kr/1390802/AucDrgtService/getAucDrgtList';

const ITEMS = [
  { itemCode: '00010', itemName: '한우등심', gradeCode: '1' },
  { itemCode: '00020', itemName: '한우불고기', gradeCode: '1' },
  { itemCode: '00030', itemName: '한우갈비', gradeCode: '1' },
  { itemCode: '00200', itemName: '돼지삼겹살', gradeCode: '' },
  { itemCode: '00210', itemName: '돼지목살', gradeCode: '' },
  { itemCode: '00220', itemName: '돼지갈비', gradeCode: '' },
];

export interface MeatPriceRow {
  itemName: string;
  price: number;
  unit: string;
  date: string;
}

export interface MeatAuctionSummary {
  date: string;
  count: number;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
}

export async function fetchMeatPrices(): Promise<{ prices: MeatPriceRow[]; error?: string }> {
  if (!API_KEY) return { prices: [], error: 'API 키 미설정' };

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
        const res = await fetch(`${PRICE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.response?.body?.items?.item || [];
        const first = Array.isArray(raw) ? raw[0] : raw;
        if (!first) return null;
        return {
          itemName: item.itemName,
          price: Number(first.price || first.avgPrice || 0),
          unit: first.unit || '100g',
          date: first.stDate || yyyymmdd,
        };
      }),
    );

    const prices = results
      .filter((r): r is PromiseFulfilledResult<MeatPriceRow> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    return { prices };
  } catch (e: unknown) {
    return { prices: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchMeatAuction(): Promise<{ auction: MeatAuctionSummary | null; error?: string }> {
  if (!API_KEY) return { auction: null, error: 'API 키 미설정' };

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

    const res = await fetch(`${AUCTION_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rawItems = data?.response?.body?.items?.item;
    const items: { aucAmt?: number; avgAmt?: number }[] = Array.isArray(rawItems)
      ? rawItems
      : rawItems ? [rawItems] : [];

    if (items.length === 0) return { auction: null };

    const prices = items.map(i => Number(i.aucAmt || i.avgAmt || 0)).filter(p => p > 0);
    return {
      auction: {
        date: yyyymmdd,
        count: items.length,
        avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        minPrice: prices.length ? Math.min(...prices) : 0,
      },
    };
  } catch (e: unknown) {
    return { auction: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchMeatMarketBundle() {
  const [prices, auction] = await Promise.all([fetchMeatPrices(), fetchMeatAuction()]);
  return { prices, auction };
}
