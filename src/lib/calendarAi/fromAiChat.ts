import { parseEventMessage } from '@/lib/calendarAi/parseEventMessage';
import {
  createCalendarEvent,
  formatCalendarCreatedMessage,
} from '@/lib/calendarAi/createCalendarEvent';
import type { CalendarEventFromChatResult } from '@/lib/calendarAi/types';

/** AI 대화 입력 채널 — 일반 캘린더 일정 등록 */
export async function tryCreateCalendarEventFromAiChat(opts: {
  storeId: string;
  createdBy: string;
  message: string;
}): Promise<CalendarEventFromChatResult> {
  const { storeId, createdBy, message } = opts;
  if (!storeId || !createdBy?.trim()) {
    return { created: false, parseError: '매장·사용자 정보 없음' };
  }

  const parsed = await parseEventMessage(message);
  if (!parsed) {
    return { created: false };
  }

  try {
    const result = await createCalendarEvent({
      storeId,
      createdBy,
      title: parsed.title,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      allDay: parsed.allDay,
      description: parsed.description,
      location: parsed.location,
      source: 'ai_chat',
    });
    return { created: true, result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { created: false, parseError: msg };
  }
}

export function buildCalendarChatAppendix(
  chatResult: CalendarEventFromChatResult,
): string {
  if (!chatResult.created || !chatResult.result) return '';
  if (chatResult.parseError) {
    return `\n\n⚠️ 캘린더 등록 실패: ${chatResult.parseError}`;
  }
  return '\n\n' + formatCalendarCreatedMessage(chatResult.result);
}
