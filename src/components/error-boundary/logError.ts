import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { PitayaErrorLog } from './types';

export async function logErrorToFirestore(payload: Omit<PitayaErrorLog, 'createdAt'>): Promise<void> {
  try {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/error-logs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        page: payload.page || (typeof window !== 'undefined' ? window.location.pathname : ''),
      }),
    });
  } catch {
    /* 로깅 실패는 UI 흐름을 막지 않음 */
  }
}
