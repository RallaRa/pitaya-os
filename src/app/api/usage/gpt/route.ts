import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

const MONTHLY_BUDGET_USD = 10; // 월 예산 $10 기본값
// GPT-4o 토큰 비용: input $2.50/1M, output $10/1M
const INPUT_COST_PER_TOKEN  = 2.50  / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 10.00 / 1_000_000;

async function fetchOpenAIBillingUsage(startDate: string, endDate: string): Promise<number | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const url = `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // total_usage는 센트(cents) 단위
    return typeof data.total_usage === 'number' ? data.total_usage / 100 : null;
  } catch {
    return null;
  }
}

async function getFirestoreUsage(monthKey: string) {
  try {
    const doc = await adminDb
      .collection('usage_logs')
      .doc('gpt')
      .collection('monthly')
      .doc(monthKey)
      .get();

    if (!doc.exists) return null;
    const d = doc.data()!;
    const inputTokens  = d.input_tokens  || 0;
    const outputTokens = d.output_tokens || 0;
    const costUsd = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
    return {
      inputTokens,
      outputTokens,
      totalTokens:  d.total_tokens  || 0,
      requestCount: d.request_count || 0,
      costUsd:      Math.round(costUsd * 10000) / 10000,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ available: false, reason: 'API 키 미설정' });
  }

  const now = new Date();
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = `${monthKey}-01`;
  const endDate   = now.toISOString().split('T')[0];

  // 1차: OpenAI Billing API 실조회
  const billingCost = await fetchOpenAIBillingUsage(startDate, endDate);

  // 2차: Firestore 누적 데이터 (토큰 기반 비용 추정)
  const fsUsage = await getFirestoreUsage(monthKey);

  if (billingCost !== null) {
    return NextResponse.json({
      available:    true,
      costUsd:      billingCost,
      budgetUsd:    MONTHLY_BUDGET_USD,
      requestCount: fsUsage?.requestCount || 0,
      inputTokens:  fsUsage?.inputTokens  || 0,
      outputTokens: fsUsage?.outputTokens || 0,
      month:        monthKey,
      source:       'openai_billing',
    });
  }

  if (fsUsage) {
    return NextResponse.json({
      available:    true,
      costUsd:      fsUsage.costUsd,
      budgetUsd:    MONTHLY_BUDGET_USD,
      requestCount: fsUsage.requestCount,
      inputTokens:  fsUsage.inputTokens,
      outputTokens: fsUsage.outputTokens,
      month:        monthKey,
      source:       'firestore_estimate',
    });
  }

  return NextResponse.json({
    available:    true,
    costUsd:      0,
    budgetUsd:    MONTHLY_BUDGET_USD,
    requestCount: 0,
    inputTokens:  0,
    outputTokens: 0,
    month:        monthKey,
    source:       'no_data',
  });
}
