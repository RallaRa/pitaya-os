import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import type { ExecutableBriefingAction } from '@/lib/briefingActions';

export async function startBriefingActionLog(
  storeId: string,
  action: ExecutableBriefingAction,
): Promise<string | null> {
  try {
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/briefing/action-log', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId,
        actionType: action.actionType,
        text: action.text,
        basis: action.basis,
        params: action.params,
        briefingDateYmd: getKSTTodayYMD(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data.logId || null;
  } catch {
    return null;
  }
}

export async function completeBriefingActionLogClient(
  storeId: string,
  logId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  try {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/briefing/action-log', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ storeId, logId, result }),
    });
  } catch {
    /* ignore */
  }
}
