import { maskPhone } from '@/lib/encryption';

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

export type PhoneSource = 'full' | 'masked_only' | 'empty';

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
