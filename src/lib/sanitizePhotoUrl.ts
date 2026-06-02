/** 공개주문 photoUrl — http(s) URL만 허용, AI placeholder 등 제거 */
export function sanitizePhotoUrl(url: unknown): string {
  const s = String(url || '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return '';
  if (/[\[\]사진분석]|제공된\s*URL/i.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return s;
  } catch {
    return '';
  }
}
