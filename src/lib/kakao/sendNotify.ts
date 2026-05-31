import { adminDb } from '@/lib/firebase/admin';
import { getValidKakaoToken } from './tokenManager';
import { KAKAO_APP_BASE_URL } from './config';

interface KakaoNotifyOptions {
  userId: string;
  title: string;
  message: string;
  link?: string;
  imageUrl?: string;
}

export async function sendKakaoNotify({
  userId,
  title,
  message,
  link,
  imageUrl,
}: KakaoNotifyOptions): Promise<{ success: boolean; error?: string }> {
  const token = await getValidKakaoToken(userId);
  if (!token) return { success: false, error: '카카오 로그인 필요' };

  const webUrl = link || `${KAKAO_APP_BASE_URL}/dashboard`;
  const templateObject = {
    object_type: 'feed',
    content: {
      title,
      description: message,
      image_url: imageUrl || `${KAKAO_APP_BASE_URL}/icon-192.png`,
      image_width: 800,
      image_height: 400,
      link: {
        web_url: webUrl,
        mobile_web_url: webUrl,
      },
    },
    buttons: [{
      title: 'Pitaya OS 열기',
      link: {
        web_url: webUrl,
        mobile_web_url: webUrl,
      },
    }],
  };

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
    return { success: false, error: data.msg || '카카오 알림 발송 실패' };
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
    const isManager = ['owner', 'master', 'admin'].includes(role || '') ||
      ['owner', 'master', 'admin'].includes(groupId || '');
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
