/**
 * SOLAPI 알림톡 설정
 * 문서: https://solapi.com/developers/api/messages-ata
 * 발송: POST https://api.solapi.com/messages/v4/send
 */

export const SOLAPI_DEFAULT_BASE_URL = 'https://api.solapi.com';

export interface SolapiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  pfId: string;
  templateId: string;
  senderPhone: string;
  smsFallback: boolean;
}

export function getSolapiConfig(
  overrides?: Partial<Pick<SolapiConfig, 'templateId' | 'smsFallback'>>,
): SolapiConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim() || '';
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim() || '';
  const pfId = process.env.SOLAPI_PF_ID?.trim() || '';
  const senderPhone = process.env.SOLAPI_SENDER_PHONE?.trim() || '';
  const templateId =
    overrides?.templateId?.trim() ||
    process.env.SOLAPI_TEMPLATE_ID?.trim() ||
    '';

  if (!apiKey || !apiSecret || !pfId || !senderPhone) return null;

  return {
    apiKey,
    apiSecret,
    baseUrl: process.env.SOLAPI_BASE_URL?.trim() || SOLAPI_DEFAULT_BASE_URL,
    pfId,
    templateId,
    senderPhone,
    smsFallback: overrides?.smsFallback ?? (process.env.SOLAPI_SMS_FALLBACK !== 'N'),
  };
}

export function isSolapiConfigured(): boolean {
  return getSolapiConfig() !== null;
}
