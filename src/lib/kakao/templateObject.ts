import { KAKAO_APP_BASE_URL } from './config';
import { getDefaultKakaoNotifyImageUrl, getKakaoNotifyImageUrl } from './notifyImage';
import type { KakaoListItem } from './salesAlertKakao';

export type KakaoMemoTemplate = 'feed' | 'list' | 'text';

export interface KakaoLink {
  web_url: string;
  mobile_web_url: string;
}

export interface BuildKakaoTemplateInput {
  template?: KakaoMemoTemplate;
  title: string;
  message: string;
  link?: string;
  imageUrl?: string;
  notifyType?: string;
  listHeader?: string;
  listItems?: KakaoListItem[];
  buttonTitle?: string;
}

function kakaoLink(webUrl: string): KakaoLink {
  return { web_url: webUrl, mobile_web_url: webUrl };
}

export function resolveKakaoWebUrl(link?: string): string {
  if (!link) return `${KAKAO_APP_BASE_URL}/dashboard`;
  if (link.startsWith('http')) return link;
  return `${KAKAO_APP_BASE_URL}${link.startsWith('/') ? '' : '/'}${link}`;
}

export function buildKakaoTemplateObject(input: BuildKakaoTemplateInput): Record<string, unknown> {
  const webUrl = resolveKakaoWebUrl(input.link);
  const link = kakaoLink(webUrl);
  const template = input.template || 'feed';
  const buttonTitle = input.buttonTitle || 'Pitaya OS 열기';

  if (template === 'list') {
    const items = (input.listItems || []).slice(0, 3);
    const contents = (items.length >= 2 ? items : [
      { title: input.title, description: input.message.slice(0, 80) },
      { title: '상세', description: '매출 보고서에서 확인' },
    ]).map(item => ({
      title: item.title.slice(0, 200),
      description: (item.description || '').slice(0, 200),
      link,
    }));

    return {
      object_type: 'list',
      header_title: (input.listHeader || input.title).slice(0, 200),
      header_link: link,
      contents,
      buttons: [{ title: buttonTitle.slice(0, 8), link }],
    };
  }

  if (template === 'text') {
    const text = [input.title, input.message].filter(Boolean).join('\n').slice(0, 200);
    return {
      object_type: 'text',
      text,
      link,
      buttons: [{ title: buttonTitle.slice(0, 8), link }],
    };
  }

  const feedImage = input.imageUrl
    || getKakaoNotifyImageUrl(input.notifyType)
    || getDefaultKakaoNotifyImageUrl();

  return {
    object_type: 'feed',
    content: {
      title: input.title,
      description: input.message,
      image_url: feedImage,
      image_width: 800,
      image_height: 400,
      link,
    },
    buttons: [{ title: buttonTitle.slice(0, 8), link }],
  };
}
