import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encrypt, decrypt } from '@/lib/encryption';
import {
  buildCookieHeader,
  type HometaxCookie,
  type HometaxSessionRecord,
  type HometaxSessionStatus,
} from '@/lib/purchase/hometaxTypes';
import { notifyHometaxSessionExpired } from '@/lib/purchase/hometaxNotify.server';

const LINK_CODE_TTL_MS = 5 * 60 * 1000;

function sessionDocId(storeId: string) {
  return storeId;
}

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === 'object' && v !== null && '_seconds' in v) {
    return new Date(Number((v as { _seconds: number })._seconds) * 1000).toISOString();
  }
  return null;
}

function genLinkCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createHometaxLinkCode(storeId: string, uid: string) {
  const code = genLinkCode();
  const expiresAt = Date.now() + LINK_CODE_TTL_MS;

  await adminDb.collection('hometax_link_codes').doc(code).set({
    storeId,
    uid,
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    code,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSec: Math.round(LINK_CODE_TTL_MS / 1000),
  };
}

async function consumeLinkCode(code: string): Promise<{ storeId: string; uid: string } | null> {
  const ref = adminDb.collection('hometax_link_codes').doc(code.toUpperCase());
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const expiresAt = Number(data.expiresAt || 0);
  if (!expiresAt || Date.now() > expiresAt) {
    await ref.delete().catch(() => {});
    return null;
  }

  await ref.delete().catch(() => {});
  return { storeId: String(data.storeId), uid: String(data.uid) };
}

export async function saveHometaxSession(params: {
  storeId: string;
  uid: string;
  cookies: HometaxCookie[];
  linkMethod: 'manual' | 'extension';
}) {
  if (params.cookies.length < 2) {
    throw new Error('유효한 홈택스 쿠키가 부족합니다. (최소 2개)');
  }

  const payload = encrypt(JSON.stringify(params.cookies));
  const ref = adminDb.collection('store_hometax_sessions').doc(sessionDocId(params.storeId));

  await ref.set({
    storeId: params.storeId,
    cookieJarEncrypted: payload,
    cookieCount: params.cookies.length,
    linkedAt: FieldValue.serverTimestamp(),
    linkedBy: params.uid,
    linkMethod: params.linkMethod,
    lastSyncStatus: 'pending',
    lastSyncMessage: '세션 저장됨 — 동기화 대기',
    lastExpiryNotifiedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  } satisfies Partial<HometaxSessionRecord>, { merge: true });

  return { cookieCount: params.cookies.length };
}

export async function saveHometaxSessionWithLinkCode(params: {
  linkCode: string;
  cookies: HometaxCookie[];
}) {
  const link = await consumeLinkCode(params.linkCode);
  if (!link) throw new Error('연결 코드가 만료되었거나 올바르지 않습니다.');

  return saveHometaxSession({
    storeId: link.storeId,
    uid: link.uid,
    cookies: params.cookies,
    linkMethod: 'extension',
  });
}

export async function deleteHometaxSession(storeId: string) {
  await adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId)).delete();
}

export async function loadHometaxCookies(storeId: string): Promise<HometaxCookie[] | null> {
  const snap = await adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId)).get();
  if (!snap.exists) return null;

  const encrypted = String(snap.data()?.cookieJarEncrypted || '');
  if (!encrypted) return null;

  try {
    const parsed = JSON.parse(decrypt(encrypted)) as HometaxCookie[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getHometaxSessionStatus(storeId: string): Promise<HometaxSessionStatus> {
  const snap = await adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId)).get();
  if (!snap.exists) {
    return {
      connected: false,
      cookieCount: 0,
      linkedAt: null,
      lastVerifiedAt: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncMessage: null,
      lastSyncImported: 0,
      autoSyncEnabled: false,
      syncLookbackDays: 90,
      sessionValid: null,
    };
  }

  const d = snap.data()!;
  return {
    connected: true,
    cookieCount: Number(d.cookieCount || 0),
    linkedAt: tsToIso(d.linkedAt),
    lastVerifiedAt: tsToIso(d.lastVerifiedAt),
    lastSyncAt: tsToIso(d.lastSyncAt),
    lastSyncStatus: String(d.lastSyncStatus || '') || null,
    lastSyncMessage: String(d.lastSyncMessage || '') || null,
    lastSyncImported: Number(d.lastSyncImported || 0),
    autoSyncEnabled: Boolean(d.autoSyncEnabled),
    syncLookbackDays: Number(d.syncLookbackDays || 90) || 90,
    sessionValid: d.lastSyncStatus === 'ok' ? true : (d.lastSyncStatus === 'expired' ? false : null),
  };
}

export async function verifyHometaxSession(storeId: string): Promise<{ valid: boolean; message: string }> {
  const cookies = await loadHometaxCookies(storeId);
  if (!cookies?.length) {
    return { valid: false, message: '저장된 세션이 없습니다.' };
  }

  const cookieHeader = buildCookieHeader(cookies);
  const ref = adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId));

  try {
    const res = await fetch('https://www.hometax.go.kr/permission.do?screenId=UTXPPBAC01', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (compatible; PitayaOS/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    });

    const body = await res.text();
    const valid = res.status === 200
      && !body.includes('pubcLogin')
      && !body.includes('로그인')
      && (body.includes('hometax') || body.includes('permission') || body.length > 500);

    await ref.set({
      lastVerifiedAt: FieldValue.serverTimestamp(),
      lastSyncStatus: valid ? 'ok' : 'expired',
      lastSyncMessage: valid ? '세션 유효' : '세션이 만료되었습니다. 다시 연결하세요.',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!valid) {
      await notifyHometaxSessionExpired(storeId);
    }

    return {
      valid,
      message: valid ? '홈택스 세션이 유효합니다.' : '세션이 만료되었습니다. 홈택스에서 다시 로그인 후 연결하세요.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '검증 실패';
    await ref.set({
      lastVerifiedAt: FieldValue.serverTimestamp(),
      lastSyncStatus: 'error',
      lastSyncMessage: msg,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { valid: false, message: `세션 검증 오류: ${msg}` };
  }
}

export async function markHometaxSyncResult(
  storeId: string,
  result: { ok: boolean; message: string; importedTotal: number },
) {
  await adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId)).set({
    lastSyncAt: FieldValue.serverTimestamp(),
    lastSyncStatus: result.ok ? 'ok' : 'error',
    lastSyncMessage: result.message,
    lastSyncImported: result.importedTotal,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function updateHometaxSyncSettings(
  storeId: string,
  settings: { autoSyncEnabled?: boolean; syncLookbackDays?: number },
) {
  const ref = adminDb.collection('store_hometax_sessions').doc(sessionDocId(storeId));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('홈택스 세션이 연결되어 있지 않습니다.');

  const patch: Partial<HometaxSessionRecord> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof settings.autoSyncEnabled === 'boolean') {
    patch.autoSyncEnabled = settings.autoSyncEnabled;
  }
  if (settings.syncLookbackDays != null) {
    const days = Math.min(365, Math.max(7, Math.round(Number(settings.syncLookbackDays) || 90)));
    patch.syncLookbackDays = days;
  }

  await ref.set(patch, { merge: true });
  return getHometaxSessionStatus(storeId);
}

export async function listHometaxAutoSyncStores(): Promise<Array<{
  storeId: string;
  syncLookbackDays: number;
}>> {
  const snap = await adminDb.collection('store_hometax_sessions')
    .where('autoSyncEnabled', '==', true)
    .get();

  return snap.docs.map(d => ({
    storeId: d.id,
    syncLookbackDays: Number(d.data().syncLookbackDays || 90) || 90,
  }));
}
