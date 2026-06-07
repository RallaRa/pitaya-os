import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encrypt, decrypt, maskPhone } from '@/lib/encryption';
import { normalizePhoneDigits, phoneMatchKey, getStoredPhoneDigitsFromDoc } from '@/lib/phonePii';

export type PublicOrderMatchStatus = 'matched' | 'partial' | 'unmatched' | 'ambiguous';
export type GenderValue = 'male' | 'female' | 'unknown';

export interface PublicOrderIdentityInput {
  storeId: string;
  sessionId: string;
  publicToken: string;
  phone: string;
  gender?: GenderValue | string;
  ageRange?: string;
  birthYear?: number | null;
  kakaoId?: string;
  source?: 'kakao' | 'manual';
}

export interface MatchCustomerResult {
  status: PublicOrderMatchStatus;
  cusCode?: string;
  cusCodes?: string[];
  reason?: string;
}

export interface PublicOrderIdentityRecord {
  id: string;
  storeId: string;
  sessionId: string;
  publicToken: string;
  phoneMatchKey: string;
  phoneMasked: string;
  gender: GenderValue;
  ageRange: string;
  birthYear: number | null;
  kakaoId: string;
  source: 'kakao' | 'manual';
  matchStatus: PublicOrderMatchStatus;
  matchedCusCode: string | null;
  suggestedCusCodes: string[];
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string | null;
}

const COLLECTION = 'public_order_identities';

export function normalizeGender(raw?: string | null): GenderValue {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === '남' || s === '남성') return 'male';
  if (s === 'female' || s === 'f' || s === '여' || s === '여성') return 'female';
  return 'unknown';
}

export function normalizeAgeRange(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const map: Record<string, string> = {
    '15~19': '10대',
    '20~29': '20대',
    '30~39': '30대',
    '40~49': '40대',
    '50~59': '50대',
    '60~69': '60대',
    '70~79': '70대',
    '80~89': '80대',
  };
  return map[s] || s;
}

export async function matchCustomerByPhone(
  storeId: string,
  phoneDigits: string,
): Promise<MatchCustomerResult> {
  const key = phoneMatchKey(phoneDigits);
  if (!key) return { status: 'unmatched', reason: 'invalid_phone' };

  const snap = await adminDb.collection('pos_customers')
    .where('storeId', '==', storeId)
    .get();

  const fullMatches: string[] = [];
  const maskMatches: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const storedDigits = getStoredPhoneDigitsFromDoc(data as Record<string, unknown>);
    const storedKey = storedDigits
      ? phoneMatchKey(storedDigits)
      : phoneMatchKey(String(data.phoneMasked || ''));

    if (storedKey !== key) continue;

    if (storedDigits && phoneMatchKey(storedDigits) === key) {
      fullMatches.push(String(data.cusCode || ''));
    } else {
      maskMatches.push(String(data.cusCode || ''));
    }
  }

  if (fullMatches.length === 1) {
    return { status: 'matched', cusCode: fullMatches[0] };
  }
  if (fullMatches.length > 1) {
    return { status: 'ambiguous', cusCodes: fullMatches };
  }
  if (maskMatches.length === 1) {
    return { status: 'partial', cusCode: maskMatches[0] };
  }
  if (maskMatches.length > 1) {
    return { status: 'ambiguous', cusCodes: maskMatches };
  }
  return { status: 'unmatched' };
}

export interface PhoneMatchIndex {
  fullByKey: Map<string, string[]>;
  maskByKey: Map<string, string[]>;
}

export function buildPhoneMatchIndex(
  customers: { cusCode: string; data: Record<string, unknown> }[],
): PhoneMatchIndex {
  const fullByKey = new Map<string, string[]>();
  const maskByKey = new Map<string, string[]>();

  function push(map: Map<string, string[]>, key: string, cusCode: string) {
    const list = map.get(key) || [];
    if (!list.includes(cusCode)) list.push(cusCode);
    map.set(key, list);
  }

  for (const { cusCode, data } of customers) {
    const storedDigits = getStoredPhoneDigitsFromDoc(data);
    const storedKey = storedDigits
      ? phoneMatchKey(storedDigits)
      : phoneMatchKey(String(data.phoneMasked || ''));
    if (!storedKey) continue;

    if (storedDigits && phoneMatchKey(storedDigits) === storedKey) {
      push(fullByKey, storedKey, cusCode);
    } else {
      push(maskByKey, storedKey, cusCode);
    }
  }

  return { fullByKey, maskByKey };
}

export function matchCustomerFromIndex(
  index: PhoneMatchIndex,
  phoneDigits: string,
): MatchCustomerResult {
  const key = phoneMatchKey(phoneDigits);
  if (!key) return { status: 'unmatched', reason: 'invalid_phone' };

  const fullMatches = index.fullByKey.get(key) || [];
  const maskMatches = index.maskByKey.get(key) || [];

  if (fullMatches.length === 1) {
    return { status: 'matched', cusCode: fullMatches[0] };
  }
  if (fullMatches.length > 1) {
    return { status: 'ambiguous', cusCodes: fullMatches };
  }
  if (maskMatches.length === 1) {
    return { status: 'partial', cusCode: maskMatches[0] };
  }
  if (maskMatches.length > 1) {
    return { status: 'ambiguous', cusCodes: maskMatches };
  }
  return { status: 'unmatched' };
}

export function matchPatchFromResult(match: MatchCustomerResult): Record<string, unknown> {
  const matchedCusCode =
    match.status === 'matched' ? (match.cusCode || null) : null;
  const suggestedCusCodes =
    match.status === 'ambiguous'
      ? (match.cusCodes || [])
      : match.status === 'partial' && match.cusCode
        ? [match.cusCode]
        : [];

  return {
    matchStatus: match.status,
    matchedCusCode,
    suggestedCusCodes,
    resolved: match.status === 'matched',
    resolvedAt: match.status === 'matched' ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export interface RematchResult {
  scanned: number;
  updated: number;
  matched: number;
  partial: number;
  ambiguous: number;
  unmatched: number;
}

export async function rematchIdentitiesByPhoneMatchKey(
  storeId: string,
  phoneDigits: string,
): Promise<RematchResult> {
  const key = phoneMatchKey(phoneDigits);
  if (!key) {
    return { scanned: 0, updated: 0, matched: 0, partial: 0, ambiguous: 0, unmatched: 0 };
  }

  const match = await matchCustomerByPhone(storeId, phoneDigits);
  const snap = await adminDb.collection(COLLECTION)
    .where('storeId', '==', storeId)
    .where('phoneMatchKey', '==', key)
    .get();

  const result: RematchResult = {
    scanned: snap.size,
    updated: 0,
    matched: 0,
    partial: 0,
    ambiguous: 0,
    unmatched: 0,
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.resolved === true && data.matchStatus === 'matched') continue;

    await doc.ref.update(matchPatchFromResult(match));
    result.updated += 1;
    result[match.status] += 1;

    if (match.status === 'matched' && match.cusCode) {
      await applyDemographicsToCustomer(storeId, match.cusCode, {
        gender: normalizeGender(String(data.gender || '')),
        ageRange: String(data.ageRange || ''),
        birthYear: data.birthYear != null ? Number(data.birthYear) : null,
      });
    }
  }

  return result;
}

export async function rematchAllUnresolvedIdentities(
  storeId: string,
  opts: { includeResolved?: boolean } = {},
): Promise<RematchResult> {
  const customerSnap = await adminDb.collection('pos_customers')
    .where('storeId', '==', storeId)
    .get();
  const index = buildPhoneMatchIndex(
    customerSnap.docs.map(doc => ({
      cusCode: String(doc.data().cusCode || doc.id.split('_').slice(1).join('_')),
      data: doc.data() as Record<string, unknown>,
    })),
  );

  let query = adminDb.collection(COLLECTION).where('storeId', '==', storeId);
  if (!opts.includeResolved) {
    query = query.where('resolved', '==', false);
  }
  const identitySnap = await query.get();

  const result: RematchResult = {
    scanned: identitySnap.size,
    updated: 0,
    matched: 0,
    partial: 0,
    ambiguous: 0,
    unmatched: 0,
  };

  for (const doc of identitySnap.docs) {
    const data = doc.data();
    if (!opts.includeResolved && data.resolved === true && data.matchStatus === 'matched') {
      continue;
    }

    const phoneDigits = getIdentityPhoneDigits(data as Record<string, unknown>);
    if (!phoneDigits) continue;

    const match = matchCustomerFromIndex(index, phoneDigits);
    const prevStatus = String(data.matchStatus || '');
    const prevCus = data.matchedCusCode ? String(data.matchedCusCode) : '';
    const nextCus = match.status === 'matched' ? String(match.cusCode || '') : '';

    if (prevStatus === match.status && prevCus === nextCus) continue;

    await doc.ref.update(matchPatchFromResult(match));
    result.updated += 1;
    result[match.status] += 1;

    if (match.status === 'matched' && match.cusCode) {
      await applyDemographicsToCustomer(storeId, match.cusCode, {
        gender: normalizeGender(String(data.gender || '')),
        ageRange: String(data.ageRange || ''),
        birthYear: data.birthYear != null ? Number(data.birthYear) : null,
      });
    }
  }

  return result;
}

export async function applyDemographicsToCustomer(
  storeId: string,
  cusCode: string,
  opts: { gender?: GenderValue; ageRange?: string; birthYear?: number | null },
): Promise<void> {
  const docId = `${storeId}_${cusCode}`;
  const ref = adminDb.collection('pos_customers').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  const patch: Record<string, unknown> = {
    profileUpdatedFrom: 'public_order',
    profileUpdatedAt: FieldValue.serverTimestamp(),
  };

  if (opts.gender && opts.gender !== 'unknown' && !data.gender) {
    patch.gender = opts.gender;
  }
  if (opts.ageRange && !data.ageRange) {
    patch.ageRange = opts.ageRange;
  }
  if (opts.birthYear && !data.birthYear) {
    patch.birthYear = opts.birthYear;
  }

  if (Object.keys(patch).length > 2) {
    await ref.set(patch, { merge: true });
  }
}

export async function createPublicOrderIdentity(
  input: PublicOrderIdentityInput,
): Promise<{ id: string; match: MatchCustomerResult }> {
  const phoneDigits = normalizePhoneDigits(input.phone);
  if (!phoneDigits) throw new Error('올바른 전화번호를 입력해 주세요');

  const match = await matchCustomerByPhone(input.storeId, phoneDigits);
  const gender = normalizeGender(input.gender);
  const ageRange = normalizeAgeRange(input.ageRange);
  const key = phoneMatchKey(phoneDigits)!;

  const matchStatus = match.status;
  const matchedCusCode =
    match.status === 'matched' ? (match.cusCode || null) : null;
  const suggestedCusCodes =
    match.status === 'ambiguous'
      ? (match.cusCodes || [])
      : match.status === 'partial' && match.cusCode
        ? [match.cusCode]
        : [];

  const ref = await adminDb.collection(COLLECTION).add({
    storeId: input.storeId,
    sessionId: input.sessionId,
    publicToken: input.publicToken,
    phoneEncrypted: encrypt(phoneDigits),
    phoneMasked: maskPhone(phoneDigits),
    phoneMatchKey: key,
    gender,
    ageRange,
    birthYear: input.birthYear ?? null,
    kakaoId: input.kakaoId || '',
    source: input.source || 'manual',
    matchStatus,
    matchedCusCode,
    suggestedCusCodes,
    resolved: matchStatus === 'matched',
    resolvedAt: matchStatus === 'matched' ? FieldValue.serverTimestamp() : null,
    resolvedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (match.status === 'matched' && match.cusCode) {
    await applyDemographicsToCustomer(input.storeId, match.cusCode, {
      gender,
      ageRange,
      birthYear: input.birthYear,
    });
  }

  return { id: ref.id, match };
}

export function serializeIdentity(id: string, data: Record<string, unknown>): PublicOrderIdentityRecord {
  return {
    id,
    storeId: String(data.storeId || ''),
    sessionId: String(data.sessionId || ''),
    publicToken: String(data.publicToken || ''),
    phoneMatchKey: String(data.phoneMatchKey || ''),
    phoneMasked: String(data.phoneMasked || ''),
    gender: normalizeGender(String(data.gender || '')),
    ageRange: String(data.ageRange || ''),
    birthYear: data.birthYear != null ? Number(data.birthYear) : null,
    kakaoId: String(data.kakaoId || ''),
    source: (data.source === 'kakao' ? 'kakao' : 'manual') as 'kakao' | 'manual',
    matchStatus: (data.matchStatus as PublicOrderMatchStatus) || 'unmatched',
    matchedCusCode: data.matchedCusCode ? String(data.matchedCusCode) : null,
    suggestedCusCodes: Array.isArray(data.suggestedCusCodes)
      ? data.suggestedCusCodes.map(String)
      : [],
    resolved: data.resolved === true,
    resolvedAt: data.resolvedAt ? String(data.resolvedAt) : null,
    resolvedBy: data.resolvedBy ? String(data.resolvedBy) : null,
    createdAt: data.createdAt ? String(data.createdAt) : null,
  };
}

export async function getIdentityById(identityId: string) {
  const snap = await adminDb.collection(COLLECTION).doc(identityId).get();
  if (!snap.exists) return null;
  return serializeIdentity(snap.id, snap.data() as Record<string, unknown>);
}

export async function linkIdentityToCustomer(opts: {
  identityId: string;
  storeId: string;
  cusCode: string;
  uid: string;
  applyDemographics?: boolean;
}): Promise<void> {
  const ref = adminDb.collection(COLLECTION).doc(opts.identityId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('미매치 내역을 찾을 수 없습니다');
  const data = snap.data()!;
  if (data.storeId !== opts.storeId) throw new Error('매장 불일치');

  const customerRef = adminDb.collection('pos_customers').doc(`${opts.storeId}_${opts.cusCode}`);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) throw new Error('회원을 찾을 수 없습니다');

  if (opts.applyDemographics !== false) {
    await applyDemographicsToCustomer(opts.storeId, opts.cusCode, {
      gender: normalizeGender(String(data.gender || '')),
      ageRange: String(data.ageRange || ''),
      birthYear: data.birthYear != null ? Number(data.birthYear) : null,
    });
  }

  await ref.update({
    matchStatus: 'matched',
    matchedCusCode: opts.cusCode,
    resolved: true,
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy: opts.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function dismissIdentity(identityId: string, storeId: string, uid: string) {
  const ref = adminDb.collection(COLLECTION).doc(identityId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('내역 없음');
  if (snap.data()?.storeId !== storeId) throw new Error('매장 불일치');
  await ref.update({
    resolved: true,
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export function getIdentityPhoneDigits(data: Record<string, unknown>): string {
  if (!data.phoneEncrypted) return '';
  try {
    return normalizePhoneDigits(decrypt(String(data.phoneEncrypted)));
  } catch {
    return '';
  }
}
