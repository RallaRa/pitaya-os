import { adminDb } from '@/lib/firebase/admin';
import { KAKAO_APP_BASE_URL } from './config';
import { getDefaultKakaoNotifyImageUrl } from './notifyImage';

/** 매장별 고정 로고 (주문 알림 feed). Firestore logo보다 우선 */
const STATIC_STORE_KAKAO_LOGOS: Record<string, string> = {
  'STR-1779194754785': '/images/stores/gangseo-logo.png',
};

interface StoreImageEntry {
  fileUrl?: string;
  mimeType?: string;
  uploadedAt?: string;
}

/** Firestore stores.images.logo → 카카오 feed용 HTTPS URL (없으면 기본 Pitaya 카드) */
export async function getStoreLogoKakaoImageUrl(storeId: string): Promise<string> {
  if (!storeId) return getDefaultKakaoNotifyImageUrl();

  const staticPath = STATIC_STORE_KAKAO_LOGOS[storeId];
  if (staticPath) {
    return `${KAKAO_APP_BASE_URL}${staticPath}`;
  }

  try {
    const doc = await adminDb.collection('stores').doc(storeId).get();
    if (!doc.exists) return getDefaultKakaoNotifyImageUrl();

    const list = doc.data()?.images?.logo;
    if (!Array.isArray(list) || list.length === 0) return getDefaultKakaoNotifyImageUrl();

    const sorted = [...list].sort((a: StoreImageEntry, b: StoreImageEntry) => {
      const ta = String(a.uploadedAt || '');
      const tb = String(b.uploadedAt || '');
      return tb.localeCompare(ta);
    });

    const url = String(sorted[0]?.fileUrl || '').trim();
    if (!url.startsWith('https://')) return getDefaultKakaoNotifyImageUrl();

    const mime = String(sorted[0]?.mimeType || '');
    if (mime && !mime.startsWith('image/')) return getDefaultKakaoNotifyImageUrl();

    return url;
  } catch {
    return getDefaultKakaoNotifyImageUrl();
  }
}
