import { createHmac, randomBytes } from 'node:crypto';

const SALT_ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function genSalt(size = 32): string {
  const bytes = randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i++) {
    out += SALT_ALPHABET[bytes[i] % SALT_ALPHABET.length];
  }
  return out;
}

/** SOLAPI HMAC-SHA256 Authorization 헤더 생성 */
export function buildSolapiAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = genSalt();
  const hmacData = date + salt;
  const signature = createHmac('sha256', apiSecret).update(hmacData).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
