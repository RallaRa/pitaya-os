import { getDhnConfig, type DhnConfig } from './config';

export interface DhnAlimtalkParams {
  templateCode: string;
  recipientPhone: string;
  recipientName?: string;
  /** #{추가정보1} ~ #{추가정보10} 템플릿 변수 */
  variables?: Partial<Record<`add${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string>>;
  /** 버튼 URL 변수 kakao_url1_1 ~ kakao_url5_2 */
  buttonUrls?: Partial<Record<string, string>>;
  smsFallback?: boolean;
}

export interface DhnSendResult {
  success: boolean;
  responseCode: string;
  responseMessage: string;
}

function buildRequestBody(config: DhnConfig, params: DhnAlimtalkParams): Record<string, string> {
  const body: Record<string, string> = {
    tmp_number: params.templateCode,
    kakao_sender: config.senderPhone,
    kakao_phone: params.recipientPhone,
    kakao_2nd: (params.smsFallback ?? config.smsFallback) ? 'Y' : 'N',
  };

  if (params.recipientName) body.kakao_name = params.recipientName;

  for (let i = 1; i <= 10; i++) {
    const key = `add${i}` as const;
    body[`kakao_add${i}`] = params.variables?.[key] || '';
  }

  if (params.buttonUrls) {
    for (const [urlKey, urlVal] of Object.entries(params.buttonUrls)) {
      if (urlVal) body[urlKey] = urlVal;
    }
  }

  return body;
}

export async function sendDhnAlimtalk(
  params: DhnAlimtalkParams,
  configOverride?: DhnConfig | null,
): Promise<DhnSendResult> {
  const config = configOverride ?? getDhnConfig({ defaultTemplateCode: params.templateCode });
  if (!config) {
    return { success: false, responseCode: 'CONFIG', responseMessage: 'DHN API 설정이 없습니다 (DHN_SENDER_PROFILE_KEY, DHN_SENDER_PHONE)' };
  }

  const templateCode = params.templateCode || config.defaultTemplateCode;
  if (!templateCode) {
    return { success: false, responseCode: 'CONFIG', responseMessage: '템플릿 코드가 필요합니다 (DHN_TEMPLATE_CODE)' };
  }

  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: config.senderProfileKey,
      },
      body: JSON.stringify(buildRequestBody(config, { ...params, templateCode })),
    });

    const text = await res.text();
    let parsed: { response_code?: string; response_message?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        success: false,
        responseCode: String(res.status),
        responseMessage: text.slice(0, 200) || 'Invalid response',
      };
    }

    const responseCode = String(parsed.response_code ?? res.status);
    const responseMessage = String(parsed.response_message ?? text);
    return {
      success: responseCode === '0',
      responseCode,
      responseMessage,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { success: false, responseCode: 'NETWORK', responseMessage: msg };
  }
}

export async function sendDhnAlimtalkSafe(params: DhnAlimtalkParams): Promise<DhnSendResult> {
  return sendDhnAlimtalk(params);
}
