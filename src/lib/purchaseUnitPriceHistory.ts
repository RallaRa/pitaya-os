import { getKSTTodayYMD } from '@/lib/dateUtils';

export interface PurchaseLineEntry {
  purchaseRecordId: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber?: string;
  unitPrice: number;
  qty: number;
  unit: string;
  supplyAmount: number;
  itemName: string;
  category?: string;
}

export interface DayPriceSummary {
  date: string;
  displayPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalQty: number;
  totalAmount: number;
  lines: PurchaseLineEntry[];
}

export interface UnitPricePeriod {
  from: string;
  to: string | null;
  unitPrice: number;
  avgUnitPrice: number;
  totalQty: number;
  totalAmount: number;
  entryCount: number;
}

export interface ItemPriceHistoryResult {
  itemName: string;
  displayPrice: number;
  displayPriceBasis: string;
  today: string;
  periodSummary: {
    startDate: string;
    endDate: string;
    totalQty: number;
    totalAmount: number;
    avgUnitPrice: number;
    lineCount: number;
  };
  periods: UnitPricePeriod[];
  daySummaries: DayPriceSummary[];
  lines: PurchaseLineEntry[];
}

export interface ItemPriceListRow {
  itemName: string;
  displayPrice: number;
  displayPriceBasis: string;
  totalQty: number;
  totalAmount: number;
  avgUnitPrice: number;
  lineCount: number;
  lastPurchaseDate: string | null;
}

export type PurchaseRecordLike = {
  id: string;
  purchaseDate: string;
  supplierName?: string;
  invoiceNumber?: string;
  items?: Array<{
    name?: string;
    unitPrice?: number;
    qty?: number;
    unit?: string;
    supplyAmount?: number;
    category?: string;
  }>;
};

export function itemPriceDocId(storeId: string, itemName: string): string {
  const safe = itemName.trim().replace(/[/\\#?[\]]/g, '_').slice(0, 120);
  return `${storeId}_${safe}`;
}

export function extractItemLinesFromRecords(
  records: PurchaseRecordLike[],
  itemName: string,
  startDate?: string,
  endDate?: string,
): PurchaseLineEntry[] {
  const target = itemName.trim();
  const lines: PurchaseLineEntry[] = [];
  for (const rec of records) {
    if (startDate && rec.purchaseDate < startDate) continue;
    if (endDate && rec.purchaseDate > endDate) continue;
    for (const it of rec.items || []) {
      const name = (it.name || '').trim();
      if (!name || name !== target || !it.unitPrice) continue;
      const qty = Number(it.qty || 0);
      const unitPrice = Number(it.unitPrice);
      lines.push({
        purchaseRecordId: rec.id,
        purchaseDate: rec.purchaseDate,
        supplierName: rec.supplierName || '',
        invoiceNumber: rec.invoiceNumber,
        unitPrice,
        qty,
        unit: it.unit || 'kg',
        supplyAmount: Number(it.supplyAmount || Math.round(qty * unitPrice)),
        itemName: name,
        category: it.category,
      });
    }
  }
  return lines.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

export function extractAllItemLinesFromRecords(
  records: PurchaseRecordLike[],
  startDate?: string,
  endDate?: string,
): PurchaseLineEntry[] {
  const lines: PurchaseLineEntry[] = [];
  for (const rec of records) {
    if (startDate && rec.purchaseDate < startDate) continue;
    if (endDate && rec.purchaseDate > endDate) continue;
    for (const it of rec.items || []) {
      const name = (it.name || '').trim();
      if (!name || !it.unitPrice) continue;
      const qty = Number(it.qty || 0);
      const unitPrice = Number(it.unitPrice);
      lines.push({
        purchaseRecordId: rec.id,
        purchaseDate: rec.purchaseDate,
        supplierName: rec.supplierName || '',
        invoiceNumber: rec.invoiceNumber,
        unitPrice,
        qty,
        unit: it.unit || 'kg',
        supplyAmount: Number(it.supplyAmount || Math.round(qty * unitPrice)),
        itemName: name,
        category: it.category,
      });
    }
  }
  return lines;
}

/** 당일 중복 → 최고가, 당일 없음 → 최근 매입일 기준(해당일 중복 시 최고가) */
export function getDisplayUnitPrice(
  lines: PurchaseLineEntry[],
  asOfDate: string,
): { price: number; basis: string } {
  const todayLines = lines.filter(l => l.purchaseDate === asOfDate && l.unitPrice > 0);
  if (todayLines.length > 0) {
    const max = Math.max(...todayLines.map(l => l.unitPrice));
    if (todayLines.length > 1) {
      return { price: max, basis: `${asOfDate} 매입 ${todayLines.length}건·최고가 적용` };
    }
    return { price: max, basis: `${asOfDate} 매입 기준` };
  }

  const dates = [...new Set(lines.map(l => l.purchaseDate).filter(d => d <= asOfDate))].sort();
  if (dates.length === 0) return { price: 0, basis: '매입 이력 없음' };

  const latestDate = dates[dates.length - 1];
  const latestLines = lines.filter(l => l.purchaseDate === latestDate);
  const max = Math.max(...latestLines.map(l => l.unitPrice));
  if (latestLines.length > 1) {
    return { price: max, basis: `최근 ${latestDate}·${latestLines.length}건 중 최고가` };
  }
  return { price: max, basis: `최근 매입 ${latestDate}` };
}

export function buildDaySummaries(lines: PurchaseLineEntry[]): DayPriceSummary[] {
  const byDate = new Map<string, PurchaseLineEntry[]>();
  for (const line of lines) {
    if (!line.unitPrice) continue;
    const arr = byDate.get(line.purchaseDate) || [];
    arr.push(line);
    byDate.set(line.purchaseDate, arr);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayLines]) => {
      const prices = dayLines.map(l => l.unitPrice);
      const totalQty = dayLines.reduce((s, l) => s + (l.qty || 0), 0);
      const totalAmount = dayLines.reduce((s, l) => s + (l.supplyAmount || 0), 0);
      return {
        date,
        displayPrice: Math.max(...prices),
        avgPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        totalQty,
        totalAmount,
        lines: dayLines,
      };
    });
}

/** 동일 대표단가(displayPrice) 구간을 from~to 기간으로 병합 (비연속 입력 허용) */
export function buildPricePeriods(daySummaries: DayPriceSummary[]): UnitPricePeriod[] {
  if (!daySummaries.length) return [];

  const periods: UnitPricePeriod[] = [];
  let curFrom = daySummaries[0].date;
  let curPrice = daySummaries[0].displayPrice;
  let accQty = 0;
  let accAmt = 0;
  let accCount = 0;

  const pushPeriod = (to: string | null) => {
    periods.push({
      from: curFrom,
      to,
      unitPrice: curPrice,
      avgUnitPrice: accQty > 0 ? Math.round(accAmt / accQty) : curPrice,
      totalQty: accQty,
      totalAmount: accAmt,
      entryCount: accCount,
    });
  };

  for (let i = 0; i < daySummaries.length; i++) {
    const day = daySummaries[i];
    if (i > 0 && day.displayPrice !== curPrice) {
      pushPeriod(daySummaries[i - 1].date);
      curFrom = day.date;
      curPrice = day.displayPrice;
      accQty = 0;
      accAmt = 0;
      accCount = 0;
    }
    accQty += day.totalQty;
    accAmt += day.totalAmount;
    accCount += day.lines.length;
  }
  pushPeriod(null);
  return periods;
}

export function buildItemPriceHistory(
  itemName: string,
  lines: PurchaseLineEntry[],
  startDate: string,
  endDate: string,
  asOfDate = getKSTTodayYMD(),
): ItemPriceHistoryResult {
  const filtered = lines.filter(
    l => l.purchaseDate >= startDate && l.purchaseDate <= endDate,
  );
  const daySummaries = buildDaySummaries(filtered);
  const periods = buildPricePeriods(daySummaries);
  const { price, basis } = getDisplayUnitPrice(lines, asOfDate);
  const totalQty = filtered.reduce((s, l) => s + (l.qty || 0), 0);
  const totalAmount = filtered.reduce((s, l) => s + (l.supplyAmount || 0), 0);

  return {
    itemName,
    displayPrice: price,
    displayPriceBasis: basis,
    today: asOfDate,
    periodSummary: {
      startDate,
      endDate,
      totalQty,
      totalAmount,
      avgUnitPrice: totalQty > 0 ? Math.round(totalAmount / totalQty) : 0,
      lineCount: filtered.length,
    },
    periods,
    daySummaries,
    lines: filtered,
  };
}

export function buildItemPriceListRows(
  lines: PurchaseLineEntry[],
  startDate: string,
  endDate: string,
  asOfDate = getKSTTodayYMD(),
): ItemPriceListRow[] {
  const inRange = lines.filter(
    l => l.purchaseDate >= startDate && l.purchaseDate <= endDate,
  );
  const byName = new Map<string, PurchaseLineEntry[]>();
  for (const l of inRange) {
    const arr = byName.get(l.itemName) || [];
    arr.push(l);
    byName.set(l.itemName, arr);
  }

  const allByName = new Map<string, PurchaseLineEntry[]>();
  for (const l of lines) {
    const arr = allByName.get(l.itemName) || [];
    arr.push(l);
    allByName.set(l.itemName, arr);
  }

  return [...byName.entries()]
    .map(([itemName, itemLines]) => {
      const totalQty = itemLines.reduce((s, l) => s + (l.qty || 0), 0);
      const totalAmount = itemLines.reduce((s, l) => s + (l.supplyAmount || 0), 0);
      const dates = itemLines.map(l => l.purchaseDate).sort();
      const { price, basis } = getDisplayUnitPrice(allByName.get(itemName) || itemLines, asOfDate);
      return {
        itemName,
        displayPrice: price,
        displayPriceBasis: basis,
        totalQty,
        totalAmount,
        avgUnitPrice: totalQty > 0 ? Math.round(totalAmount / totalQty) : 0,
        lineCount: itemLines.length,
        lastPurchaseDate: dates.length ? dates[dates.length - 1] : null,
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'));
}

export function mergePurchaseLines(
  existing: PurchaseLineEntry[],
  incoming: PurchaseLineEntry[],
): PurchaseLineEntry[] {
  const merged = [...existing];
  for (const nl of incoming) {
    const dup = merged.some(
      el =>
        el.purchaseRecordId === nl.purchaseRecordId
        && el.purchaseDate === nl.purchaseDate
        && el.unitPrice === nl.unitPrice
        && el.qty === nl.qty
        && el.supplyAmount === nl.supplyAmount,
    );
    if (!dup) merged.push(nl);
  }
  return merged.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

export function buildItemPriceDocPayload(
  storeId: string,
  itemName: string,
  lines: PurchaseLineEntry[],
  asOfDate = getKSTTodayYMD(),
) {
  const daySummaries = buildDaySummaries(lines);
  const periods = buildPricePeriods(daySummaries);
  const { price, basis } = getDisplayUnitPrice(lines, asOfDate);
  return {
    storeId,
    itemName,
    currentPrice: price,
    displayPriceBasis: basis,
    lines: lines.slice(-800),
    pricePeriods: periods,
    priceHistory: daySummaries.map(d => ({
      date: d.date,
      price: d.displayPrice,
      avgPrice: d.avgPrice,
      supplierId: d.lines[0]?.supplierName,
    })),
  };
}
