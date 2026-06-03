import { KAKAO_APP_BASE_URL } from './config';

/** 카카오 feed 메모 상단 이미지 (800×400, HTTPS 공개 URL) */
export const KAKAO_DEFAULT_FEED_IMAGE_PATH = '/images/kakao-feed.png';

export function getDefaultKakaoNotifyImageUrl(): string {
  return `${KAKAO_APP_BASE_URL}${KAKAO_DEFAULT_FEED_IMAGE_PATH}`;
}

/**
 * 알림 유형별 이미지 (선택).
 * - 기본: Pitaya 로고 카드
 * - imageUrl 직접 지정 시 sendKakaoNotify({ imageUrl }) 우선
 * - 매장 로고 등은 HTTPS 공개 JPG/PNG, 가로 2:1(800×400) 권장
 */
export function getKakaoNotifyImageUrl(type?: string): string {
  switch (type) {
    case 'sales_hourly_rise':
    case 'sales_hourly_drop':
    case 'public_order':
    default:
      return getDefaultKakaoNotifyImageUrl();
  }
}
