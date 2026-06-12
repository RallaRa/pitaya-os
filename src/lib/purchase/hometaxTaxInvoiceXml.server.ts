/** 홈택스 세금계산서 XML (TaxInvoice XML) 경량 파서 */

function stripXmlns(xml: string): string {
  return xml.replace(/\sxmlns(:\w+)?="[^"]*"/g, '');
}

export function xmlGetText(xml: string, path: string): string | undefined {
  const clean = stripXmlns(xml);
  const parts = path.split('/').filter(Boolean);
  let chunk = clean;

  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i];
    const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i');
    const m = chunk.match(open);
    if (!m || m.index == null) return undefined;

    const start = m.index + m[0].length;
    const close = new RegExp(`</${tag}>`, 'i');
    const endMatch = chunk.slice(start).match(close);
    if (!endMatch || endMatch.index == null) return undefined;

    chunk = chunk.slice(start, start + endMatch.index);
  }

  const text = chunk.replace(/<[^>]+>/g, '').trim();
  return text || undefined;
}

export interface ParsedTaxInvoiceDetail {
  docNumber: string;
  txnDate: string;
  merchantName: string;
  supplierBizNo: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  memo?: string;
}

function parseAmount(raw: string | undefined): number {
  const n = Number(String(raw ?? '').replace(/[,₩원\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function formatIssueDate(raw: string | undefined): string {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length >= 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return '';
}

export function parseTaxInvoiceDetailXml(xml: string): ParsedTaxInvoiceDetail | null {
  if (!xml.includes('TaxInvoice') && !xml.includes('IssueID')) return null;

  const docNumber = xmlGetText(xml, 'TaxInvoiceDocument/IssueID') || '';
  const txnDate = formatIssueDate(
    xmlGetText(xml, 'TaxInvoiceDocument/IssueDateTime')
    || xmlGetText(xml, 'TaxInvoiceTradeLineItem/PurchaseExpiryDateTime'),
  );
  const merchantName = xmlGetText(xml, 'TaxInvoiceTradeSettlement/InvoicerParty/NameText') || '';
  const supplierBizNo = (xmlGetText(xml, 'TaxInvoiceTradeSettlement/InvoicerParty/ID') || '').replace(/-/g, '');
  const supplyAmount = parseAmount(xmlGetText(xml, 'TaxInvoiceTradeSettlement/SpecifiedMonetarySummation/ChargeTotalAmount'));
  const taxAmount = parseAmount(xmlGetText(xml, 'TaxInvoiceTradeSettlement/SpecifiedMonetarySummation/TaxTotalAmount'));
  const totalAmount = parseAmount(xmlGetText(xml, 'TaxInvoiceTradeSettlement/SpecifiedMonetarySummation/GrandTotalAmount'));
  const memo = xmlGetText(xml, 'TaxInvoiceDocument/DescriptionText');

  if (!docNumber && !merchantName) return null;

  return {
    docNumber: docNumber.replace(/-/g, ''),
    txnDate,
    merchantName,
    supplierBizNo,
    supplyAmount,
    taxAmount,
    totalAmount: totalAmount || supplyAmount + taxAmount,
    memo: memo || undefined,
  };
}
