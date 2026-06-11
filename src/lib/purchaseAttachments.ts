/** 매입 등록 원본 문서 — Firebase Storage URL + 메타 (보관·조회용) */

import { normalizeStoragePublicUrl } from '@/lib/firebase/storageBucket';

export interface PurchaseAttachment {
  url: string;
  name: string;
  mimeType: string;
}

export function mimeFromFileType(type: string): string {
  if (type === 'pdf') return 'application/pdf';
  if (type === 'csv') return 'text/csv';
  if (type === 'excel') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'image/jpeg';
}

export function extFromMime(mimeType: string, fileName?: string): string {
  const lower = (fileName || '').toLowerCase();
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
  if (mimeType.includes('png') || lower.endsWith('.png')) return 'png';
  if (mimeType.includes('webp') || lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  return 'jpg';
}

export function isPdfAttachment(a: Pick<PurchaseAttachment, 'mimeType' | 'name'>): boolean {
  return (
    a.mimeType.includes('pdf')
    || a.name.toLowerCase().endsWith('.pdf')
  );
}

export function isImageAttachment(a: Pick<PurchaseAttachment, 'mimeType'>): boolean {
  return a.mimeType.startsWith('image/');
}

function withPublicUrls(list: PurchaseAttachment[]): PurchaseAttachment[] {
  return list.map(a => ({
    ...a,
    url: normalizeStoragePublicUrl(a.url) || a.url,
  }));
}

/** Firestore imageUrls만 있는 레거시 → attachments */
export function legacyUrlsToAttachments(urls: string[]): PurchaseAttachment[] {
  return urls.map((url, i) => ({
    url,
    name: `원본 ${i + 1}`,
    mimeType: 'image/jpeg',
  }));
}

export function normalizeAttachments(
  attachments?: PurchaseAttachment[] | null,
  imageUrls?: string[] | null,
): PurchaseAttachment[] {
  if (attachments?.length) return withPublicUrls(attachments);
  if (imageUrls?.length) return withPublicUrls(legacyUrlsToAttachments(imageUrls));
  return [];
}

/** AI 매입 시트 — 세션 로컬 파일 + 저장 후 Storage URL */
export interface GroupDocSource {
  attachedFiles?: Array<{ name: string; type: string; content: string; preview?: string }>;
  savedAttachments?: PurchaseAttachment[];
  savedImageUrls?: string[];
}

export function resolveGroupAttachments(group: GroupDocSource): PurchaseAttachment[] {
  if (group.savedAttachments?.length) return withPublicUrls(group.savedAttachments);
  if (group.savedImageUrls?.length) {
    return withPublicUrls(group.savedImageUrls.map((url, i) => ({
      url,
      name: group.attachedFiles?.[i]?.name || `원본 ${i + 1}`,
      mimeType: group.attachedFiles?.[i]?.type === 'pdf' ? 'application/pdf' : 'image/jpeg',
    })));
  }
  return (group.attachedFiles || [])
    .filter(f => f.type === 'image' || f.type === 'pdf')
    .map(f => ({
      url: f.preview || f.content,
      name: f.name,
      mimeType: mimeFromFileType(f.type),
    }));
}
