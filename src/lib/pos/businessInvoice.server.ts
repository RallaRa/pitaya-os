import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import type { SaleEventInput } from '@/lib/pos/saleEventNotify.server';

export interface BusinessInvoiceLine {
  goodsName: string;
  barcode: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface BusinessInvoiceDoc {
  storeId: string;
  saleNum: string;
  saleDate: string;
  saleTime?: string;
  cusCode: string;
  customerName: string;
  lines: BusinessInvoiceLine[];
  totalAmount: number;
  status: 'draft' | 'ready';
}

function invoiceDocId(storeId: string, saleNum: string): string {
  return `${storeId}_${saleNum}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function detectIsBusinessCustomer(data: Record<string, unknown>): boolean {
  if (data.isBusiness === true) return true;
  const gubun = String(data.cusGubun || data.grade || '').toLowerCase();
  return /사업|법인|업체|도매|기업/.test(gubun);
}

export function buildInvoiceHtml(invoice: BusinessInvoiceDoc, storeName = '매장'): string {
  const rows = invoice.lines.map(l =>
    `<tr><td>${l.goodsName}</td><td>${l.barcode || '-'}</td><td>${l.qty}</td><td>${l.unitPrice.toLocaleString()}</td><td>${l.totalPrice.toLocaleString()}</td></tr>`,
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>거래명세서</title>
<style>body{font-family:sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;font-size:13px}th{background:#f5f5f5}</style>
</head><body>
<h1>거래명세서</h1>
<p>${storeName} · ${invoice.saleDate} ${invoice.saleTime || ''}</p>
<p>거래처: ${invoice.customerName} (${invoice.cusCode})</p>
<p>영수증: ${invoice.saleNum}</p>
<table><thead><tr><th>품목</th><th>바코드/이력</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>합계: ${invoice.totalAmount.toLocaleString()}원</strong></p>
</body></html>`;
}

export async function processBusinessInvoices(
  storeId: string,
  date: string,
  events: SaleEventInput[],
): Promise<{ created: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.businessInvoiceEnabled) {
    return { created: 0, skipped: events.length, disabled: true };
  }

  const memberEvents = events.filter(e => String(e.cusCode || '').trim());
  if (!memberEvents.length) return { created: 0, skipped: 0 };

  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  const storeName = String(storeDoc.data()?.storeName || '매장');

  let created = 0;
  for (const event of memberEvents) {
    const cusCode = String(event.cusCode || '').trim();
    const custDoc = await adminDb.collection('pos_customers').doc(`${storeId}_${cusCode}`.replace(/[/\\#?]/g, '_').slice(0, 500)).get();
    if (!custDoc.exists || !detectIsBusinessCustomer(custDoc.data() || {})) continue;

    const ref = adminDb.collection('invoices').doc(invoiceDocId(storeId, event.saleNum));
    if ((await ref.get()).exists) continue;

    const lines: BusinessInvoiceLine[] = (event.items || []).map(it => ({
      goodsName: String(it.name || ''),
      barcode: String((it as { barcode?: string }).barcode || ''),
      qty: Number(it.qty || 1),
      unitPrice: Number(it.sellPrice || it.price || 0),
      totalPrice: Number(it.totalPrice || it.price || 0),
    }));

    const invoice: BusinessInvoiceDoc = {
      storeId,
      saleNum: event.saleNum,
      saleDate: date,
      saleTime: event.saleTime,
      cusCode,
      customerName: String(event.cusName || custDoc.data()?.name || cusCode),
      lines,
      totalAmount: event.amount,
      status: 'ready',
    };

    await ref.set({
      ...invoice,
      htmlPreview: buildInvoiceHtml(invoice, storeName),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('notification_queue').add({
      storeId,
      customerId: cusCode,
      customerName: invoice.customerName,
      queueType: 'business_invoice',
      invoiceId: ref.id,
      saleNum: event.saleNum,
      message: `[Pitaya] ${date} 거래명세서 준비됨 (${invoice.totalAmount.toLocaleString()}원)`,
      status: 'pending',
      scheduledAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    created += 1;
  }

  return { created, skipped: memberEvents.length - created };
}

export async function listInvoices(storeId: string, limit = 30) {
  try {
    const snap = await adminDb.collection('invoices')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await adminDb.collection('invoices').where('storeId', '==', storeId).limit(limit).get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string; createdAt?: { seconds?: number } }))
      .sort((a, b) => {
        const aT = a.createdAt?.seconds || 0;
        const bT = b.createdAt?.seconds || 0;
        return bT - aT;
      });
  }
}
