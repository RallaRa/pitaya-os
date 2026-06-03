'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: Record<string, unknown>) => void;
      };
    };
  }
}

interface KakaoShareProps {
  title: string;
  description: string;
  imageUrl?: string;
  link: string;
  buttonText?: string;
}

export default function KakaoShare({
  title,
  description,
  imageUrl,
  link,
  buttonText = '공유하기',
}: KakaoShareProps) {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

  useEffect(() => {
    if (!jsKey) return;

    const existing = document.querySelector('script[data-kakao-share-sdk]');
    if (existing) {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(jsKey);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    script.async = true;
    script.dataset.kakaoShareSdk = 'true';
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(jsKey);
    };
    document.head.appendChild(script);
  }, [jsKey]);

  const share = () => {
    if (!window.Kakao?.Share) {
      alert('카카오 SDK가 준비되지 않았습니다.');
      return;
    }
    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        imageUrl: imageUrl || `${appUrl}/images/kakao-feed.png`,
        link: { webUrl: link, mobileWebUrl: link },
      },
      buttons: [{
        title: buttonText,
        link: { webUrl: link, mobileWebUrl: link },
      }],
    });
  };

  return (
    <button
      type="button"
      onClick={share}
      className="flex items-center gap-2 px-4 py-2 bg-[#FEE500] hover:bg-[#F5DC00] text-gray-900 rounded-lg font-semibold text-sm"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3C6.477 3 2 6.477 2 11c0 2.738 1.5 5.163 3.813 6.75L5 21l3.563-1.875C9.625 19.375 10.781 19.5 12 19.5c5.523 0 10-3.477 10-8.5S17.523 3 12 3z" />
      </svg>
      {buttonText}
    </button>
  );
}
