import { adminDb } from '@/lib/firebase/admin';
import type { AccountingSettings } from '@/lib/accounting/types';

const DEFAULT_SETTINGS: Omit<AccountingSettings, 'storeId'> = {
  fiscalYearStart: 1,
  voucherApprovalRequired: true,
  autoVoucherFromPurchase: false,
  autoVoucherFromSales: false,
  autoVoucherFromExpense: false,
};

export async function loadAccountingSettings(storeId: string): Promise<AccountingSettings> {
  const doc = await adminDb.collection('accounting_settings').doc(storeId).get();
  if (!doc.exists) {
    return { storeId, ...DEFAULT_SETTINGS };
  }
  const data = doc.data() || {};
  return {
    storeId,
    ...DEFAULT_SETTINGS,
    ...data,
    autoVoucherFromPurchase: !!data.autoVoucherFromPurchase,
    autoVoucherFromSales: !!data.autoVoucherFromSales,
    autoVoucherFromExpense: !!data.autoVoucherFromExpense,
    voucherApprovalRequired: data.voucherApprovalRequired !== false,
  } as AccountingSettings;
}
