import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const TTL_MS = 5 * 60 * 1000;

function secret() {
  return process.env.CAPS_STREAM_SECRET
    || process.env.ENCRYPTION_KEY
    || process.env.CRON_SECRET
    || 'caps-stream-dev-only';
}

export function issueCapsStreamTicket(cameraId: string, uid: string): string {
  const exp = Date.now() + TTL_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${cameraId}|${uid}|${exp}|${nonce}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

export function verifyCapsStreamTicket(ticket: string, cameraId: string): boolean {
  try {
    const decoded = Buffer.from(ticket, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 5) return false;
    const [cam, , expStr, , sig] = parts;
    if (cam !== cameraId) return false;
    if (Date.now() > Number(expStr)) return false;
    const payload = `${parts[0]}|${parts[1]}|${parts[2]}|${parts[3]}`;
    const expected = createHmac('sha256', secret()).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
