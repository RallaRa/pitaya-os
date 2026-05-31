import { buildSolapiAuthHeader } from './auth';
import { getSolapiConfig, type SolapiConfig } from './config';

export interface SolapiAlimtalkMessage {
  to: string;
  variables?: Record<string, string>;
  smsFallback?: boolean;
}

export interface SolapiSendResult {
  success: boolean;
  responseCode: string;
  responseMessage: string;
  groupId?: string;
  failedIndexes?: number[];
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildMessagePayload(
  config: SolapiConfig,
  msg: SolapiAlimtalkMessage,
  templateId: string,
) {
  const disableSms = msg.smsFallback === false || !config.smsFallback;
  const kakaoOptions: Record<string, unknown> = {
    pfId: config.pfId,
    templateId,
    disableSms,
    variables: msg.variables || {},
  };

  return {
    to: phoneDigits(msg.to),
    from: phoneDigits(config.senderPhone),
    kakaoOptions,
  };
}

export async function sendSolapiAlimtalkBatch(
  messages: SolapiAlimtalkMessage[],
  templateId: string,
  configOverride?: SolapiConfig | null,
): Promise<SolapiSendResult> {
  const config = configOverride ?? getSolapiConfig({ templateId });
  if (!config) {
    return {
      success: false,
      responseCode: 'CONFIG',
      responseMessage: 'SOLAPI 설정이 없습니다 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PF_ID, SOLAPI_SENDER_PHONE)',
    };
  }

  const tid = templateId || config.templateId;
  if (!tid) {
    return {
      success: false,
      responseCode: 'CONFIG',
      responseMessage: '템플릿 ID가 필요합니다 (SOLAPI_TEMPLATE_ID)',
    };
  }

  if (!messages.length) {
    return { success: true, responseCode: '0', responseMessage: 'empty batch' };
  }

  try {
    const auth = buildSolapiAuthHeader(config.apiKey, config.apiSecret);
    const res = await fetch(`${config.baseUrl}/messages/v4/send`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map(m => buildMessagePayload(config, m, tid)),
      }),
    });

    const parsed = await res.json().catch(() => ({})) as Record<string, unknown>;
    const groupId = String(parsed.groupId || '');

    if (!res.ok) {
      const errMsg = String(
        parsed.errorMessage ||
        parsed.statusMessage ||
        parsed.message ||
        res.statusText,
      );
      return {
        success: false,
        responseCode: String(parsed.errorCode || parsed.statusCode || res.status),
        responseMessage: errMsg,
        groupId,
      };
    }

    const failedMessageList = Array.isArray(parsed.failedMessageList)
      ? parsed.failedMessageList
      : [];
    const failedIndexes = failedMessageList.map((_, i) => i);

    if (failedMessageList.length > 0) {
      const first = failedMessageList[0] as Record<string, unknown>;
      return {
        success: false,
        responseCode: String(first.statusCode || 'PARTIAL'),
        responseMessage: String(first.statusMessage || '일부 발송 실패'),
        groupId,
        failedIndexes,
      };
    }

    return {
      success: true,
      responseCode: '0',
      responseMessage: String(parsed.statusMessage || 'success'),
      groupId,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { success: false, responseCode: 'NETWORK', responseMessage: msg };
  }
}
