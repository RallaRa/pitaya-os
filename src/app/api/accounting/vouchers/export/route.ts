import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { AccountingAccount, AccountingVoucher } from '@/lib/accounting/types';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import {
  buildAccountExternalMap,
  flattenVouchersToJournalRows,
} from '@/lib/accounting/export/flattenVouchers';
import { buildExportFilename, buildVoucherExportWorkbook } from '@/lib/accounting/export/buildWorkbook';
import { getErpFormat } from '@/lib/accounting/export/douzoneFormat';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const format = searchParams.get('format') || 'younglimwon';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const status = searchParams.get('status') || 'approved';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const [voucherSnap, accountSnap, settingsSnap] = await Promise.all([
      adminDb.collection('accounting_vouchers').where('storeId', '==', storeId).limit(500).get(),
      adminDb.collection('accounting_accounts').where('storeId', '==', storeId).get(),
      adminDb.collection('accounting_settings').doc(storeId).get(),
    ]);

    let vouchers = voucherSnap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingVoucher));
    if (status && status !== 'all') {
      vouchers = vouchers.filter(v => v.status === status);
    }
    if (startDate) vouchers = vouchers.filter(v => String(v.voucherDate) >= startDate);
    if (endDate) vouchers = vouchers.filter(v => String(v.voucherDate) <= endDate);

    if (vouchers.length === 0) {
      return NextResponse.json({ error: '다운로드할 전표가 없습니다.' }, { status: 404 });
    }

    const accounts = accountSnap.docs.map(d => d.data() as AccountingAccount);
    const externalMap = buildAccountExternalMap(accounts);
    const flatRows = flattenVouchersToJournalRows(vouchers, externalMap);

    if (flatRows.length === 0) {
      return NextResponse.json({ error: '분개 행이 없습니다.' }, { status: 404 });
    }

    const settings = settingsSnap.data() || {};
    const adapter = getErpFormat(format);
    const buffer = buildVoucherExportWorkbook(adapter, flatRows, {
      companyCode: String(settings.erpCompanyCode || '1000'),
      businessPlaceCode: String(settings.erpBusinessPlaceCode || '1000'),
      companyName: String(settings.companyName || ''),
    });

    const filename = buildExportFilename(adapter, startDate, endDate);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
