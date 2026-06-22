/** 카카오톡·네이버 등 인앱 브라우저 — WebAuthn·Google 팝업 로그인 제한 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|Twitter/i.test(ua);
}

export function isKakaoTalkInApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /KAKAOTALK/i.test(navigator.userAgent || '');
}

export function openInExternalBrowser(href?: string): void {
  const url = href || (typeof window !== 'undefined' ? window.location.href : '');
  if (!url) return;

  if (/Android/i.test(navigator.userAgent)) {
    const stripped = url.replace(/^https?:\/\//, '');
    window.location.href =
      `intent://${stripped}#Intent;scheme=https;action=android.intent.action.VIEW;` +
      'category=android.intent.category.BROWSABLE;package=com.android.chrome;end';
    return;
  }

  void navigator.clipboard?.writeText(url).catch(() => {});
  window.open(url, '_blank', 'noopener,noreferrer');
}
