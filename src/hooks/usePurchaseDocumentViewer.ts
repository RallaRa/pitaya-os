'use client';

import { useState, useCallback, useRef } from 'react';
import {
  normalizeAttachments,
  type PurchaseAttachment,
} from '@/lib/purchaseAttachments';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

async function fetchRecordAttachments(
  storeId: string,
  purchaseRecordId: string,
): Promise<PurchaseAttachment[]> {
  const h = await getAuthHeaders();
  const p = new URLSearchParams({ storeId, id: purchaseRecordId });
  const res = await fetch(`/api/purchases?${p}`, { headers: h });
  const json = await res.json();
  if (!res.ok || !json.record) return [];
  return normalizeAttachments(json.record.purchaseAttachments, json.record.imageUrls);
}

/** 매입 원본 문서(이미지·PDF) 모달 — purchaseRecordId 또는 inline attachments */
export function usePurchaseDocumentViewer(storeId: string) {
  const [viewDocs, setViewDocs] = useState<PurchaseAttachment[] | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const cacheRef = useRef<Map<string, PurchaseAttachment[]>>(new Map());

  const openFromInline = useCallback((
    purchaseAttachments?: PurchaseAttachment[] | null,
    imageUrls?: string[] | null,
  ) => {
    const docs = normalizeAttachments(purchaseAttachments, imageUrls);
    if (docs.length) setViewDocs(docs);
  }, []);

  const openForRecord = useCallback(async (purchaseRecordId?: string) => {
    if (!storeId || !purchaseRecordId) return;
    const cached = cacheRef.current.get(purchaseRecordId);
    if (cached !== undefined) {
      if (cached.length) setViewDocs(cached);
      return;
    }
    setDocLoading(true);
    try {
      const docs = await fetchRecordAttachments(storeId, purchaseRecordId);
      cacheRef.current.set(purchaseRecordId, docs);
      if (docs.length) setViewDocs(docs);
    } catch { /* ignore */ } finally {
      setDocLoading(false);
    }
  }, [storeId]);

  const openForRecords = useCallback(async (purchaseRecordIds: string[]) => {
    const unique = [...new Set(purchaseRecordIds.filter(Boolean))];
    if (!storeId || !unique.length) return;

    setDocLoading(true);
    try {
      const merged: PurchaseAttachment[] = [];
      for (const id of unique) {
        let docs = cacheRef.current.get(id);
        if (docs === undefined) {
          docs = await fetchRecordAttachments(storeId, id);
          cacheRef.current.set(id, docs);
        }
        merged.push(...docs);
      }
      if (merged.length) setViewDocs(merged);
    } catch { /* ignore */ } finally {
      setDocLoading(false);
    }
  }, [storeId]);

  const closeViewer = useCallback(() => setViewDocs(null), []);

  return {
    viewDocs,
    docLoading,
    openFromInline,
    openForRecord,
    openForRecords,
    closeViewer,
  };
}

/** trace row id `{purchaseId}_{itemIndex}` 또는 purchaseId 필드 */
export function resolvePurchaseRecordId(
  purchaseId?: string,
  compositeId?: string,
): string | undefined {
  if (purchaseId) return purchaseId;
  const m = compositeId?.match(/^(.+)_\d+$/);
  return m?.[1];
}
