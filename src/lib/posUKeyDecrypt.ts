/**
 * POS Customer_Info.en_uKey2 복호화
 * 키 발견 후 POSON_UKEY2_KEY / POSON_UKEY2_ALGO env 설정
 */
import crypto from 'crypto';

export type PosUKeyAlgo = 'aes-128-ecb' | 'aes-128-cbc' | '3des-ecb';

export interface PosUKeyConfig {
  algo: PosUKeyAlgo;
  key: Buffer;
  iv?: Buffer;
}

let cached: PosUKeyConfig | null = null;

function loadConfig(): PosUKeyConfig | null {
  if (cached) return cached;

  const keyHex = process.env.POSON_UKEY2_KEY_HEX;
  const keyB64 = process.env.POSON_UKEY2_KEY_B64;
  const keyStr = process.env.POSON_UKEY2_KEY;
  const algo = (process.env.POSON_UKEY2_ALGO || 'aes-128-ecb') as PosUKeyAlgo;

  let key: Buffer | null = null;
  if (keyHex) key = Buffer.from(keyHex, 'hex');
  else if (keyB64) key = Buffer.from(keyB64, 'base64');
  else if (keyStr) key = Buffer.from(keyStr.padEnd(16, '\0').slice(0, 16), 'utf8');

  if (!key || key.length < 8) return null;

  const ivHex = process.env.POSON_UKEY2_IV_HEX;
  const iv = ivHex ? Buffer.from(ivHex, 'hex') : Buffer.alloc(16, 0);

  cached = { algo, key, iv };
  return cached;
}

/** en_uKey2 Base64 → 원본 전화번호 (11자리). 키 미설정 시 null */
export function decryptEnUKey2(enUKey2?: string | null): string | null {
  if (!enUKey2) return null;
  const cfg = loadConfig();
  if (!cfg) return null;

  try {
    const buf = Buffer.from(enUKey2, 'base64');
    let plain: Buffer;

    if (cfg.algo === 'aes-128-ecb') {
      const d = crypto.createDecipheriv('aes-128-ecb', cfg.key.slice(0, 16), null);
      d.setAutoPadding(true);
      plain = Buffer.concat([d.update(buf), d.final()]);
    } else if (cfg.algo === 'aes-128-cbc') {
      const d = crypto.createDecipheriv('aes-128-cbc', cfg.key.slice(0, 16), cfg.iv!);
      d.setAutoPadding(true);
      plain = Buffer.concat([d.update(buf), d.final()]);
    } else if (cfg.algo === '3des-ecb') {
      const k = cfg.key.length >= 24 ? cfg.key.slice(0, 24) : Buffer.concat([cfg.key.slice(0, 16), cfg.key.slice(0, 8)]);
      const d = crypto.createDecipheriv('des-ede3', k, null);
      d.setAutoPadding(true);
      plain = Buffer.concat([d.update(buf), d.final()]);
    } else {
      return null;
    }

    const digits = plain.toString('utf8').replace(/\0+$/, '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('01') ? digits : null;
  } catch {
    return null;
  }
}

/** 키 후보 검증 — 알려진 (enc, plain) 쌍으로 테스트 */
export function verifyPosUKeyConfig(
  cfg: PosUKeyConfig,
  pairs: { enc: string; plain: string }[],
): boolean {
  cached = cfg;
  return pairs.every(p => decryptEnUKey2(p.enc) === p.plain);
}

export function isPosUKeyDecryptReady(): boolean {
  return loadConfig() !== null;
}
