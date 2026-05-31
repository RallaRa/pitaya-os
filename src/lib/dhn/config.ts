/**
 * 대형네트웍스(DHN) 알림톡 API 설정
 * API 문서: http://dhncorp.co.kr/sub/API_2020_v1.pdf
 * 엔드포인트: POST http://o2omsg.com/bizmsgapi/alimtalk2nd
 */

export const DHN_DEFAULT_API_URL = 'http://o2omsg.com/bizmsgapi/alimtalk2nd';

export interface DhnConfig {
  apiUrl: string;
  senderProfileKey: string;
  senderPhone: string;
  defaultTemplateCode: string;
  smsFallback: boolean;
}

export function getDhnConfig(overrides?: Partial<Pick<DhnConfig, 'defaultTemplateCode' | 'smsFallback'>>): DhnConfig | null {
  const senderProfileKey = process.env.DHN_SENDER_PROFILE_KEY?.trim() || '';
  const senderPhone = process.env.DHN_SENDER_PHONE?.trim() || '';
  const defaultTemplateCode =
    overrides?.defaultTemplateCode?.trim() ||
    process.env.DHN_TEMPLATE_CODE?.trim() ||
    '';

  if (!senderProfileKey || !senderPhone) return null;

  return {
    apiUrl: process.env.DHN_API_URL?.trim() || DHN_DEFAULT_API_URL,
    senderProfileKey,
    senderPhone,
    defaultTemplateCode,
    smsFallback: overrides?.smsFallback ?? (process.env.DHN_SMS_FALLBACK !== 'N'),
  };
}

export function isDhnConfigured(): boolean {
  return getDhnConfig() !== null;
}
