import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchPurchaseRecordsForStore } from '@/lib/purchaseRecordsQuery.server';
import {
  buildItemPriceHistory,
  buildItemPriceListRows,
  extractAllItemLinesFromRecords,
  extractItemLinesFromRecords,
  itemPriceDocId,
  type PurchaseLineEntry,
} from '@/lib/purchaseUnitPriceHistory';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const itemName = (searchParams.get('itemName') || '').trim();
  const today = getKSTTodayYMD();
  const startDate = searchParams.get('startDate') || today.slice(0, 8) + '01';
  const endDate = searchParams.get('endDate') || today;

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    if (itemName) {
      const records = await fetchPurchaseRecordsForStore(storeId, { limit: 500 });

      let allLines = extractItemLinesFromRecords(records, itemName);
      const docSnap = await adminDb.collection('item_prices').doc(itemPriceDocId(storeId, itemName)).get();
      if (docSnap.exists) {
        const stored = (docSnap.data()?.lines || []) as PurchaseLineEntry[];
        if (stored.length > allLines.length) {
          allLines = stored;
        }
      }

      const history = buildItemPriceHistory(itemName, allLines, startDate, endDate, today);
      return NextResponse.json({ mode: 'item', ...history });
    }

    const records = await fetchPurchaseRecordsForStore(storeId, { limit: 500 });

    const allLines = extractAllItemLinesFromRecords(records);
    const items = buildItemPriceListRows(allLines, startDate, endDate, today);
    const inRangeLines = allLines.filter(l => l.purchaseDate >= startDate && l.purchaseDate <= endDate);
    const totalQty = inRangeLines.reduce((s, l) => s + (l.qty || 0), 0);
    const totalAmount = inRangeLines.reduce((s, l) => s + (l.supplyAmount || 0), 0);

    return NextResponse.json({
      mode: 'list',
      startDate,
      endDate,
      today,
      summary: {
        itemCount: items.length,
        totalQty,
        totalAmount,
        avgUnitPrice: totalQty > 0 ? Math.round(totalAmount / totalQty) : 0,
        lineCount: inRangeLines.length,
      },
      items,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[item-price-history]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
