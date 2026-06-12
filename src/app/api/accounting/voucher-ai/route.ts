import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { AccountingAccount } from '@/lib/accounting/types';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import {
  buildVoucherAiSystemPrompt,
  parseVoucherAiResponse,
  type VoucherAiContext,
  type VoucherAiPartner,
} from '@/lib/accounting/voucherAiPrompt';
import {
  generateTextWithFallback,
  hasAnyAiProvider,
  stripJsonMarkdown,
} from '@/lib/aiProviderFallback';

async function loadAccounts(storeId: string): Promise<AccountingAccount[]> {
  const snap = await adminDb.collection('accounting_accounts')
    .where('storeId', '==', storeId)
    .get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AccountingAccount))
    .filter(a => a.isActive !== false)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

async function loadPartners(storeId: string): Promise<VoucherAiPartner[]> {
  const snap = await adminDb.collection('suppliers')
    .where('storeId', '==', storeId)
    .limit(200)
    .get();
  return snap.docs.map(d => ({
    id: d.id,
    supplierName: String(d.data().supplierName || '').trim(),
  })).filter(p => p.supplierName);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    const message = String(body.message || '').trim();
    const context = (body.context || {}) as VoucherAiContext;
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accounting', storeId);

    if (!hasAnyAiProvider()) {
      return NextResponse.json({
        error: 'AI API 키가 설정되지 않았습니다. (GEMINI / ANTHROPIC / OPENAI / GROQ)',
      }, { status: 503 });
    }

    const [accounts, partners] = await Promise.all([
      loadAccounts(storeId),
      loadPartners(storeId),
    ]);

    const systemPrompt = buildVoucherAiSystemPrompt(accounts, partners, context);
    const historyText = history
      .map((h: { role?: string; content?: string }) =>
        `${h.role === 'assistant' ? 'AI' : '사용자'}: ${String(h.content || '').slice(0, 400)}`,
      )
      .join('\n');

    const userPrompt = [
      historyText ? `## 이전 대화\n${historyText}\n` : '',
      `## 사용자 요청\n${message}`,
    ].filter(Boolean).join('\n');

    const ai = await generateTextWithFallback({
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      json: true,
      useCase: 'insight',
      temperature: 0.2,
    });

    const parsed = parseVoucherAiResponse(
      stripJsonMarkdown(ai.text),
      accounts,
      partners,
      context,
    );

    let balanced = false;
    if (parsed.draft?.lines?.length) {
      let debit = 0;
      let credit = 0;
      for (const l of parsed.draft.lines) {
        debit += l.debit;
        credit += l.credit;
      }
      balanced = debit === credit && debit > 0;
    }

    return NextResponse.json({
      reply: parsed.reply,
      apply: parsed.apply,
      draft: parsed.draft,
      warnings: parsed.warnings,
      balanced,
      provider: ai.provider,
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
