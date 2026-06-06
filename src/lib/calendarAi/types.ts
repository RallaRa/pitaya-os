export type CalendarEventSource = 'ai_chat' | 'manual' | 'api';

export interface ParsedCalendarEventInput {
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
  description?: string | null;
  location?: string | null;
}

export interface CreateCalendarEventResult {
  id: string;
  title: string;
  startDate: string;
  startTime: string | null;
  allDay: boolean;
}

export interface CalendarEventFromChatResult {
  created: boolean;
  result?: CreateCalendarEventResult;
  parseError?: string;
}
