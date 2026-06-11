import type { VoucherType } from '@/lib/accounting/types';
import { toYmdCompact } from './flattenVouchers';
import { younglimwonFormat } from './younglimwonFormat';
import type { ErpFormatAdapter, ErpExportContext, FlatJournalRow } from './types';

const DOUZONE_VOUCHER_TYPE: Record<VoucherType, string> = {
  general: '11',
  sales: '12',
  purchase: '13',
  receipt: '14',
  payment: '15',
  cash: '16',
  transfer: '17',
};

/** 더존 iCUBE / Smart A — 전표 Excel 업로드 양식 */
export const douzoneFormat: ErpFormatAdapter = {
  id: 'douzone',
  label: '더존',
  sheetName: '전표',
  filePrefix: '더존_전표',
  headers: [
    '회사코드',
    '사업장코드',
    '작성일자',
    '전표일자',
    '전표번호',
    '전표유형코드',
    '분개라인번호',
    '계정과목코드',
    '계정과목명',
    '차변금액',
    '대변금액',
    '적요내용',
    '거래처코드',
    '거래처명',
    '부서코드',
    '프로젝트코드',
  ],
  mapRow(row: FlatJournalRow, ctx: ErpExportContext) {
    const ymd = toYmdCompact(row.voucherDate);
    const memo = row.lineMemo || row.voucherDescription;
    return {
      '회사코드': ctx.companyCode || '1000',
      '사업장코드': ctx.businessPlaceCode || '1000',
      '작성일자': ymd,
      '전표일자': ymd,
      '전표번호': row.voucherNo,
      '전표유형코드': DOUZONE_VOUCHER_TYPE[row.voucherType] || '11',
      '분개라인번호': row.lineNo,
      '계정과목코드': row.externalAccountCode,
      '계정과목명': row.accountName,
      '차변금액': row.debit || 0,
      '대변금액': row.credit || 0,
      '적요내용': memo,
      '거래처코드': row.partnerCode,
      '거래처명': row.partnerName,
      '부서코드': '',
      '프로젝트코드': '',
    };
  },
};

export const ERP_FORMATS = {
  younglimwon: younglimwonFormat,
  douzone: douzoneFormat,
} as const;

export function getErpFormat(id: string): ErpFormatAdapter {
  if (id === 'douzone') return douzoneFormat;
  return younglimwonFormat;
}
