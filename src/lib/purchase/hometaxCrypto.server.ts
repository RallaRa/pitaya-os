import { createHmac } from 'crypto';

/** hometaxbot crypto.py k1~k4 포팅 — wqAction NTS postfix 생성 */

const k1Cache = new Map<string, string[]>();

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}_${m}_${day}`;
}

async function fetchK1Values(): Promise<string[]> {
  const today = todayKey();
  const cached = k1Cache.get(today);
  if (cached) return cached;

  const res = await fetch(`https://hometax.go.kr/js/comm/ui/common_te-min.js?postfix=${today}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PitayaOS/1.0)' },
  });
  const body = await res.text();
  const match = body.match(
    /testVal\s*=\s*\[\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*,\s*"([A-Za-z0-9]{30,60})"\s*\]/,
  );
  if (!match) {
    throw new Error('홈택스 common_te-min.js에서 testVal 추출 실패');
  }

  const values = match.slice(1, 8);
  k1Cache.set(today, values);
  return values;
}

function k1(second: number, values: string[]): string {
  return values[second % 7];
}

function k2(payload: string, testVal: string): string {
  const signature = createHmac('sha256', testVal).update(payload, 'utf8').digest('base64');
  return signature.replace(/[^0-9a-zA-Z]/g, '');
}

export function k4(payload: string, second: number, userId: string, k1Values: string[]): string {
  return k2(payload + userId, k1(second, k1Values));
}

export function jsonMinified(obj: unknown): string {
  return JSON.stringify(obj);
}

export async function buildNtsPostfix(json: unknown, userId: string): Promise<string> {
  const second = new Date().getSeconds();
  const payload = jsonMinified(json);
  const k1Values = await fetchK1Values();
  const hash = k4(payload, second, userId, k1Values);
  return `${payload} nts>${second + 11}${hash}${String(second).padStart(2, '0')}`;
}
