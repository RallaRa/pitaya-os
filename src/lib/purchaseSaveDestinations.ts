import type { PurchaseAttachment } from '@/lib/purchaseAttachments';
import type { CreateExpiryReminderResult } from '@/lib/expiryReminder/types';

export type PurchaseSaveDestinationKind =
  | 'purchase_record'
  | 'storage'
  | 'item_price'
  | 'expiry_reminder'
  | 'ocr_correction'
  | 'item_alias'
  | 'kakao_notify'
  | 'auto_voucher';

export interface PurchaseSaveDestinationItem {
  name: string;
  id?: string;
  href?: string;
  detail?: string;
}

export interface PurchaseSaveDestination {
  kind: PurchaseSaveDestinationKind;
  label: string;
  sublabel?: string;
  docId?: string;
  collection?: string;
  href?: string;
  count?: number;
  items?: PurchaseSaveDestinationItem[];
  detail?: Record<string, unknown>;
}

export interface ExpiryReminderSaveDetail {
  traceNo?: string;
  itemName?: string;
  expiryDate?: string;
  ok: boolean;
  reason?: string;
  result?: CreateExpiryReminderResult;
}

export function buildPurchaseSaveDestinations(opts: {
  purchaseRecordId: string;
  supplierName: string;
  totalAmount?: number;
  purchaseAttachments: PurchaseAttachment[];
  syncedItems: string[];
  storeId: string;
  expiryDetails?: ExpiryReminderSaveDetail[];
  autoVoucherId?: string;
}): PurchaseSaveDestination[] {
  const {
    purchaseRecordId,
    supplierName,
    totalAmount,
    purchaseAttachments,
    syncedItems,
    storeId,
    expiryDetails = [],
    autoVoucherId,
  } = opts;

  const destinations: PurchaseSaveDestination[] = [];

  destinations.push({
    kind: 'purchase_record',
    label: '매입 전표',
    sublabel: 'Firestore · purchase_records',
    docId: purchaseRecordId,
    collection: 'purchase_records',
    href: '/dashboard/report/purchases/ledger',
    detail: {
      supplierName,
      totalAmount: totalAmount ?? 0,
    },
  });

  if (autoVoucherId) {
    destinations.push({
      kind: 'auto_voucher',
      label: '자동전표처리',
      sublabel: '회계 · 승인대기',
      docId: autoVoucherId,
      collection: 'accounting_auto_vouchers',
      href: '/dashboard/accounting/voucher/auto-process',
      detail: { supplierName, totalAmount: totalAmount ?? 0 },
    });
  }

  if (purchaseAttachments.length > 0) {
    destinations.push({
      kind: 'storage',
      label: '원본 문서',
      sublabel: 'Firebase Storage · purchase_images',
      count: purchaseAttachments.length,
      items: purchaseAttachments.map((a, i) => ({
        name: a.name || `원본 ${i + 1}`,
        detail: a.mimeType,
      })),
      detail: { attachments: purchaseAttachments },
    });
  }

  if (syncedItems.length > 0) {
    destinations.push({
      kind: 'item_price',
      label: '품목 단가 이력',
      sublabel: 'Firestore · item_prices',
      count: syncedItems.length,
      items: syncedItems.map(name => ({
        name,
        href: `/dashboard/report/purchases/unit-price-detail?item=${encodeURIComponent(name)}`,
      })),
    });
  }

  const registered = expiryDetails.filter(d => d.ok && d.result);
  if (registered.length > 0) {
    destinations.push({
      kind: 'expiry_reminder',
      label: '유통기한 알림',
      sublabel: 'Firestore · expiry_reminders + Google Calendar',
      count: registered.length,
      items: registered.map(d => ({
        name: d.itemName || d.traceNo || '품목',
        id: d.result?.id,
        detail: d.expiryDate ? `유통기한 ${d.expiryDate}` : undefined,
      })),
      detail: { reminders: registered },
    });
  }

  destinations.push({
    kind: 'kakao_notify',
    label: '카카오 알림',
    sublabel: '매장·등록자 알림 발송',
    detail: { supplierName, totalAmount: totalAmount ?? 0 },
  });

  return destinations;
}

export function appendCorrectionSaveDestinations(
  base: PurchaseSaveDestination[],
  correction?: { id?: string; aliasesLearned?: number } | null,
): PurchaseSaveDestination[] {
  if (!correction?.id && !correction?.aliasesLearned) return base;

  const next = [...base];

  if (correction.id) {
    next.push({
      kind: 'ocr_correction',
      label: 'OCR 수정 학습',
      sublabel: 'Firestore · ocr_corrections',
      docId: correction.id,
      collection: 'ocr_corrections',
    });
  }

  if (correction.aliasesLearned && correction.aliasesLearned > 0) {
    next.push({
      kind: 'item_alias',
      label: '품목 별칭 학습',
      sublabel: 'Firestore · item_aliases',
      count: correction.aliasesLearned,
    });
  }

  return next;
}
