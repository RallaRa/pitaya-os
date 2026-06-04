import { parseExpiryMessage } from '@/lib/expiryReminder/parseExpiryMessage';
import {
  createExpiryReminder,
  formatExpiryCreatedMessage,
} from '@/lib/expiryReminder/createExpiryReminder';
import type { ExpiryReminderFromChatResult } from '@/lib/expiryReminder/types';

/** AI 대화 입력 채널 — 추후 manual/api 채널과 동일 코어 사용 */
export async function tryCreateExpiryFromAiChat(opts: {
  storeId: string;
  createdBy: string;
  message: string;
}): Promise<ExpiryReminderFromChatResult> {
  const { storeId, createdBy, message } = opts;
  if (!storeId || !createdBy?.trim()) {
    return { created: false, parseError: '매장·사용자 정보 없음' };
  }

  const parsed = await parseExpiryMessage(message);
  if (!parsed) {
    return { created: false };
  }

  try {
    const result = await createExpiryReminder({
      storeId,
      createdBy,
      itemName: parsed.itemName,
      expiryDate: parsed.expiryDate,
      source: 'ai_chat',
    });
    return { created: true, result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { created: false, parseError: msg };
  }
}

export function buildExpiryChatAppendix(
  chatResult: ExpiryReminderFromChatResult,
): string {
  if (!chatResult.created || !chatResult.result) return '';
  return '\n\n' + formatExpiryCreatedMessage(chatResult.result);
}
