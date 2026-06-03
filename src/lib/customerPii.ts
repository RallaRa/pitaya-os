import { adminDb } from '@/lib/firebase/admin';
import { decrypt } from '@/lib/encryption';
import { isMaskedPhone, normalizePhoneDigits } from '@/lib/phonePii';

export interface CustomerPii {
  name: string;
  phone: string;
  birth: string;
  phoneIncomplete?: boolean;
  phoneNeedsReconcile?: boolean;
}

export function decryptCustomerFields(data: Record<string, unknown>): CustomerPii {
  let name = '';
  let phone = '';
  let birth = '';
  try {
    name = data.nameEncrypted ? decrypt(String(data.nameEncrypted)) : String(data.name || '');
  } catch {
    name = '(복호화 실패)';
  }

  if (data.phoneNeedsReconcile) {
    return {
      name,
      phone: '',
      birth: '',
      phoneIncomplete: true,
      phoneNeedsReconcile: true,
    };
  }

  try {
    phone = data.phoneEncrypted
      ? decrypt(String(data.phoneEncrypted))
      : String(data.phoneMasked || data.mobile || '');
  } catch {
    phone = '(복호화 실패)';
  }
  try {
    birth = data.birthEncrypted ? decrypt(String(data.birthEncrypted)) : '';
  } catch {
    birth = '(복호화 실패)';
  }

  if (phone && !isMaskedPhone(phone)) {
    const digits = normalizePhoneDigits(phone);
    if (digits) phone = digits;
  }

  const phoneIncomplete = !!data.phonePiiIncomplete || isMaskedPhone(phone);
  return { name, phone, birth, phoneIncomplete };
}

export async function fetchCustomerPiiBulk(
  storeId: string,
  cusCodes: string[],
): Promise<Map<string, CustomerPii>> {
  const out = new Map<string, CustomerPii>();
  const CHUNK = 100;
  for (let i = 0; i < cusCodes.length; i += CHUNK) {
    const chunk = cusCodes.slice(i, i + CHUNK);
    const refs = chunk.map(code => adminDb.collection('pos_customers').doc(`${storeId}_${code}`));
    const snaps = await adminDb.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const code = String(snap.data()?.cusCode || snap.id.split('_').slice(1).join('_'));
      out.set(code, decryptCustomerFields(snap.data()!));
    }
  }
  return out;
}

/** 전화번호 정규화 — DHN API는 010-1234-5678 형식 지원 */
export function normalizePhoneForMessaging(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('1')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('01')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length >= 9 && digits.length <= 11) return digits;
  return null;
}
