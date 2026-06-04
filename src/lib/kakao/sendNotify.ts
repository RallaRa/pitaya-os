import { adminDb } from '@/lib/firebase/admin';
import { normalizeGroupId, normalizeRole } from '@/lib/roleMapping';
import { getValidKakaoToken } from './tokenManager';
import {
  buildKakaoTemplateObject,
  type BuildKakaoTemplateInput,
  type KakaoMemoTemplate,
} from './templateObject';
import type { KakaoListItem } from './salesAlertKakao';

export interface KakaoNotifyOptions extends BuildKakaoTemplateInput {
  userId: string;
  template?: KakaoMemoTemplate;
  listItems?: KakaoListItem[];
}

export async function sendKakaoNotify(opts: KakaoNotifyOptions): Promise<{ success: boolean; error?: string }> {
  const token = await getValidKakaoToken(opts.userId);
  if (!token) return { success: false, error: '카카오 로그인 필요' };

  const templateObject = buildKakaoTemplateObject(opts);

  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      template_object: JSON.stringify(templateObject),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.result_code !== 0) {
    const errMsg = data.msg || data.message || `HTTP ${res.status}`;
    console.error('[kakao notify] send failed', { userId: opts.userId, status: res.status, data });
    return { success: false, error: errMsg };
  }
  return { success: true };
}

export async function sendKakaoNotifySafe(opts: KakaoNotifyOptions) {
  try {
    await sendKakaoNotify(opts);
  } catch (e) {
    console.error('[kakao notify]', e);
  }
}

export async function findKakaoNotifyUserForStore(storeId: string): Promise<string | null> {
  const mapSnap = await adminDb.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();

  for (const doc of mapSnap.docs) {
    const { uid, role, groupId } = doc.data();
    const isManager = ['superuser', 'admin'].includes(normalizeRole(role || '')) ||
      ['superuser', 'admin'].includes(normalizeGroupId(groupId || ''));
    if (!isManager) continue;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data()?.kakaoAccessToken) {
      return uid;
    }
  }

  const fallbackUid = mapSnap.docs[0]?.data()?.uid;
  if (fallbackUid) {
    const userDoc = await adminDb.collection('users').doc(fallbackUid).get();
    if (userDoc.exists && userDoc.data()?.kakaoAccessToken) return fallbackUid;
  }

  return null;
}

export async function sendKakaoNotifyToStore(
  storeId: string,
  opts: Omit<KakaoNotifyOptions, 'userId'>,
) {
  const userId = await findKakaoNotifyUserForStore(storeId);
  if (!userId) return;
  await sendKakaoNotifySafe({ userId, ...opts });
}
