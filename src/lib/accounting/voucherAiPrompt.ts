import type { AccountingAccount, VoucherLine, VoucherType } from '@/lib/accounting/types';

export interface VoucherAiPartner {
  id: string;
  supplierName: string;
}

export interface VoucherAiContext {
  voucherDate?: string;
  voucherType?: VoucherType;
  description?: string;
  lines?: VoucherLine[];
  fundMode?: boolean;
}

export interface VoucherAiDraft {
  description?: string;
  voucherDate?: string;
  voucherType?: VoucherType;
  lines: VoucherLine[];
}

export interface VoucherAiParsed {
  reply: string;
  apply: boolean;
  draft?: VoucherAiDraft;
  warnings: string[];
}

const VALID_VOUCHER_TYPES: VoucherType[] = [
  'general', 'sales', 'purchase', 'receipt', 'payment', 'cash', 'transfer',
];

function compactAccounts(accounts: AccountingAccount[], fundMode?: boolean) {
  let list = accounts.filter(a => a.isActive !== false && a.allowEntry !== false);
  if (fundMode) {
    list = list.filter(a => a.isFundAccount || ['101', '102', '103'].includes(String(a.code)));
  }
  return list
    .slice(0, 120)
    .map(a => `${a.code}:${a.name}`)
    .join(', ');
}

export function buildVoucherAiSystemPrompt(
  accounts: AccountingAccount[],
  partners: VoucherAiPartner[],
  context: VoucherAiContext,
): string {
  const partnerList = partners
    .slice(0, 80)
    .map(p => `${p.supplierName}`)
    .join(', ');

  const currentLines = (context.lines || [])
    .filter(l => l.accountCode || l.debit || l.credit)
    .map(l => `${l.accountCode || '?'} 차${l.debit || 0}/대${l.credit || 0}`)
    .join(' | ');

  return `당신은 한국 정육·소매점 회계 전표 입력 AI입니다. 사용자의 자연어를 분개(차변·대변)로 변환합니다.

## 계정과목 (코드:명)
${compactAccounts(accounts, context.fundMode) || '(등록된 계정 없음)'}

## 거래처(매입처)
${partnerList || '(등록된 거래처 없음)'}

## 자주 쓰는 분개 패턴
- 매입(부가세별도): 차)146상품 공급가, 차)135부가세대급금, 대)251외상매입금+거래처
- 매입(부가세포함 330000원): 공급가=300000, 부가세=30000
- 일매출: 차)101현금 또는 103보통예금, 대)401상품매출+255부가세예수금
- 외상 지급: 차)251외상매입금, 대)103보통예금
- 경비 지출: 차)5xx비용, 대)101현금 또는 103보통예금

## 현재 전표 상태
- 일자: ${context.voucherDate || '(미입력)'}
- 유형: ${context.voucherType || 'general'}
- 적요: ${context.description || '(없음)'}
- 분개: ${currentLines || '(비어 있음)'}

## 규칙
1. 반드시 차변 합계 = 대변 합계 (0원 행 제외)
2. accountCode는 위 목록의 코드만 사용. 없으면 가장 유사한 계정 선택
3. 외상매입금(251)·외상매출금 등 거래처 계정은 partnerName 지정
4. 금액은 정수(원). VAT 10% 별도 시 supply=tax*10, total=supply+tax
5. 질문만 하면 apply:false, 분개 생성·수정 요청이면 apply:true
6. mode "replace"는 전체 교체, "merge"는 기존에 추가/수정

## 출력 JSON (마크다운 없이)
{
  "reply": "사용자에게 보여줄 한국어 설명 (2~5문장)",
  "apply": true,
  "mode": "replace",
  "voucher": {
    "description": "전표적요",
    "voucherDate": "YYYY-MM-DD",
    "voucherType": "general|purchase|sales|payment|receipt|cash|transfer",
    "lines": [
      {
        "accountCode": "146",
        "accountName": "상품",
        "partnerName": "",
        "debit": 300000,
        "credit": 0,
        "memo": "행 적요"
      }
    ]
  }
}`;
}

function matchPartner(name: string, partners: VoucherAiPartner[]) {
  const raw = String(name || '').trim();
  if (!raw) return { partnerCode: '', partnerName: '' };

  const lower = raw.toLowerCase();
  const exact = partners.find(p => p.supplierName.trim().toLowerCase() === lower);
  if (exact) {
    return { partnerCode: String(exact.id).slice(0, 20), partnerName: exact.supplierName };
  }

  const partial = partners.find(p => {
    const pn = p.supplierName.trim().toLowerCase();
    return pn.includes(lower) || lower.includes(pn);
  });
  if (partial) {
    return { partnerCode: String(partial.id).slice(0, 20), partnerName: partial.supplierName };
  }

  return { partnerCode: raw.slice(0, 20), partnerName: raw };
}

function resolveAccount(
  code: string,
  name: string,
  accounts: AccountingAccount[],
): { accountCode: string; accountName: string } | null {
  const trimmed = String(code || '').trim();
  if (trimmed) {
    const byCode = accounts.find(a => String(a.code) === trimmed);
    if (byCode) return { accountCode: byCode.code, accountName: byCode.name };
  }

  const nameQ = String(name || '').trim();
  if (nameQ) {
    const byName = accounts.find(a => a.name.includes(nameQ) || nameQ.includes(a.name));
    if (byName) return { accountCode: byName.code, accountName: byName.name };
  }

  return null;
}

export function resolveVoucherAiDraft(
  raw: Record<string, unknown>,
  accounts: AccountingAccount[],
  partners: VoucherAiPartner[],
  context: VoucherAiContext,
): VoucherAiParsed {
  const warnings: string[] = [];
  const reply = String(raw.reply || '처리했습니다.').trim();
  const apply = raw.apply === true;

  if (!apply) {
    return { reply, apply: false, warnings };
  }

  const voucher = (raw.voucher || {}) as Record<string, unknown>;
  const rawLines = Array.isArray(voucher.lines) ? voucher.lines : [];

  const lines: VoucherLine[] = [];
  let lineNo = 1;

  for (const item of rawLines) {
    const row = item as Record<string, unknown>;
    const resolved = resolveAccount(
      String(row.accountCode || ''),
      String(row.accountName || ''),
      accounts,
    );
    if (!resolved) {
      warnings.push(`계정을 찾을 수 없음: ${row.accountCode || row.accountName}`);
      continue;
    }

    const debit = Math.max(0, Math.round(Number(row.debit || 0)));
    const credit = Math.max(0, Math.round(Number(row.credit || 0)));
    if (debit <= 0 && credit <= 0) continue;

    const partner = matchPartner(String(row.partnerName || ''), partners);

    lines.push({
      lineNo: lineNo++,
      accountCode: resolved.accountCode,
      accountName: resolved.accountName,
      partnerCode: partner.partnerCode,
      partnerName: partner.partnerName,
      deptCode: String(row.deptCode || '').trim(),
      projectCode: String(row.projectCode || '').trim(),
      debit,
      credit,
      memo: String(row.memo || '').trim(),
    });
  }

  if (lines.length < 2) {
    return {
      reply: reply || '분개를 2행 이상 만들지 못했습니다. 금액·거래 내용을 더 구체적으로 알려주세요.',
      apply: false,
      warnings: [...warnings, '유효한 분개 행이 2개 미만'],
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += l.debit;
    totalCredit += l.credit;
  }
  if (totalDebit !== totalCredit) {
    warnings.push(`차대 불균형: 차변 ${totalDebit.toLocaleString()} / 대변 ${totalCredit.toLocaleString()}`);
  }

  const voucherTypeRaw = String(voucher.voucherType || context.voucherType || 'general');
  const voucherType = VALID_VOUCHER_TYPES.includes(voucherTypeRaw as VoucherType)
    ? (voucherTypeRaw as VoucherType)
    : 'general';

  const draft: VoucherAiDraft = {
    description: String(voucher.description || context.description || '').trim() || undefined,
    voucherDate: String(voucher.voucherDate || context.voucherDate || '').trim() || undefined,
    voucherType,
    lines,
  };

  return { reply, apply: true, draft, warnings };
}

export function parseVoucherAiResponse(
  text: string,
  accounts: AccountingAccount[],
  partners: VoucherAiPartner[],
  context: VoucherAiContext,
): VoucherAiParsed {
  const cleaned = text.trim().replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return resolveVoucherAiDraft(parsed, accounts, partners, context);
  } catch {
    return {
      reply: cleaned.slice(0, 500) || 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.',
      apply: false,
      warnings: ['JSON 파싱 실패'],
    };
  }
}
