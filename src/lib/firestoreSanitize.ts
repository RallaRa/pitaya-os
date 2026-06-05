/** Firestore는 undefined 필드를 허용하지 않음 — 저장·캐시 전 정리 */

export function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sourceStatus(
  status: string,
  detail?: string | null,
): { status: string; detail?: string } {
  const entry: { status: string; detail?: string } = { status };
  if (detail != null && String(detail).trim() !== '') {
    entry.detail = String(detail).trim();
  }
  return entry;
}
