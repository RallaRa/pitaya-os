/** fetch 응답 JSON 안전 파싱 — 빈 body 시 "Unexpected end of JSON input" 방지 */
export async function safeFetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ res: Response; data: T; parseError?: string }> {
  const res = await fetch(input, init);
  const text = await res.text();

  if (!text.trim()) {
    return {
      res,
      data: {
        ok: false,
        error: `HTTP ${res.status} — 서버 빈 응답 (타임아웃·배포 미반영·502 가능)`,
      } as T,
      parseError: 'empty body',
    };
  }

  try {
    return { res, data: JSON.parse(text) as T };
  } catch {
    return {
      res,
      data: { ok: false, error: text.slice(0, 300) } as T,
      parseError: 'invalid json',
    };
  }
}
