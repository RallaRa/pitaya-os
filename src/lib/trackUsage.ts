import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

type Provider = 'gemini' | 'claude' | 'gpt' | 'groq';

export async function trackUsage(provider: Provider, tokens = 0) {
  const now = new Date();
  const monthKey = `month_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dayKey   = `day_${now.toISOString().split('T')[0]}`;

  const increment: Record<string, any> = {
    [`${monthKey}.${provider}_requests`]: FieldValue.increment(1),
    [`${dayKey}.${provider}_requests`]:   FieldValue.increment(1),
  };

  if (tokens > 0) {
    increment[`${monthKey}.${provider}_tokens`] = FieldValue.increment(tokens);
    increment[`${dayKey}.${provider}_tokens`]   = FieldValue.increment(tokens);
  }

  await adminDb.collection('usage_stats').doc('global').set(increment, { merge: true }).catch(() => {});
}

export async function trackFirestore(reads = 0, writes = 0) {
  const dayKey = `day_${new Date().toISOString().split('T')[0]}`;
  await adminDb.collection('usage_stats').doc('global').set({
    [`${dayKey}.fs_reads`]:  FieldValue.increment(reads),
    [`${dayKey}.fs_writes`]: FieldValue.increment(writes),
  }, { merge: true }).catch(() => {});
}
