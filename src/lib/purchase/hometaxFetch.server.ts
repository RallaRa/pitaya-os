import { adminDb } from '@/lib/firebase/admin';
import type { PurchaseEvidence, PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';
import { buildHometaxEvidenceKey } from '@/lib/purchase/hometaxEvidenceKey';
import type { HometaxCookie } from '@/lib/purchase/hometaxTypes';
import {
  HometaxClient,
  parseHometaxAmount,
  parseHometaxDate,
  splitDateRange,
} from '@/lib/purchase/hometaxClient.server';
import { parseTaxInvoiceDetailXml } from '@/lib/purchase/hometaxTaxInvoiceXml.server';

const DETAIL_DELAY_MS = 250;
const MAX_DETAIL_FETCHES = 150;

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function loadStoreBusinessNumber(storeId: string): Promise<string | undefined> {
  const snap = await adminDb.collection('stores').doc(storeId).get();
  if (!snap.exists) return undefined;
  const bn = String(snap.data()?.businessNumber || '').replace(/-/g, '');
  return bn || undefined;
}

function baseEvidence(
  storeId: string,
  sourceType: PurchaseEvidenceSource,
  fields: {
    date: unknown;
    merchant: unknown;
    bizNo?: unknown;
    supply?: unknown;
    tax?: unknown;
    total: unknown;
    docNumber?: unknown;
    approvalNo?: unknown;
    cardName?: unknown;
    memo?: unknown;
  },
): Omit<PurchaseEvidence, 'id'> | null {
  const txnDate = parseHometaxDate(fields.date);
  const totalAmount = parseHometaxAmount(fields.total);
  const merchantName = String(fields.merchant || '').trim();

  if (!txnDate || totalAmount <= 0 || !merchantName) return null;

  const partial = {
    storeId,
    sourceType,
    txnDate,
    merchantName,
    supplierBizNo: fields.bizNo ? String(fields.bizNo).replace(/-/g, '') : undefined,
    supplyAmount: fields.supply != null ? parseHometaxAmount(fields.supply) : undefined,
    taxAmount: fields.tax != null ? parseHometaxAmount(fields.tax) : undefined,
    totalAmount,
    docNumber: fields.docNumber ? String(fields.docNumber).replace(/-/g, '') : undefined,
    approvalNo: fields.approvalNo ? String(fields.approvalNo) : undefined,
    cardName: fields.cardName ? String(fields.cardName) : undefined,
    memo: fields.memo ? String(fields.memo) : undefined,
    matchStatus: 'unmatched' as const,
  };

  return {
    ...partial,
    importSource: 'hometax',
    externalKey: buildHometaxEvidenceKey(storeId, sourceType, partial),
  };
}

async function fetchTaxInvoices(
  client: HometaxClient,
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<Omit<PurchaseEvidence, 'id'>[]> {
  const records: Omit<PurchaseEvidence, 'id'>[] = [];
  const ranges = splitDateRange(startDate, endDate, 3);
  let detailFetches = 0;

  for (const range of ranges) {
    const params = {
      bmanCd: '00',
      dmnrMpbNo: '',
      dmnrTxprDscmNo: '',
      dtCl: '03',
      etxivClsfCd: 'all',
      etxivKndCd: 'all',
      inqrDtEnd: range.end,
      inqrDtStrt: range.begin,
      isnTypeCd: 'all',
      pageNum: '',
      pageSize: '10',
      prhSlsClCd: '02',
      screenId: '',
      splrMpbNo: '',
      splrTxprDscmNo: '',
      tnmNm: '',
      cstnBmanMpbNo: '',
      cstnBmanTin: '',
      dmnrTin: client.tin,
      dmnrTnmNm: '',
      etxivClCd: '01',
      gubunCd: '',
      mCd: '',
      mqCd: '',
      qCd: '',
      splrTin: '',
      splrTnmNm: '',
      tmsnDtIn: '',
      tmsnDtOut: '',
      yCd: '',
    };

    for await (const row of client.paginateActionJson(
      'ATEETBDA001R01',
      'UTEETBDA01',
      {
        cstnInfoYn: '',
        fleDwldYn: '',
        fleTp: '',
        icldCstnBmanInfr: '',
        icldLsatInfr: 'N',
        resnoSecYn: 'Y',
        srtClCd: '1',
        srtOpt: '02',
        etxivIsnBrkdTermDVOPrmt: params,
      },
      'teet',
    )) {
      const etan = String(row.etan || row.etxivAprvNo || '').replace(/-/g, '');
      let rec: Omit<PurchaseEvidence, 'id'> | null = null;

      if (etan && detailFetches < MAX_DETAIL_FETCHES) {
        try {
          const xml = await client.fetchTaxInvoiceDetailXml(etan);
          const detail = parseTaxInvoiceDetailXml(xml);
          detailFetches++;
          if (detail) {
            rec = baseEvidence(storeId, 'tax_invoice', {
              date: detail.txnDate || row.wrtDt || row.isnDt || row.tmsnDt,
              merchant: detail.merchantName || row.tnmNm || row.splrTnmNm,
              bizNo: detail.supplierBizNo || row.splrTxprDscmNoEncCntn,
              supply: detail.supplyAmount || row.sumSplCft || row.splCft,
              tax: detail.taxAmount || row.sumTxamt || row.txamt,
              total: detail.totalAmount || row.sumTotaAmt || row.totaAmt,
              docNumber: detail.docNumber || etan,
              memo: detail.memo || row.etxivKndNm,
            });
          }
          await sleep(DETAIL_DELAY_MS);
        } catch {
          /* 목록 데이터로 폴백 */
        }
      }

      if (!rec) {
        rec = baseEvidence(storeId, 'tax_invoice', {
          date: row.wrtDt || row.isnDt || row.tmsnDt,
          merchant: row.tnmNm || row.splrTnmNm || row.mpbNm,
          bizNo: row.splrTxprDscmNoEncCntn || row.txprDscmNoEncCntn,
          supply: row.sumSplCft || row.splCft,
          tax: row.sumTxamt || row.txamt,
          total: row.sumTotaAmt || row.totaAmt,
          docNumber: etan || row.etan,
          memo: row.etxivKndNm,
        });
      }

      if (rec) records.push(rec);
    }
  }

  return records;
}

async function fetchCashReceipts(
  client: HometaxClient,
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<Omit<PurchaseEvidence, 'id'>[]> {
  const records: Omit<PurchaseEvidence, 'id'>[] = [];
  const begin = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  const bizNo = client.businessNumber;

  for await (const row of client.paginateActionJson(
    'ATECRCBA001R02',
    'UTECRCB005',
    {
      dprtUserYn: 'N',
      fleTp: '',
      mrntTxprDscmNoEncCntn: '',
      pubcUserNo: 'all',
      reqCd: '',
      spjbTrsYn: 'all',
      spstCnfrId: 'all',
      sumTotaTrsAmt: '',
      tin: client.tin,
      trsDtRngEnd: end,
      trsDtRngStrt: begin,
      txprDscmNo: bizNo,
      totalCount: '0',
      sumSplCft: '0',
    },
    'tecr',
  )) {
    const rec = baseEvidence(storeId, 'cash_receipt', {
      date: row.trsDtTime || row.trsDt,
      merchant: row.mrntTxprNm,
      bizNo: row.mrntTxprDscmNoEncCntn,
      supply: row.splCft,
      tax: row.vaTxamt,
      total: row.totaTrsAmt,
      approvalNo: row.aprvNo,
      memo: row.cshptTrsTypeNm || row.spstCnfrClNm,
    });
    if (rec) records.push(rec);
  }

  return records;
}

async function fetchCardPurchases(
  client: HometaxClient,
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<Omit<PurchaseEvidence, 'id'>[]> {
  const records: Omit<PurchaseEvidence, 'id'>[] = [];
  const ranges = splitDateRange(startDate, endDate, 3);

  for (const range of ranges) {
    for await (const row of client.paginateActionJson(
      'ATECRCCA001R06',
      'UTECRCB023',
      {
        busnCrdcDwldFleStatCd: '',
        busnCrdcTrsBrkdPrhYr: '',
        dwldCnclFg: '',
        dwldFleNm: '',
        dwldTrsBrkdScnt: '',
        fleTp: '',
        gdncMsgCntn: '',
        ntplBmanAthYn: '',
        prhQrt: '',
        prhQrtEdInq: '',
        prhQrtStInq: '',
        prhQrtStrtYm: '',
        prhTxamtDdcYn: 'all',
        reqCd: '',
        resultCd: '',
        rqsDt: '',
        rqstTxprDscmNo: '',
        sumTotaTrsAmt: '',
        tin: client.tin,
        trsDtRngEnd: range.end,
        trsDtRngStrt: range.begin,
        txprDclsCd: '250',
        upldFleNm: '',
        upldPsbYn: '',
        yearInq: '',
      },
      'tecr',
    )) {
      const rec = baseEvidence(storeId, 'card', {
        date: row.aprvDt || row.trsDt,
        merchant: row.mrntTxprNm,
        bizNo: row.mrntTxprDscmNoEncCntn,
        supply: row.splCft,
        tax: row.vaTxamt,
        total: row.totaTrsAmt,
        approvalNo: row.busnCrdcTrsBrkdSn,
        cardName: row.crcmClNm,
        memo: row.ddcYnNm || row.vatDdcClNm,
      });
      if (rec) records.push(rec);
    }
  }

  return records;
}

export async function fetchHometaxPurchaseEvidence(params: {
  storeId: string;
  cookies: HometaxCookie[];
  sourceType: PurchaseEvidenceSource;
  startDate: string;
  endDate: string;
}): Promise<{ records: Omit<PurchaseEvidence, 'id'>[]; note: string }> {
  const businessNumber = await loadStoreBusinessNumber(params.storeId);
  const client = new HometaxClient(params.cookies);
  await client.initialize(businessNumber);

  let records: Omit<PurchaseEvidence, 'id'>[] = [];

  switch (params.sourceType) {
    case 'tax_invoice':
      records = await fetchTaxInvoices(client, params.storeId, params.startDate, params.endDate);
      break;
    case 'cash_receipt':
      records = await fetchCashReceipts(client, params.storeId, params.startDate, params.endDate);
      break;
    case 'card':
      records = await fetchCardPurchases(client, params.storeId, params.startDate, params.endDate);
      break;
  }

  return {
    records,
    note: records.length > 0
      ? `${params.sourceType} ${records.length}건`
      : `${params.sourceType}: 해당 기간 데이터 없음`,
  };
}
