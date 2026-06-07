/** 터치ID·Face ID·Windows Hello 등 플랫폼 생체인증 가능 여부 */
export async function canUsePlatformAuthenticator(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function guessDeviceLabel(): string {
  if (typeof navigator === 'undefined') return '브라우저';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'PC 브라우저';
}
