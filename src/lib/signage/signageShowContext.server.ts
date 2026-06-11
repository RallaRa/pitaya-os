import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchWeather, getStoreCoords } from '@/lib/weather';
import {
  computeSignageRotation,
  formatSignageCustomerContextBlock,
  formatSignageRotationSummary,
} from '@/lib/signage/signageShowShared';
import type { ItemVelocity, SignageShowContext } from '@/lib/signage/signageShowContext.types';

export type { ItemVelocity, SignageShowContext } from '@/lib/signage/signageShowContext.types';
export { computeSignageRotation, formatSignageCustomerContextBlock, formatSignageRotationSummary };

function normalizeItemName(name: string): string {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

async function fetchItemVelocity(storeId: string): Promise<{ hot: ItemVelocity[]; slow: ItemVelocity[] }> {
  const sinceYmd = addDaysYMD(getKSTTodayYMD(), -30);
  const qtyMap = new Map<string, { qty: number; amount: number }>();

  try {
    const snap = await adminDb.collection('pos_customer_purchase_lines')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceYmd)
      .limit(3000)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      const name = normalizeItemName(String(d.goodsName || d.itemName || d.barcode || ''));
      if (!name || name.length < 2) continue;
      const cur = qtyMap.get(name) || { qty: 0, amount: 0 };
      cur.qty += Number(d.saleCount || d.qty || 1);
      cur.amount += Number(d.totalPrice || d.amount || 0);
      qtyMap.set(name, cur);
    }
  } catch {
    /* fallback below */
  }

  if (qtyMap.size < 3) {
    try {
      const statsSnap = await adminDb.collection('store_daily_item_stats')
        .where('storeId', '==', storeId)
        .limit(500)
        .get();
      for (const doc of statsSnap.docs) {
        const d = doc.data();
        const name = normalizeItemName(String(d.itemName || d.goodsName || ''));
        if (!name) continue;
        const cur = qtyMap.get(name) || { qty: 0, amount: 0 };
        cur.qty += Number(d.qty || d.quantity || 0);
        cur.amount += Number(d.amount || d.sales || 0);
        qtyMap.set(name, cur);
      }
    } catch { /* ignore */ }
  }

  if (qtyMap.size < 2) {
    try {
      const itemsSnap = await adminDb.collection('items')
        .where('storeId', '==', storeId)
        .limit(80)
        .get();
      for (const doc of itemsSnap.docs) {
        const d = doc.data();
        const name = normalizeItemName(String(d.cut || d.name || d.species || ''));
        if (!name || qtyMap.has(name)) continue;
        qtyMap.set(name, { qty: 0, amount: 0 });
      }
    } catch { /* ignore */ }
  }

  const ranked = [...qtyMap.entries()]
    .map(([name, v]) => ({ name, qty30d: v.qty, amount30d: v.amount }))
    .filter(i => i.name.length >= 2)
    .sort((a, b) => b.qty30d - a.qty30d || b.amount30d - a.amount30d);

  const withSales = ranked.filter(i => i.qty30d > 0);
  const hot = (withSales.length ? withSales : ranked).slice(0, 8);

  let slow: ItemVelocity[] = [];
  if (withSales.length >= 4) {
    const hotNames = new Set(hot.slice(0, 3).map(i => i.name));
    const mid = Math.max(1, Math.floor(withSales.length * 0.35));
    slow = withSales
      .slice(-mid)
      .filter(i => !hotNames.has(i.name))
      .reverse()
      .slice(0, 8);
  }
  if (slow.length < 2) {
    slow = ranked
      .filter(i => !hot.slice(0, 2).some(h => h.name === i.name))
      .filter(i => i.qty30d === 0 || i.qty30d <= (withSales[withSales.length - 1]?.qty30d ?? 0))
      .slice(0, 8);
  }

  return { hot, slow };
}

async function fetchActiveCoupons(storeId: string): Promise<string[]> {
  try {
    const snap = await adminDb.collection('coupons')
      .where('storeId', '==', storeId)
      .limit(15)
      .get();
    return snap.docs
      .map(d => d.data())
      .filter(c => c.status === 'active' || c.status === 'published' || !c.status)
      .slice(0, 4)
      .map(c => {
        const title = c.title || c.name || '쿠폰';
        const disc = c.discountValue ?? c.discountAmount;
        return disc ? `${title} (${disc}${c.discountType === 'percent' ? '%' : '원'})` : title;
      });
  } catch {
    return [];
  }
}

async function fetchCustomerEvents(storeId: string): Promise<string[]> {
  try {
    const snap = await adminDb.collection('calendar_events')
      .where('storeId', '==', storeId)
      .limit(20)
      .get();
    const today = getKSTTodayYMD();
    return [...snap.docs]
      .map(d => d.data())
      .filter(e => {
        const title = String(e.title || '');
        if (/매출|마감|회의|급여|인사|재고조사/i.test(title)) return false;
        return String(e.startDate || e.date || '') >= today;
      })
      .sort((a, b) => String(a.startDate || a.date).localeCompare(String(b.startDate || b.date)))
      .slice(0, 3)
      .map(e => String(e.title || '이벤트'));
  } catch {
    return [];
  }
}

async function fetchWeatherLine(storeId: string): Promise<string> {
  try {
    const storeSnap = await adminDb.collection('stores').doc(storeId).get();
    const regionSido = storeSnap.data()?.regionSido || storeSnap.data()?.region || '';
    const coords = getStoreCoords(regionSido);
    const w = await fetchWeather(getKSTTodayYMD(), coords);
    if (!w) return '맑음';
    return `${w.condition} · ${w.tempMax}°C`;
  } catch {
    return '맑음';
  }
}

export async function loadSignageShowContext(storeId: string): Promise<SignageShowContext> {
  const [storeSnap, velocity, activeCoupons, customerEvents, weather] = await Promise.all([
    adminDb.collection('stores').doc(storeId).get(),
    fetchItemVelocity(storeId),
    fetchActiveCoupons(storeId),
    fetchCustomerEvents(storeId),
    fetchWeatherLine(storeId),
  ]);

  const rotation = computeSignageRotation(velocity.hot, velocity.slow);
  const today = getKSTTodayYMD();

  const planningNotes: string[] = [];
  if (rotation.featuredHot) {
    planningNotes.push(`인기 강조: ${rotation.featuredHot.name}`);
  }
  if (rotation.featuredSlow) {
    planningNotes.push(`구매 유도 추천: ${rotation.featuredSlow.name}`);
  }

  return {
    storeName: storeSnap.data()?.storeName || '매장',
    today,
    weather,
    hotItems: velocity.hot,
    slowItems: velocity.slow,
    rotation,
    activeCoupons,
    customerEvents,
    internal: { planningNotes },
  };
}
