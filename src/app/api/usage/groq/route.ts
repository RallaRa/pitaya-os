import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const MONTHLY_TOKEN_LIMIT = 1_000_000; // 100만 토큰 / 월 기본값

export async function GET() {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ available: false, reason: 'API 키 미설정' });
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    const doc = await adminDb
      .collection('usage_logs')
      .doc('groq')
      .collection('monthly')
      .doc(monthKey)
      .get();

    if (!doc.exists) {
      return NextResponse.json({
        available:    true,
        inputTokens:  0,
        outputTokens: 0,
        totalTokens:  0,
        requestCount: 0,
        limit:        MONTHLY_TOKEN_LIMIT,
        month:        monthKey,
        source:       'firestore',
      });
    }

    const d = doc.data()!;
    return NextResponse.json({
      available:    true,
      inputTokens:  d.input_tokens  || 0,
      outputTokens: d.output_tokens || 0,
      totalTokens:  d.total_tokens  || 0,
      requestCount: d.request_count || 0,
      limit:        MONTHLY_TOKEN_LIMIT,
      month:        monthKey,
      source:       'firestore',
    });
  } catch (e: any) {
    return NextResponse.json({ available: false, reason: e.message });
  }
}
