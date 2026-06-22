import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendKakaoNotifySafe, type KakaoNotifyOptions } from '@/lib/kakao/sendNotify';
import { getDefaultKakaoNotifyImageUrl } from '@/lib/kakao/notifyImage';
import { getStoreLogoKakaoImageUrl } from '@/lib/kakao/storeLogo';
import type { KakaoMemoTemplate } from '@/lib/kakao/templateObject';
import type { KakaoListItem } from '@/lib/kakao/salesAlertKakao';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

interface NotifyOptions {
  title: string;
  message: string;
  link: string;
  type?: string;
  storeId?: string;
  imageUrl?: string;
  kakaoTemplate?: KakaoMemoTemplate;
  listHeader?: string;
  listItems?: KakaoListItem[];
  buttonTitle?: string;
}

async function resolveKakaoPayload(opts: NotifyOptions): Promise<Partial<KakaoNotifyOptions>> {
  const link = opts.link.startsWith('http') ? opts.link : `${APP_BASE}${opts.link}`;
  const type = opts.type || 'system';

  if (type === 'sales_hourly_drop' || type === 'sales_hourly_rise') {
    return {
      template: 'list',
      link,
      listHeader: opts.listHeader || opts.title,
      listItems: opts.listItems,
      buttonTitle: opts.buttonTitle || '매출 보고서',
      notifyType: type,
    };
  }

  if (type === 'pii_unlock_request') {
    return {
      template: 'text',
      link,
      buttonTitle: opts.buttonTitle || '지문 승인',
      notifyType: type,
    };
  }

  if (type === 'public_order') {
    const imageUrl = opts.imageUrl
      || (opts.storeId ? await getStoreLogoKakaoImageUrl(opts.storeId) : undefined)
      || getDefaultKakaoNotifyImageUrl();
    return {
      template: 'feed',
      link,
      imageUrl,
      buttonTitle: opts.buttonTitle || '주문 확인',
      notifyType: type,
    };
  }

  return {
    template: opts.kakaoTemplate || 'feed',
    link,
    imageUrl: opts.imageUrl,
    notifyType: type,
    listHeader: opts.listHeader,
    listItems: opts.listItems,
    buttonTitle: opts.buttonTitle,
  };
}

export async function notifyUser(targetUid: string, opts: NotifyOptions) {
  if (!targetUid) return;

  await adminDb.collection('notifications').add({
    targetUid,
    senderUid: '',
    senderName: 'Pitaya OS',
    type: opts.type || 'system',
    title: opts.title,
    message: opts.message,
    link: opts.link,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  const kakaoOpts = await resolveKakaoPayload(opts);

  await sendKakaoNotifySafe({
    userId: targetUid,
    title: opts.title,
    message: opts.message,
    ...kakaoOpts,
  });
}

export async function getKakaoLinkedActiveUserIds(): Promise<string[]> {
  const mapSnap = await adminDb.collection('user_store_map')
    .where('status', '==', 'active')
    .get();

  const uids = [...new Set(mapSnap.docs.map(d => d.data().uid as string).filter(Boolean))];
  const linked: string[] = [];

  await Promise.all(uids.map(async (uid) => {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data()?.kakaoAccessToken) {
      linked.push(uid);
    }
  }));

  return linked;
}
