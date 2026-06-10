import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { sanitizeGroupsForDraft } from '@/lib/purchaseInputDraftSanitize';
import type { InvoiceGroup } from '@/components/purchases/PurchaseSheet';

export async function loadPurchaseInputDraft(storeId: string): Promise<{
  groups: InvoiceGroup[];
  analysisHistoryId: string | null;
  updatedAt: string | null;
} | null> {
  if (!storeId) return null;
  try {
    const headers = await getAuthJsonHeaders();
    const res = await fetch(
      `/api/purchases/input-draft?storeId=${encodeURIComponent(storeId)}`,
      { headers },
    );
    const data = await res.json();
    if (!res.ok || !data.draft?.groups?.length) return null;
    return {
      groups: data.draft.groups as InvoiceGroup[],
      analysisHistoryId: data.draft.analysisHistoryId || null,
      updatedAt: data.draft.updatedAt || null,
    };
  } catch {
    return null;
  }
}

export async function savePurchaseInputDraft(
  storeId: string,
  groups: InvoiceGroup[],
  analysisHistoryId?: string | null,
): Promise<boolean> {
  if (!storeId) return false;
  try {
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/purchases/input-draft', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        storeId,
        groups: sanitizeGroupsForDraft(groups),
        analysisHistoryId: analysisHistoryId || null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearPurchaseInputDraft(storeId: string): Promise<void> {
  if (!storeId) return;
  try {
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/purchases/input-draft?storeId=${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers,
    });
  } catch {
    /* ignore */
  }
}
