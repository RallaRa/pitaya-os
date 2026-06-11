import type { VoucherType } from '@/lib/accounting/types';
import { toYmdCompact } from './flattenVouchers';
import type { ErpFormatAdapter, ErpExportContext, FlatJournalRow } from './types';

const VOUCHER_TYPE_CODE: Record<VoucherType, string> = {
  general: '01',
  sales: '02',
  purchase: '03',
  receipt: '04',
  payment: '05',
  cash: '06',
  transfer: '07',
};

/** 영림원 SystemEver WP — 전표 Excel 일괄등록 양식 */
export const younglimwonFormat: ErpFormatAdapter = {
  id: 'younglimwon',
  label: '영림원',
  sheetName: '전표업로드',
  filePrefix: '영림원_전표',
  headers: [
    '전표일자',
    '전표번호',
    '전표유형',
    '순번',
    '계정과목코드',
    '계정과목명',
    '차변금액',
    '대변금액',
    '적요',
    '거래처코드',
    '거래처명',
    '부서코드',
    '사업장코드',
    '프로젝트코드',
  ],
  mapRow(row: FlatJournalRow, ctx: ErpExportContext) {
    const memo = row.lineMemo || row.voucherDescription;
    return {
      '전표일자': toYmdCompact(row.voucherDate),
      '전표번호': row.voucherNo,
      '전표유형': VOUCHER_TYPE_CODE[row.voucherType] || '01',
      '순번': row.lineNo,
      '계정과목코드': row.externalAccountCode,
      '계정과목명': row.accountName,
      '차변금액': row.debit || 0,
      '대변금액': row.credit || 0,
      '적요': memo,
      '거래처코드': row.partnerCode,
      '거래처명': row.partnerName,
      '부서코드': '',
      '사업장코드': ctx.businessPlaceCode || '1000',
      '프로젝트코드': '',
    };
  },
};
