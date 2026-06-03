import { decrypt, encrypt, maskPhone } from '@/lib/encryption';
import { decryptEnUKey2 } from '@/lib/posUKeyDecrypt';

/** POS/DB에 이미 마스킹된 값인지 (010-****-1234, 01033**8262 등) */
export function isMaskedPhone(phone?: string | null): boolean {
  if (!phone) return true;
  const s = String(phone).trim();
  if (!s) return true;
  return s.includes('*') || /x{2,}/i.test(s);
}

/** 여러 후보 중 원본(비마스킹) 전화번호 우선 — Cus_Mst(Cus_HP) 우선 */
export function pickBestPhone(...candidates: (string | null | undefined)[]): string {
  const list = candidates.map(c => String(c || '').trim()).filter(Boolean);
  const full = list.find(p => !isMaskedPhone(p));
  return full || list[0] || '';
}

/** DB에서 받은 원본 → 숫자만 (01012345678). 마스킹/짧은 값은 빈 문자열 */
export function normalizePhoneDigits(phone?: string | null): string {
  if (!phone || isMaskedPhone(phone)) return '';
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('1')) return `0${d}`;
  if (d.length >= 9 && d.length <= 11 && (d.startsWith('01') || d.startsWith('02') || d.startsWith('0'))) {
    return d;
  }
  return '';
}

/** 마스킹/원본 전화번호 → 매칭 키 (앞5자리_뒤4자리). POS 01033**8262 ↔ 01033018262 */
export function phoneMatchKey(phone?: string | null): string | null {
  if (!phone) return null;
  const s = String(phone).trim();
  if (!s) return null;

  const digits = s.replace(/\D/g, '');
  if (digits.length === 11 && !isMaskedPhone(s)) {
    return `${digits.slice(0, 5)}_${digits.slice(-4)}`;
  }

  const compact = s.replace(/-/g, '');
  const posMask = compact.match(/^(\d{5})\*+(\d{4})$/);
  if (posMask) return `${posMask[1]}_${posMask[2]}`;

  if (isMaskedPhone(s)) {
    const parts = s.split(/[\*xX]+/i).map(p => p.replace(/\D/g, '')).filter(Boolean);
    if (parts.length >= 2) {
      const head = parts[0];
      const tail = parts[parts.length - 1];
      if (head.length >= 5 && tail.length >= 4) {
        return `${head.slice(0, 5)}_${tail.slice(-4)}`;
      }
    }
  }

  return null;
}

export function phoneForDisplay(fullOrMasked: string): string {
  if (!fullOrMasked) return '';
  if (isMaskedPhone(fullOrMasked)) return fullOrMasked;
  return maskPhone(fullOrMasked);
}

export type PhoneSource = 'full' | 'masked_only' | 'empty' | 'needs_reconcile';

/** sync-customers 전화 병합 결과 */
export type PhoneSyncOutcome =
  | 'full'
  | 'masked_only'
  | 'empty'
  | 'protected'
  | 'full_from_ukey2'
  | 'needs_reconcile';

export function getStoredPhoneDigitsFromDoc(data: Record<string, unknown>): string {
  if (!data.phoneEncrypted) return '';
  try {
    return normalizePhoneDigits(decrypt(String(data.phoneEncrypted)));
  } catch {
    return '';
  }
}

function applyFullPhoneToDoc(doc: Record<string, unknown>, digits: string, source: 'full' | 'full_from_ukey2') {
  doc.phoneSource = 'full';
  doc.phoneEncrypted = encrypt(digits);
  doc.phoneMasked = maskPhone(digits);
  doc.phoneDigitsLen = digits.length;
  doc.phonePiiIncomplete = false;
  doc.phoneNeedsReconcile = false;
  doc.phonePosMismatch = false;
  return source;
}

/**
 * POS sync 시 전화 병합 (변경 반영 우선).
 * 1) Cus_HP / phoneFull 등 원번호
 * 2) en_uKey2 복호화 (키 설정 시)
 * 3) 마스킹 키 동일 → 기존 full 유지
 * 4) 마스킹 키 다름 + 새 번호 확보 실패 → needs_reconcile (수동·키 필요)
 */
export function mergePhoneSyncToDoc(
  doc: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  syncedAt: string,
  enUKey2?: string | null,
  ...candidates: (string | null | undefined)[]
): PhoneSyncOutcome {
  const ukeyDigits = normalizePhoneDigits(decryptEnUKey2(enUKey2) || '');
  const incoming = buildPhonePiiFields(ukeyDigits || undefined, ...candidates);

  if (incoming.phoneSource === 'full') {
    const src = ukeyDigits && incoming.phoneDigits === ukeyDigits ? 'full_from_ukey2' : 'full';
    return applyFullPhoneToDoc(doc, incoming.phoneDigits, src);
  }

  if (incoming.phoneSource === 'empty') {
    if (!existing?.phoneEncrypted) {
      doc.phoneSource = 'empty';
      doc.phonePiiIncomplete = true;
    }
    return 'empty';
  }

  const posMaskKey = phoneMatchKey(incoming.phoneMasked);
  const storedDigits = existing ? getStoredPhoneDigitsFromDoc(existing) : '';
  const storedKey = storedDigits
    ? phoneMatchKey(storedDigits)
    : phoneMatchKey(String(existing?.phoneMasked || ''));

  if (storedDigits && posMaskKey && storedKey === posMaskKey) {
    doc.phoneMasked = incoming.phoneMasked;
    doc.phoneNeedsReconcile = false;
    doc.phonePosMismatch = false;
    return 'protected';
  }

  if (posMaskKey && storedKey && storedKey !== posMaskKey) {
    if (ukeyDigits && phoneMatchKey(ukeyDigits) === posMaskKey) {
      return applyFullPhoneToDoc(doc, ukeyDigits, 'full_from_ukey2');
    }

    doc.phoneMasked = incoming.phoneMasked;
    doc.phoneSource = 'needs_reconcile';
    doc.phonePiiIncomplete = true;
    doc.phoneNeedsReconcile = true;
    doc.phonePosMismatch = true;
    doc.phonePosMismatchAt = syncedAt;
    return 'needs_reconcile';
  }

  doc.phoneSource = 'masked_only';
  doc.phoneMasked = incoming.phoneMasked;
  doc.phonePiiIncomplete = true;
  doc.phoneNeedsReconcile = false;
  doc.phonePosMismatch = false;
  return 'masked_only';
}

export interface PhonePiiFields {
  phoneDigits: string;
  phoneMasked: string;
  phoneSource: PhoneSource;
}

/** 동기화 시 Firestore 전화 PII — 원본 숫자만 phoneEncrypted 대상 */
export function buildPhonePiiFields(
  ...candidates: (string | null | undefined)[]
): PhonePiiFields {
  const best = pickBestPhone(...candidates);
  const digits = normalizePhoneDigits(best);

  if (digits) {
    return {
      phoneDigits: digits,
      phoneMasked: maskPhone(digits),
      phoneSource: 'full',
    };
  }
  if (best) {
    return {
      phoneDigits: '',
      phoneMasked: best,
      phoneSource: 'masked_only',
    };
  }
  return { phoneDigits: '', phoneMasked: '', phoneSource: 'empty' };
}
