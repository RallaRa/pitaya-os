import { createHash, randomBytes } from 'crypto';

export type PublicOrderSessionStatus = 'draft' | 'open' | 'closed';

export interface PublicOrderSession {
  id: string;
  storeId: string;
  title: string;
  description?: string;
  status: PublicOrderSessionStatus;
  publicToken: string;
  orderDeadline?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicOrderLine {
  id: string;
  sessionId: string;
  storeId: string;
  sortOrder: number;
  name: string;
  description: string;
  origin: string;
  photoUrl: string;
  normalPrice: number;
  discountPrice: number;
  /** 주문·재고 단위 (팩, kg, 마리 등) */
  unit: string;
  /** 가격 옆 표시 (예: 100g(1팩 200~300g)). 없으면 unit 사용 */
  priceUnitLabel?: string;
  totalQty: number;
  orderedQty: number;
  remainingQty: number;
  isActive: boolean;
}

export type PublicOrderEntryStatus = 'unconfirmed' | 'accepted' | 'ready' | 'completed';

export const PUBLIC_ORDER_ENTRY_STATUSES: PublicOrderEntryStatus[] = [
  'unconfirmed',
  'accepted',
  'ready',
  'completed',
];

export const PUBLIC_ORDER_ENTRY_STATUS_LABELS: Record<PublicOrderEntryStatus, string> = {
  unconfirmed: '미확인',
  accepted: '접수',
  ready: '준비완료',
  completed: '수령완료',
};

export interface PublicOrderEntryLine {
  lineId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string;
}

export interface PublicOrderEntry {
  id: string;
  sessionId: string;
  ordererName: string;
  ordererPhone: string;
  lines: PublicOrderEntryLine[];
  note?: string;
  status: PublicOrderEntryStatus;
  totalAmount: number;
  createdAt: string;
}

export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

export function makeOrdererKey(sessionId: string, name: string, phone: string): string {
  const phoneDigits = phone.replace(/\D/g, '');
  const normalized = `${sessionId}:${phoneDigits}:${name.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `${d.slice(0, 3)}****${d.slice(-4)}`;
}

/** 주문 알림용 — 예: 김 ** */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '**';
  return `${trimmed[0]} **`;
}

export function formatPublicOrderNotifyMessage(opts: {
  ordererName: string;
  ordererPhoneMasked?: string;
  lines: { name: string; qty: number; unit?: string }[];
}): string {
  const maskedName = maskName(opts.ordererName);
  const phone = opts.ordererPhoneMasked?.trim() || '';
  const itemsText = opts.lines
    .map(l => `${l.name} ${l.qty}${l.unit || ''}`)
    .join(', ');
  const head = phone ? `${maskedName} ${phone}` : maskedName;
  return `${head} ${itemsText} 주문되었습니다. 감사합니다.`;
}

export function parsePublicOrderEntryStatus(raw: unknown): PublicOrderEntryStatus {
  if (typeof raw === 'string' && PUBLIC_ORDER_ENTRY_STATUSES.includes(raw as PublicOrderEntryStatus)) {
    return raw as PublicOrderEntryStatus;
  }
  return 'unconfirmed';
}

export function linePriceUnitLabel(line: Pick<PublicOrderLine, 'priceUnitLabel' | 'unit'>): string {
  const label = String(line.priceUnitLabel || '').trim();
  return label || line.unit || 'ea';
}

export function serializeLine(id: string, data: Record<string, unknown>): PublicOrderLine {
  const totalQty = Number(data.totalQty) || 0;
  const orderedQty = Number(data.orderedQty) || 0;
  return {
    id,
    sessionId: String(data.sessionId || ''),
    storeId: String(data.storeId || ''),
    sortOrder: Number(data.sortOrder) || 0,
    name: String(data.name || ''),
    description: String(data.description || ''),
    origin: String(data.origin || ''),
    photoUrl: String(data.photoUrl || ''),
    normalPrice: Number(data.normalPrice) || 0,
    discountPrice: Number(data.discountPrice) || 0,
    unit: String(data.unit || 'ea'),
    priceUnitLabel: String(data.priceUnitLabel || '').trim(),
    totalQty,
    orderedQty,
    remainingQty: Math.max(0, totalQty - orderedQty),
    isActive: data.isActive !== false,
  };
}
