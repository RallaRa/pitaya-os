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
  unit: string;
  totalQty: number;
  orderedQty: number;
  remainingQty: number;
  isActive: boolean;
}

export interface PublicOrderEntryLine {
  lineId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface PublicOrderEntry {
  id: string;
  sessionId: string;
  ordererName: string;
  ordererPhone: string;
  lines: PublicOrderEntryLine[];
  note?: string;
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
    totalQty,
    orderedQty,
    remainingQty: Math.max(0, totalQty - orderedQty),
    isActive: data.isActive !== false,
  };
}
