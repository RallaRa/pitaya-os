import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

type Provider = 'gemini' | 'claude' | 'gpt' | 'groq';

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const dayKey = () => new Date().toISOString().split('T')[0];

/* ── 상세 토큰 추적 (서브컬렉션) ── */
export async function trackTokens(
  provider: Provider,
  inputTokens: number,
  outputTokens: number,
) {
  const mk = monthKey();
  const total = inputTokens + outputTokens;
  try {
    await adminDb
      .collection('usage_logs')
      .doc(provider)
      .collection('monthly')
      .doc(mk)
      .set(
        {
          input_tokens:  FieldValue.increment(inputTokens),
          output_tokens: FieldValue.increment(outputTokens),
          total_tokens:  FieldValue.increment(total),
          request_count: FieldValue.increment(1),
          updatedAt:     FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch { /* silent */ }
}

/* ── 간단 요청 추적 (gemini 등 토큰 미반환) ── */
export async function trackUsage(provider: Provider, estimatedTokens = 0) {
  const mk = monthKey();
  const dk = dayKey();

  const inc: Record<string, any> = {
    [`month_${mk}.${provider}_requests`]: FieldValue.increment(1),
    [`day_${dk}.${provider}_requests`]:   FieldValue.increment(1),
  };
  if (estimatedTokens > 0) {
    inc[`month_${mk}.${provider}_tokens`] = FieldValue.increment(estimatedTokens);
    inc[`day_${dk}.${provider}_tokens`]   = FieldValue.increment(estimatedTokens);
  }

  await adminDb.collection('usage_stats').doc('global').set(inc, { merge: true }).catch(() => {});
}

/* ── Firestore 읽기/쓰기 추적 ── */
export async function trackFirestore(reads = 0, writes = 0) {
  const dk = dayKey();
  await adminDb.collection('usage_stats').doc('global').set({
    [`day_${dk}.fs_reads`]:  FieldValue.increment(reads),
    [`day_${dk}.fs_writes`]: FieldValue.increment(writes),
  }, { merge: true }).catch(() => {});
}
