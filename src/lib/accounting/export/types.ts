import type { AccountingVoucher, VoucherStatus, VoucherType } from '@/lib/accounting/types';

export type ErpExportFormat = 'younglimwon' | 'douzone';

export interface ErpExportContext {
  companyCode?: string;
  businessPlaceCode?: string;
  companyName?: string;
}

export interface FlatJournalRow {
  voucherId: string;
  voucherDate: string;
  voucherNo: string;
  voucherType: VoucherType;
  voucherDescription: string;
  status: VoucherStatus;
  lineNo: number;
  accountCode: string;
  accountName: string;
  externalAccountCode: string;
  partnerCode: string;
  partnerName: string;
  debit: number;
  credit: number;
  lineMemo: string;
}

export type ErpExportRow = Record<string, string | number>;

export interface ErpFormatAdapter {
  id: ErpExportFormat;
  label: string;
  sheetName: string;
  filePrefix: string;
  headers: string[];
  mapRow: (row: FlatJournalRow, ctx: ErpExportContext) => ErpExportRow;
}
