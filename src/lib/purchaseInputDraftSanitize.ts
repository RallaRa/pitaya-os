import type { AttachedFile, InvoiceGroup } from '@/components/purchases/PurchaseSheet';

const MAX_PREVIEW_CHARS = 48_000;

/** Firestore 용량 한도 — base64 본문은 제외하고 메타만 보관 */
export function sanitizeAttachedFileForDraft(file: AttachedFile): AttachedFile {
  const preview =
    file.preview && file.preview.length <= MAX_PREVIEW_CHARS ? file.preview : undefined;
  return {
    name: file.name,
    type: file.type,
    content: '',
    preview,
  };
}

export function sanitizeInvoiceGroupForDraft(group: InvoiceGroup): InvoiceGroup {
  const { attachedFiles, savedImageUrls, savedAttachments, ...rest } = group;
  return {
    ...rest,
    attachedFiles: attachedFiles?.map(sanitizeAttachedFileForDraft),
    savedAttachments: savedAttachments?.length ? savedAttachments : undefined,
    savedImageUrls: savedImageUrls?.length ? savedImageUrls : undefined,
  };
}

export function sanitizeGroupsForDraft(groups: InvoiceGroup[]): InvoiceGroup[] {
  return groups
    .filter(g => !g.isSaved)
    .slice(0, 30)
    .map(sanitizeInvoiceGroupForDraft);
}
