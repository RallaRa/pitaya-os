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

/** 품목명 비교용 정규화 */
export function normalizePublicOrderLineName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+＋]/g, '+')
    .replace(/[^\p{L}\p{N}+]/gu, '');
}

const LINE_ANIMAL_MARKERS = ['한우', '한돈', '수입', '호주', '미국', '돼지', '소'] as const;

function extractLineAnimalMarker(name: string): string | null {
  for (const marker of LINE_ANIMAL_MARKERS) {
    if (name.includes(marker)) return marker;
  }
  return null;
}

/** 0~100, 높을수록 동일·유사 품목 */
export function scorePublicOrderLineNameMatch(a: string, b: string): number {
  const na = normalizePublicOrderLineName(a);
  const nb = normalizePublicOrderLineName(b);
  if (!na || !nb) return 0;

  const animalA = extractLineAnimalMarker(a);
  const animalB = extractLineAnimalMarker(b);
  if (animalA && animalB && animalA !== animalB) return 0;

  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return 70 + Math.round(ratio * 25);
  }

  let bestShared = 0;
  for (let len = Math.min(na.length, nb.length); len >= 2; len--) {
    for (let i = 0; i <= na.length - len; i++) {
      const sub = na.slice(i, i + len);
      if (nb.includes(sub)) {
        bestShared = Math.max(bestShared, len);
        break;
      }
    }
    if (bestShared >= 2) break;
  }
  if (bestShared >= 2) {
    return 50 + Math.min(35, bestShared * 6);
  }
  return 0;
}

export interface PublicOrderLineMatchCandidate {
  id: string;
  name: string;
  photoUrl?: string;
}

export function findBestMatchingPublicOrderLine(
  name: string,
  candidates: PublicOrderLineMatchCandidate[],
  opts?: { preferWithoutPhoto?: boolean; minScore?: number },
): { id: string; name: string; score: number } | null {
  const minScore = opts?.minScore ?? 55;
  let best: { id: string; name: string; score: number } | null = null;

  for (const candidate of candidates) {
    let score = scorePublicOrderLineNameMatch(name, candidate.name);
    if (opts?.preferWithoutPhoto && !candidate.photoUrl && score >= minScore - 15) {
      score += 12;
    }
    if (score >= minScore && (!best || score > best.score)) {
      best = { id: candidate.id, name: candidate.name, score };
    }
  }
  return best;
}

export function isPhotoPrimaryLineInput(input: {
  photoUrl?: string;
  normalPrice?: number;
  discountPrice?: number;
  description?: string;
  origin?: string;
}): boolean {
  const hasPhoto = Boolean(String(input.photoUrl || '').trim());
  const hasPrice = (Number(input.normalPrice) || 0) > 0 || (Number(input.discountPrice) || 0) > 0;
  const hasText = Boolean(String(input.description || '').trim() || String(input.origin || '').trim());
  return hasPhoto && !hasPrice && !hasText;
}

/** 사용자가 신규 품목 추가를 명시했는지 */
export function wantsExplicitNewPublicOrderLine(message: string): boolean {
  const m = String(message || '').replace(/\s+/g, '');
  if (!m) return false;
  const patterns = [
    /새품목/,
    /새로추가/,
    /새로등록/,
    /새로넣/,
    /신규품목/,
    /신규로/,
    /신규추가/,
    /신규등록/,
    /별도품목/,
    /다른품목/,
    /품목새로/,
    /품목추가해/,
    /새항목/,
    /따로추가/,
    /따로등록/,
  ];
  return patterns.some(p => p.test(m));
}

export interface FindExistingLineMatchOpts {
  allowNewLines?: boolean;
  hasExistingLines?: boolean;
  photoPrimary?: boolean;
}

/** 기존 품목 매칭 — allowNewLines=false면 임계값을 낮춰 기존 품목 우선 */
export function findExistingLineMatch(
  name: string,
  candidates: PublicOrderLineMatchCandidate[],
  opts: FindExistingLineMatchOpts = {},
): { id: string; name: string; score: number } | null {
  const allowNew = opts.allowNewLines ?? false;
  const hasExisting = opts.hasExistingLines ?? candidates.length > 0;
  const photoPrimary = opts.photoPrimary ?? false;

  const minScore = allowNew
    ? (photoPrimary ? 48 : 72)
    : (photoPrimary ? 35 : 48);

  const match = findBestMatchingPublicOrderLine(name, candidates, {
    preferWithoutPhoto: photoPrimary,
    minScore,
  });
  if (match) return match;

  if (!allowNew && hasExisting) {
    const scored = candidates
      .map(c => ({
        id: c.id,
        name: c.name,
        score: scorePublicOrderLineNameMatch(name, c.name)
          + (photoPrimary && !c.photoUrl ? 12 : 0),
      }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const floor = photoPrimary ? 26 : 38;
    if (best && best.score >= floor) return best;
  }

  return null;
}
